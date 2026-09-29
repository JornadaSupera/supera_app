-- A ligacao pelo celular recusa a confirmacao que disputou o numero com outra
-- conta. Pendencia 26.3, de 28/09/2026 (Fase D do plano de 29/09/2026).
-- Racional: ADR-020, emenda §8. O restante da funcao e o de
-- 20260929133939_create_link_patient_by_verified_phone.sql, sem mudanca.
--
-- CREATE OR REPLACE com a mesma assinatura: sem DROP, e o ACL e preservado.
-- As asserções de privilegio e dono se repetem no fim mesmo assim.
--
-- O QUE MUDA, logo depois de `phone_not_verified`:
--
--   * a confirmacao tem de ter REGISTRO em private.phone_confirmations, com o
--     mesmo instante E o mesmo numero que auth.users mostra agora. Sem
--     registro, `phone_not_verified` (D2, fail-closed): e a confirmacao feita
--     antes do trigger existir (0 em homologacao, 29/09/2026), ou o numero
--     trocado sem nova confirmacao. Nos dois casos, o carimbo nao prova a
--     posse DESTE numero.
--
--   * registro `contested` (outra conta tinha o mesmo numero pendente no
--     instante da confirmacao): `phone_contested` (D3). O Auth confirma
--     qualquer uma das contas pendentes, e o codigo legitimo de uma pode ter
--     confirmado a outra. NAO conta tentativa: o erro fala da conta de quem
--     chama, nunca da ficha, e por isso nao serve de oraculo de CPF. A saida
--     do paciente e o convite por SMS, que a ADR-020 mantem como reserva.
--
-- A ORDEM das recusas continua: sessao, perfil, conta ja ligada, limite,
-- celular — e so entao a ficha.
--
-- O CONTRATO DE RETORNO ganha um codigo:
--   {"linked": false, "error": "phone_contested"}


-- ============================================================
-- 1. A funcao
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_patient_by_verified_phone(
  p_cpf        text,
  p_birth_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER              -- le auth.users e private.phone_confirmations, grava em private.patient_link_attempts
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_cpf           text := private.normalize_cpf(p_cpf);
  v_attempts      bigint;
  v_raw_phone     text;
  v_confirmed_at  timestamptz;
  v_contested     boolean;
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

  -- O carimbo so vale com o registro gravado pelo trigger no mesmo instante e
  -- para o mesmo numero (ADR-020 §8). Sem registro: fail-closed (D2).
  SELECT pc.contested INTO v_contested
    FROM private.phone_confirmations pc
   WHERE pc.account_id   = v_uid
     AND pc.confirmed_at = v_confirmed_at
     AND pc.phone        = v_raw_phone;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'phone_not_verified');
  END IF;

  -- Outra conta disputava o numero na confirmacao: o codigo pode ter sido o
  -- dela. Nao conta tentativa (D3) — nada aqui fala da ficha.
  IF v_contested THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'phone_contested');
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
  'Liga a ficha a conta autenticada pelo celular confirmado no Auth (posse) + CPF e nascimento (conhecimento). Devolve jsonb {linked, patient_id} ou {linked:false, error}; so a falta de sessao e excecao. 5 erros invalid_invitation por hora por conta, depois too_many_attempts (decisao B-1, 29/09/2026). Confirmacao sem registro em private.phone_confirmations: phone_not_verified; confirmacao contestada por outra conta: phone_contested, sem contar tentativa (ADR-020 §8).';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL; repetir custa pouco e asserta o efeito.

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

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;

  -- O registro continua fora da API: a RPC o le como dona.
  IF pg_catalog.has_table_privilege('authenticated', 'private.phone_confirmations', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated le private.phone_confirmations';
  END IF;

  IF pg_catalog.pg_get_userbyid(
       (SELECT p.proowner FROM pg_catalog.pg_proc p
         WHERE p.oid = 'public.link_patient_by_verified_phone(text, date)'::pg_catalog.regprocedure)
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'link_patient_by_verified_phone precisa ser de postgres para ler auth.users';
  END IF;
END;
$$;
