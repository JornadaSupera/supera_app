-- Cadastro da equipe pelo painel: a conta nasce do convite por e-mail, e o
-- papel so vale depois que a pessoa confirma o e-mail.
-- Plano das pendencias do painel de 30/09/2026, Fase F, item F.1 (painel #3),
-- decisoes D9 (convite por e-mail) e D11 (o papel nasce pendente).
-- Design e racional: supera-docs/ADRs/ADR-031 — Provisionamento da equipe.md
--
-- O QUE FALTAVA. create_professional e create_admin so promovem conta que JA
-- existe (account_not_found), e nada no projeto criava a conta de alguem da
-- equipe: o painel nao tinha como cadastrar um profissional novo. Quem cria a
-- conta e a Edge Function create-staff-account, com a Admin API; esta
-- migration e a parte do banco.
--
-- AS PECAS:
--
--   1. professionals.pending_confirmation e admins.pending_confirmation. O
--      papel criado sobre conta de e-mail NAO confirmado nasce inativo e
--      pendente. Um CHECK impede "pendente e ativo" ao mesmo tempo.
--   2. create_professional e create_admin: conta confirmada -> papel ativo,
--      como antes; conta nao confirmada -> papel pendente.
--   3. trg_activate_pending_staff em auth.users: na TRANSICAO para e-mail
--      confirmado, o papel pendente vira ativo. A escrita passa pelos
--      triggers de auditoria de professionals e admins, e a trilha ganha uma
--      linha `update` com ator de sistema, separada da linha `create` do
--      convite, que tem o administrador como ator.
--   4. set_professional_active recusa papel pendente (staff_invitation_pending).
--      Ativar antes da confirmacao seria o furo que a D11 fecha; "desativar"
--      um pendente seria ilusao, porque a confirmacao o ativaria depois. Para
--      desistir do convite, o administrador desativa a CONTA
--      (set_account_active), e o papel ativado depois nao passa na regra dos
--      dois is_active.
--   5. prepare_staff_account(p_email): administrador em sessao aal2, e-mail
--      livre. Recusa ANTES de a Edge Function tocar no Auth.
--   6. list_pending_staff_invitations(): o painel mostra "convite pendente".
--   7. prepare_staff_invitation_resend(p_account_id): autoriza o reenvio e
--      devolve o e-mail, so para conta ainda pendente.
--
-- POR QUE O PAPEL PENDENTE, E NAO A CHECAGEM DO E-MAIL NOS HELPERS. O plano
-- previa que is_active_admin() e is_active_professional() passassem a
-- consultar auth.users.email_confirmed_at. Medido antes de escrever: (a) a
-- regra alcancaria tambem as contas de equipe que ja existem, e toda conta
-- ativa sem e-mail confirmado perderia o acesso no instante do push,
-- inclusive administradores; (b) o `is_active` do perfil ja e lido por mais de
-- quinze pontos (my_professional_id, my_specialty_ids, has_permission,
-- count_other_active_admins, professionals_with_permission, os destinos de
-- transfer_conversation e assign_alert, o destinatario do relatorio...), e
-- cada um precisaria da condicao nova, com o risco de um ficar para tras.
-- Nascendo inativo, o papel pendente ja falha em todos eles, sem tocar em
-- nenhum. A D11 ("so vale com a conta confirmada") fica inteira, e so para o
-- que nasce daqui em diante.
--
-- A CONFIRMACAO E A PROVA, e nao o convite. E-mail digitado errado nao da
-- erro: o convite sai, a API responde 200, e o bounce chega depois. Um papel
-- ativo nesse intervalo e o "administrador fantasma" de bootstrap_first_admin.
-- A confirmacao acontece quando a pessoa abre o link do convite (ou o de
-- recuperacao de senha), e as duas provam a posse da caixa.
--
-- O QUE NAO MUDA: create_professional/create_admin sobre conta JA confirmada
-- continuam dando papel ativo na hora. E o caminho para quem ja esta na
-- equipe e ganha o segundo papel (o profissional que vira administrador).


-- ============================================================
-- 1. O estado pendente
-- ============================================================
--
-- Coluna com DEFAULT constante: no PG 17 e so catalogo, sem reescrever a
-- tabela. O CHECK entra NOT VALID, o padrao do projeto, e o VALIDATE vem em
-- validate_phase_f_constraints. Toda linha existente tem false, entao a
-- validacao nao tem o que recusar; o NOT VALID ja vale para toda escrita nova.

ALTER TABLE public.professionals
  ADD COLUMN pending_confirmation boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT ck_professionals_pending_inactive
    CHECK (NOT (pending_confirmation AND is_active)) NOT VALID;

ALTER TABLE public.admins
  ADD COLUMN pending_confirmation boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT ck_admins_pending_inactive
    CHECK (NOT (pending_confirmation AND is_active)) NOT VALID;

COMMENT ON COLUMN public.professionals.pending_confirmation IS
  'true = convite enviado e e-mail ainda nao confirmado. O perfil fica inativo ate a confirmacao, que o ativa por trigger (trg_activate_pending_staff). Desde 30/09/2026.';
COMMENT ON COLUMN public.admins.pending_confirmation IS
  'true = convite enviado e e-mail ainda nao confirmado. O perfil fica inativo ate a confirmacao, que o ativa por trigger (trg_activate_pending_staff). Desde 30/09/2026.';


-- ============================================================
-- 2. O predicado da confirmacao, num lugar so
-- ============================================================

CREATE FUNCTION private.account_email_confirmed(p_account_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u
     WHERE u.id = p_account_id
       AND u.email_confirmed_at IS NOT NULL
  );
$$;

COMMENT ON FUNCTION private.account_email_confirmed(uuid) IS
  'A conta tem e-mail confirmado no Auth. Conta inexistente devolve false.';


-- ============================================================
-- 3. create_professional — pendente quando a conta nao confirmou
-- ============================================================
--
-- Corpo identico ao de guard_staff_account_roles (E.5), menos o INSERT final.
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
  v_id        uuid;
  v_primary   uuid := p_primary_specialty_id;
  v_confirmed boolean;
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

  -- F.1 (D11): conta sem e-mail confirmado recebe o papel PENDENTE.
  v_confirmed := private.account_email_confirmed(p_account_id);

  INSERT INTO public.professionals (account_id, council_registration, is_active, pending_confirmation)
  VALUES (p_account_id, pg_catalog.btrim(p_council_registration), v_confirmed, NOT v_confirmed)
  RETURNING id INTO v_id;

  INSERT INTO public.professional_specialties (professional_id, specialty_id, is_primary)
  SELECT v_id, s.id, (s.id = v_primary)
    FROM pg_catalog.unnest(p_specialty_ids) AS s (id);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_professional(uuid, text, uuid[], uuid) IS
  'Cria o perfil profissional sobre conta existente. Conta com e-mail nao confirmado recebe o perfil PENDENTE (inativo), que a confirmacao ativa. Desde 30/09/2026.';


-- ============================================================
-- 4. create_admin — a mesma regra
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_admin(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id        uuid;
  v_confirmed boolean;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'conta % nao existe', p_account_id USING ERRCODE = '23503';
  END IF;

  -- E.5: a conta do app nao vira conta de administrador.
  PERFORM private.reject_patient_or_caregiver_account(p_account_id);

  -- Idempotente: repetir a promocao devolve o perfil existente, pendente ou
  -- nao. Reativar quem foi desligado nao acontece aqui.
  SELECT id INTO v_id FROM public.admins WHERE account_id = p_account_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- F.1 (D11): conta sem e-mail confirmado recebe o papel PENDENTE.
  v_confirmed := private.account_email_confirmed(p_account_id);

  INSERT INTO public.admins (account_id, is_active, pending_confirmation)
  VALUES (p_account_id, v_confirmed, NOT v_confirmed)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_admin(uuid) IS
  'Promove uma conta existente a administrador. Exige admin ativo na sessao. Conta com e-mail nao confirmado recebe o perfil PENDENTE (inativo), que a confirmacao ativa. Desde 30/09/2026.';


-- ============================================================
-- 5. A confirmacao ativa o papel pendente
-- ============================================================
--
-- AFTER UPDATE OF email_confirmed_at, com a TRANSICAO no WHEN, pelo mesmo
-- motivo de trg_handle_auth_user_confirmed: cada login atualiza auth.users, e
-- o bloco nao pode rodar de novo sobre conta ja confirmada.
--
-- O ator na trilha e o SISTEMA (auth.uid() nulo dentro do Auth), e e isso
-- que separa a ativacao do convite: o convite tem o administrador como ator.
--
-- A conta desativada pelo administrador (desistencia do convite) tambem tem o
-- papel ativado aqui, e continua sem acesso: todo helper exige os dois
-- is_active, conta e perfil. Nao filtrar por accounts.is_active e deliberado:
-- se o administrador reativar a conta depois, o papel que ele concedeu esta
-- la, sem uma segunda rodada de convite.

CREATE FUNCTION private.activate_pending_staff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.professionals
     SET is_active = true, pending_confirmation = false
   WHERE account_id = NEW.id
     AND pending_confirmation;

  UPDATE public.admins
     SET is_active = true, pending_confirmation = false
   WHERE account_id = NEW.id
     AND pending_confirmation;

  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$$;

COMMENT ON FUNCTION private.activate_pending_staff() IS
  'Na confirmacao do e-mail, ativa o papel de equipe que nasceu pendente (F.1, D11). A trilha registra a ativacao com ator de sistema.';

CREATE TRIGGER trg_activate_pending_staff
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL)
EXECUTE FUNCTION private.activate_pending_staff();


-- ============================================================
-- 6. set_professional_active nao mexe em papel pendente
-- ============================================================
--
-- Corpo de create_professional_registry mais a recusa. CREATE OR REPLACE
-- preserva o ACL.

CREATE OR REPLACE FUNCTION public.set_professional_active(p_professional_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
  v_pending    boolean;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT account_id, pending_confirmation INTO v_account_id, v_pending
    FROM public.professionals WHERE id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING ERRCODE = '23503';
  END IF;

  PERFORM private.reject_self_professional_change(v_account_id);

  -- F.1 (D11): ativar antes da confirmacao e o furo; desativar seria
  -- desfeito pela confirmacao. As duas direcoes sao recusadas.
  IF v_pending THEN
    RAISE EXCEPTION 'staff_invitation_pending'
      USING ERRCODE = '55000',
            HINT    = 'O perfil e ativado quando a pessoa confirma o e-mail. Para desistir do convite, desative a conta (set_account_active).';
  END IF;

  -- Desativar o PERFIL, nao a conta: sao os dois `is_active` da regra de
  -- identidade, e desligar a conta (set_account_active) revoga tambem o app e
  -- os outros papeis. A #26 confirmou que desativar o cadastro E o mecanismo
  -- oficial de revogacao, e ele vale no instante seguinte porque a
  -- autorizacao e lookup, nunca claim (ADR-003 §1).
  UPDATE public.professionals SET is_active = p_is_active WHERE id = p_professional_id;
END;
$$;


-- ============================================================
-- 7. prepare_staff_account — as recusas antes do Auth
-- ============================================================
--
-- Sessao aal2 SEMPRE, com ou sem require_admin_mfa ligado: criar conta de
-- equipe e o ato que da acesso a prontuario, e e o que um token roubado de
-- administrador faria primeiro.
--
-- A ordem: perfil -> segundo fator -> formato -> paciente/acompanhante ->
-- em uso. Quem nao e administrador nao aprende nada sobre o e-mail.
--
-- Nao grava na trilha: nao muda estado. O convite fica registrado pelo
-- INSERT do papel pendente (trg_audit_write de professionals e admins), com o
-- administrador como ator e o id do perfil.

CREATE FUNCTION public.prepare_staff_account(p_email text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email      text := lower(btrim(coalesce(p_email, '')));
  v_account_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT private.session_meets_mfa() THEN
    RAISE EXCEPTION 'mfa_required'
      USING ERRCODE = '42501',
            HINT    = 'Cadastrar alguem da equipe exige sessao com segundo fator verificado (aal2).';
  END IF;

  IF v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;

  -- OPERATOR(extensions.=): com search_path vazio, `=` entre citext cai em
  -- text = text e distingue maiusculas (CLAUDE.md, Fase 4).
  SELECT a.id INTO v_account_id
    FROM public.accounts a
   WHERE a.email OPERATOR(extensions.=) v_email::extensions.citext;

  IF v_account_id IS NOT NULL THEN
    -- A mensagem especifica ajuda a tela: "esse e-mail e de paciente, use o
    -- corporativo". O administrador ja pode saber isso por is_patient_account.
    PERFORM private.reject_patient_or_caregiver_account(v_account_id);
    RAISE EXCEPTION 'email_in_use' USING ERRCODE = '23505';
  END IF;

  -- auth.users sem accounts nao deveria existir (trigger de INSERT), mas a
  -- Admin API recusaria o e-mail de qualquer jeito, e com mensagem pior.
  IF EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'email_in_use' USING ERRCODE = '23505';
  END IF;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.prepare_staff_account(text) IS
  'Administrador em sessao aal2 confere se o e-mail pode receber uma conta de equipe. Devolve o e-mail normalizado. Chamada pela Edge Function create-staff-account antes da Admin API. Desde 30/09/2026.';


-- ============================================================
-- 8. list_pending_staff_invitations — o "convite pendente" da tela
-- ============================================================
--
-- Uma linha por PAPEL pendente: a mesma conta pode ter os dois, se alguem
-- chamou create_admin sobre um profissional ainda pendente.
--
-- account_is_active = false e o convite de que o administrador desistiu. A
-- tela mostra como "cancelado", ou esconde.

CREATE FUNCTION public.list_pending_staff_invitations()
RETURNS TABLE (
  account_id        uuid,
  full_name         text,
  email             text,
  role              text,
  profile_id        uuid,
  invited_at        timestamptz,
  account_is_active boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT a.id, a.full_name, a.email::text, x.role, x.profile_id,
         coalesce(u.invited_at, a.created_at), a.is_active
    FROM (
      SELECT p.account_id, 'professional'::text AS role, p.id AS profile_id
        FROM public.professionals p
       WHERE p.pending_confirmation
      UNION ALL
      SELECT ad.account_id, 'admin'::text, ad.id
        FROM public.admins ad
       WHERE ad.pending_confirmation
    ) x
    JOIN public.accounts a ON a.id = x.account_id
    LEFT JOIN auth.users u ON u.id = x.account_id
   ORDER BY 6 DESC, 2;
END;
$$;

COMMENT ON FUNCTION public.list_pending_staff_invitations() IS
  'Administrador lista os papeis de equipe que esperam a confirmacao do e-mail. Desde 30/09/2026.';


-- ============================================================
-- 9. prepare_staff_invitation_resend — o reenvio
-- ============================================================
--
-- So conta com papel pendente, conta ativa e e-mail ainda nao confirmado.
-- Qualquer outro caso responde igual, staff_invitation_not_found: a funcao
-- nao serve para descobrir se uma conta existe.

CREATE FUNCTION public.prepare_staff_invitation_resend(p_account_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email text;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT private.session_meets_mfa() THEN
    RAISE EXCEPTION 'mfa_required'
      USING ERRCODE = '42501',
            HINT    = 'Reenviar convite da equipe exige sessao com segundo fator verificado (aal2).';
  END IF;

  SELECT a.email::text INTO v_email
    FROM public.accounts a
   WHERE a.id = p_account_id
     AND a.is_active
     AND NOT private.account_email_confirmed(a.id)
     AND (   EXISTS (SELECT 1 FROM public.professionals p WHERE p.account_id = a.id AND p.pending_confirmation)
          OR EXISTS (SELECT 1 FROM public.admins ad      WHERE ad.account_id = a.id AND ad.pending_confirmation));

  IF v_email IS NULL THEN
    RAISE EXCEPTION 'staff_invitation_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN v_email;
END;
$$;

COMMENT ON FUNCTION public.prepare_staff_invitation_resend(uuid) IS
  'Administrador em sessao aal2 autoriza o reenvio do convite de uma conta de equipe pendente. Devolve o e-mail. Desde 30/09/2026.';


-- ============================================================
-- 10. Privilegios — no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.account_email_confirmed(uuid)           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.activate_pending_staff()                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prepare_staff_account(text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_pending_staff_invitations()         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prepare_staff_invitation_resend(uuid)    FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prepare_staff_account(text)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_staff_invitations()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_staff_invitation_resend(uuid)     TO authenticated;

-- O efeito, nao a configuracao (CLAUDE.md, as cinco armadilhas de REVOKE).
DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.prepare_staff_account(text)',
    'public.list_pending_staff_invitations()',
    'public.prepare_staff_invitation_resend(uuid)',
    'public.create_professional(uuid, text, uuid[], uuid)',
    'public.create_admin(uuid)',
    'public.set_professional_active(uuid, boolean)'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated perdeu % — o painel quebraria', v_fn;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('authenticated', 'private.account_email_confirmed(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated alcanca private.account_email_confirmed';
  END IF;
END;
$$;
