-- O paciente liga a conta a ficha pelo celular confirmado. Pendencia 26.2, de
-- 28/09/2026 (Fase B do plano de 29/09/2026).
--
-- O QUE MUDA NO PRIMEIRO ACESSO: ate aqui, a unica porta era
-- accept_patient_invitation, com o token de 64 caracteres que chega por SMS.
-- Agora o paciente cria a conta por e-mail (a Fase A recusa conta sem e-mail),
-- confirma o celular pelo Auth (`updateUser({ phone })` + codigo por SMS) e
-- informa CPF e data de nascimento. O convite continua valendo como reserva —
-- para quem nao consegue receber o SMS do Auth, ou para a ficha sem celular.
--
-- OS TRES FATORES, e o que cada um prova:
--   * celular confirmado pelo Auth (posse) — o mesmo papel do token do
--     convite: so quem tem o aparelho recebe o codigo;
--   * CPF e data de nascimento (conhecimento) — iguais aos do convite.
-- O celular confirmado tem de ser O DA FICHA. Sem isso, CPF e nascimento
-- sozinhos ligariam o prontuario a qualquer parente que os soubesse.
--
-- O CONTRATO DE RETORNO (decisao B-1, 29/09/2026): `jsonb`, e nao excecao.
--   {"linked": true,  "patient_id": "<uuid>"}
--   {"linked": false, "error": "<codigo>"}
-- A excecao desfaria a gravacao da tentativa na mesma transacao, e o limite
-- de 5 erros por hora nunca contaria. So a falta de sessao (`forbidden`)
-- continua como excecao: nao ha conta onde contar, e e erro de programa, nao
-- de quem digita.
--
-- O ERRO UNICO `invalid_invitation` cobre CPF desconhecido, ficha inativa ou
-- ja ligada, nascimento errado ou ausente e celular que nao confere. Mesmo
-- nome do convite, e pela mesma razao: distinguir os casos faria da RPC um
-- oraculo de CPF. So este erro conta tentativa — os outros nao revelam nada
-- sobre a ficha.
--
-- A ARMADILHA DO NULL, agora com telefone: normalize_br_phone devolve NULL
-- para numero invalido, fixo ou estrangeiro. Comparar com IS DISTINCT FROM
-- deixaria NULL x NULL passar — ficha sem celular + conta com numero de fora
-- LIGARIA. Os dois lados sao exigidos nao nulos, um por um.


-- ============================================================
-- 1. A funcao
-- ============================================================

