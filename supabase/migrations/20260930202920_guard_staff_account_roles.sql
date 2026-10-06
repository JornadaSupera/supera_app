-- Conta de paciente ou de acompanhante nao vira profissional nem
-- administrador, e o painel ganha como saber, antes de tentar, se a conta e
-- de paciente.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.5 (painel #15).
-- Design e racional: supera-docs/ADRs/ADR-003 — Estratégia de RLS multi-perfil.md
--
-- O QUE ESTAVA ABERTO. create_professional e create_admin promoviam QUALQUER
-- conta existente. A conta do paciente — a mesma que abre o app e le o
-- proprio prontuario — podia receber o papel de profissional de Oncologia ou
-- de administrador, e passaria a ler o prontuario dos outros. A tela do
-- painel era a unica defesa, e ela nem tinha como saber: o painel nao le
-- `patients` com `.from()` (a leitura e auditada, ADR-008), e
-- read_patient_list so devolve has_account, nao qual conta.
--
-- As duas coisas que esta migration faz:
--
--   1. create_professional e create_admin RECUSAM conta de paciente
--      (account_is_patient) e de acompanhante (account_is_caregiver), 23514.
--      A recusa e do banco, e vale para qualquer cliente, inclusive a Edge
--      Function de cadastro da equipe que a Fase F vai trazer.
--   2. is_patient_account(p_account_id) RETURNS boolean, so para
--      administrador: o painel pergunta antes de oferecer a conta. Devolve
--      so o booleano, nenhum dado pessoal. Nao-administrador recebe
--      `forbidden` — sem isso, a funcao diria a qualquer profissional quais
--      contas sao de paciente.
--
-- "Conta de paciente" e a que esta em patients.account_id (a ficha ligada).
-- "Conta de acompanhante" e a que tem linha em caregivers, com vinculo ativo
-- ou nao: o perfil de acompanhante existe enquanto a linha existir, e um
-- vinculo revogado pode ser reativado. A conta que ainda nao ligou ficha
-- nenhuma (criada no app, antes do celular confirmado) nao e distinguivel de
-- uma conta nova de equipe por nenhum dado do banco — a Fase F resolve isso
-- criando a conta da equipe pelo convite, e nao reaproveitando conta
-- existente.
--
-- A ordem das checagens em create_professional: perfil (forbidden) ->
-- reflexivo -> conta existe -> paciente/acompanhante -> ja cadastrado. Quem
-- nao e administrador nao aprende nada sobre a conta.


-- ============================================================
-- 1. O predicado, num lugar so
-- ============================================================

CREATE FUNCTION private.reject_patient_or_caregiver_account(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.patients WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'account_is_patient'
      USING ERRCODE = '23514',
            HINT    = 'A conta e de paciente. A equipe usa conta propria, com e-mail corporativo.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.caregivers WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'account_is_caregiver'
      USING ERRCODE = '23514',
            HINT    = 'A conta e de acompanhante. A equipe usa conta propria, com e-mail corporativo.';
  END IF;
END;
$$;

COMMENT ON FUNCTION private.reject_patient_or_caregiver_account(uuid) IS
  'Recusa (23514) conta ligada a ficha de paciente ou com perfil de acompanhante. Chamada pelas RPCs que dao papel de equipe.';


-- ============================================================
-- 2. is_patient_account — a pergunta do painel
-- ============================================================

CREATE FUNCTION public.is_patient_account(p_account_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.patients WHERE account_id = p_account_id);
END;
$$;

COMMENT ON FUNCTION public.is_patient_account(uuid) IS
  'Administrador pergunta se a conta esta ligada a uma ficha de paciente. So o booleano; conta inexistente devolve false. Desde 30/09/2026.';


-- ============================================================
-- 3. create_professional — recusa conta de paciente e de acompanhante
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL.

CREATE OR REPLACE FUNCTION public.create_professional(
  p_account_id           uuid,
  p_council_registration text,
  p_specialty_ids        uuid[],
  p_primary_specialty_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id      uuid;
  v_primary uuid := p_primary_specialty_id;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM private.reject_self_professional_change(p_account_id);

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'account_not_found'
      USING ERRCODE = '23503',
            HINT    = 'A pessoa precisa ter criado a conta antes de receber o perfil.';
  END IF;

  -- E.5: a conta do app nao vira conta de equipe.
  PERFORM private.reject_patient_or_caregiver_account(p_account_id);

  IF EXISTS (SELECT 1 FROM public.professionals WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'professional_already_registered' USING ERRCODE = '23505';
  END IF;

  IF p_council_registration IS NULL OR length(btrim(p_council_registration)) = 0 THEN
    RAISE EXCEPTION 'council_registration_required' USING ERRCODE = '23514';
  END IF;

  IF p_specialty_ids IS NULL OR pg_catalog.cardinality(p_specialty_ids) = 0 THEN
    RAISE EXCEPTION 'specialty_required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(p_specialty_ids) AS s (id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.specialties sp WHERE sp.id = s.id AND sp.is_active
     )
  ) THEN
    RAISE EXCEPTION 'unknown_specialty' USING ERRCODE = '23503';
  END IF;

  v_primary := coalesce(v_primary, p_specialty_ids[1]);
  IF NOT (v_primary = ANY (p_specialty_ids)) THEN
    RAISE EXCEPTION 'primary_specialty_not_in_list' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.professionals (account_id, council_registration)
  VALUES (p_account_id, pg_catalog.btrim(p_council_registration))
  RETURNING id INTO v_id;

  INSERT INTO public.professional_specialties (professional_id, specialty_id, is_primary)
  SELECT v_id, s.id, (s.id = v_primary)
    FROM pg_catalog.unnest(p_specialty_ids) AS s (id);

  RETURN v_id;
END;
$$;


-- ============================================================
-- 4. create_admin — a mesma recusa
-- ============================================================
--
-- A recusa vem ANTES do atalho idempotente. Uma conta que ja e
-- administradora e tambem paciente e estado que esta migration nao cria, mas
-- que pode existir em homologacao; devolver o id em silencio seria confirmar
-- a promocao. Recusar deixa o caso visivel.

CREATE OR REPLACE FUNCTION public.create_admin(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'conta % nao existe', p_account_id USING ERRCODE = '23503';
  END IF;

  -- E.5: a conta do app nao vira conta de administrador.
  PERFORM private.reject_patient_or_caregiver_account(p_account_id);

  -- Idempotente: repetir a promocao devolve o perfil existente. Reativar
  -- quem foi desligado nao acontece aqui (comentario em audit_access_grants).
  SELECT id INTO v_id FROM public.admins WHERE account_id = p_account_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.admins (account_id)
  VALUES (p_account_id)
  RETURNING id INTO v_id;

  RAISE LOG 'admin % promovido por %', p_account_id, auth.uid();

  RETURN v_id;
END;
$$;


-- ============================================================
-- 5. Privilegios — no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.reject_patient_or_caregiver_account(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.reject_patient_or_caregiver_account(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_patient_account(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_patient_account(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_professional(uuid, text, uuid[], uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_admin(uuid)                            FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_professional(uuid, text, uuid[], uuid) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.create_admin(uuid)                            TO authenticated;