CREATE FUNCTION public.link_patient_by_verified_phone(
  p_cpf        text,
  p_birth_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER              -- le auth.users e grava em private.patient_link_attempts
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_cpf           text := private.normalize_cpf(p_cpf);
  v_attempts      bigint;
  v_raw_phone     text;
  v_confirmed_at  timestamptz;
  v_account_phone text;
  v_patient_phone text;
  v_patient       public.patients;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE na conta serializa as chamadas da mesma conta: sem ele, cinco
  -- chamadas simultaneas leriam, cada uma, "4 tentativas" e passariam juntas.
  PERFORM 1 FROM public.accounts WHERE id = v_uid AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Mesma guarda do convite (ADR-020 §4): a conta nao pode ja exercer outro
  -- papel, ou a ligacao seria escalada ao sigilo da psicologia.
  IF EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.caregivers    WHERE account_id = v_uid) THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'account_has_other_profile');
  END IF;

  IF EXISTS (SELECT 1 FROM public.patients WHERE account_id = v_uid) THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'account_already_linked');
  END IF;

  -- O limite vem ANTES de olhar a ficha: a sexta chamada da hora e recusada
  -- mesmo com os dados certos, ou o limite nao limitaria nada.
  SELECT pg_catalog.count(*) INTO v_attempts
    FROM private.patient_link_attempts
   WHERE account_id = v_uid
     AND attempted_at > pg_catalog.now() - interval '1 hour';

  IF v_attempts >= 5 THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'too_many_attempts');
  END IF;

  -- `phone_confirmed_at` e o carimbo que o Auth grava quando o codigo do SMS
  -- confere. Enquanto a troca de celular esta pendente, o numero novo mora em
  -- `phone_change` e `phone` segue o antigo (ou vazio) — por isso le-se `phone`.
  SELECT u.phone, u.phone_confirmed_at
    INTO v_raw_phone, v_confirmed_at
    FROM auth.users u
   WHERE u.id = v_uid;

  IF v_confirmed_at IS NULL OR pg_catalog.btrim(coalesce(v_raw_phone, '')) = '' THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'phone_not_verified');
  END IF;

  -- `cpf` e UNIQUE e guardado so com digitos. FOR UPDATE fecha a corrida de
  -- duas contas ligando a mesma ficha.
  SELECT * INTO v_patient
    FROM public.patients
   WHERE cpf = v_cpf
   FOR UPDATE;

  v_account_phone := private.normalize_br_phone(v_raw_phone);
  v_patient_phone := private.normalize_br_phone(v_patient.phone);

  -- Cada termo escrito para dar TRUE ou FALSE, nunca NULL: um NULL no meio
  -- de um OR em que nenhum outro termo e TRUE faz o IF nao entrar, e a
  -- ficha ligaria. Foi o defeito do nascimento em 25/09/2026.
  IF NOT FOUND
     OR v_patient.is_active IS NOT TRUE
     OR v_patient.account_id IS NOT NULL
     OR p_birth_date IS NULL
     OR v_patient.birth_date IS DISTINCT FROM p_birth_date
     OR v_account_phone IS NULL
     OR v_patient_phone IS NULL
     OR v_account_phone <> v_patient_phone THEN
    INSERT INTO private.patient_link_attempts (account_id) VALUES (v_uid);
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'invalid_invitation');
  END IF;

  -- trg_audit_write grava a ligacao na trilha; trg_open_first_access_nps abre
  -- a pesquisa do primeiro acesso. Os dois disparam aqui como no convite.
  UPDATE public.patients
     SET account_id = v_uid
   WHERE id = v_patient.id;

  -- O convite pendente perde o sentido: a ficha ja tem conta, e o token
  -- aceitaria de novo so para falhar em `invalid_invitation`. Cancelado, sai
  -- da fila de reenvio do painel.
  UPDATE public.patient_invitations
     SET status = 'cancelled', cancelled_at = pg_catalog.now()
   WHERE patient_id = v_patient.id
     AND status = 'pending';

  RETURN pg_catalog.jsonb_build_object('linked', true, 'patient_id', v_patient.id);
END;
$$;

COMMENT ON FUNCTION public.link_patient_by_verified_phone(text, date) IS
  'Liga a ficha a conta autenticada pelo celular confirmado no Auth (posse) + CPF e nascimento (conhecimento). Devolve jsonb {linked, patient_id} ou {linked:false, error}; so a falta de sessao e excecao. 5 erros invalid_invitation por hora por conta, depois too_many_attempts (decisao B-1, 29/09/2026).';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- A funcao nova nasce alcancavel por `anon` pelo default privilege do
-- Supabase (armadilha 5). `FROM PUBLIC, anon` (armadilhas 2 e 3).

REVOKE EXECUTE ON FUNCTION public.link_patient_by_verified_phone(text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.link_patient_by_verified_phone(text, date) TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.link_patient_by_verified_phone(text, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca link_patient_by_verified_phone';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.link_patient_by_verified_phone(text, date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sem EXECUTE em link_patient_by_verified_phone — o app nao liga ninguem';
  END IF;

  -- O outro lado da armadilha 2: o REVOKE nao pode ter levado junto o que
  -- o sistema inteiro usa.
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;

  -- O helper do telefone continua fora da API: a RPC o chama como dona.
  -- (normalize_cpf ja era executavel por authenticated antes desta fase; e
  -- funcao pura, sem leitura, e nao e objeto desta migration.)
  IF pg_catalog.has_function_privilege('authenticated', 'private.normalize_br_phone(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'normalize_br_phone alcancavel pela API';
  END IF;

  IF pg_catalog.pg_get_userbyid(
       (SELECT p.proowner FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.link_patient_by_verified_phone(text, date)'::pg_catalog.regprocedure)
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'link_patient_by_verified_phone precisa ser de postgres para ler auth.users';
  END IF;
END;
$$;
