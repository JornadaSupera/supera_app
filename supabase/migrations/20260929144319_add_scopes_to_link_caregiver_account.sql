-- As areas escolhidas na criacao do acompanhante. Pendencia 32.6, de
-- 28/09/2026 (Fase C3 do plano de 29/09/2026). ADR-030, mudanca de escopo
-- aceita pela CEON em 29/09/2026.
--
-- ATE AQUI o acompanhante nascia com as cinco areas ligadas (o trigger
-- seed_caregiver_scopes) e o titular so podia desligar depois, por
-- set_caregiver_scope. Entre a troca da senha provisoria e o primeiro ajuste,
-- o acompanhante via tudo. Agora o titular escolhe no proprio formulario de
-- criacao, e o vinculo ja nasce com a escolha, NA MESMA TRANSACAO.
--
-- O CONTRATO:
--   p_scopes ausente ou NULL -> as cinco ligadas (o comportamento de ate aqui;
--                               o app que nao conhece o campo nao muda)
--   p_scopes = '{schedule,chat}' -> so essas ligadas, as outras desligadas
--   p_scopes = '{}'          -> todas desligadas ("pausado" desde o inicio)
--   elemento NULL no array   -> invalid_scope (22023)
--   valor fora do enum       -> falha na conversao, antes do corpo (22P02)
--   repetido                 -> indiferente
--
-- COMO: o trigger continua semeando as cinco ligadas (ele e a garantia de que
-- nenhum caminho cria vinculo sem linha). A funcao so DESLIGA as que ficaram
-- de fora, com o titular como autor (updated_by_account): cada area desligada
-- entra na trilha como um UPDATE do paciente, exatamente como se ele a tivesse
-- desligado por set_caregiver_scope um instante depois. As ligadas nao geram
-- linha nenhuma, como na criacao sem escolha.
--
-- POR QUE DROP + CREATE, e nao CREATE OR REPLACE: parametro novo muda a
-- assinatura, e o OR REPLACE criaria uma SOBRECARGA. O PostgREST ficaria
-- ambiguo entre as duas na chamada sem p_scopes (PGRST203), e a velha,
-- sem areas, continuaria chamavel. O DROP leva o ACL junto: a funcao nova
-- nasce com o default privilege do Supabase (anon incluso, armadilha 5), e
-- os grants sao refeitos no fim, iguais aos da versao anterior.
--
-- O corpo e o da migration create_caregiver_accounts, sem mudanca fora do
-- que esta marcado com "C3".


-- ============================================================
-- 1. A funcao
-- ============================================================

DROP FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel);

CREATE FUNCTION public.link_caregiver_account(
  p_account_id uuid,
  p_full_name  text,
  p_phone      text,
  p_channel    public.caregiver_credential_channel,
  p_scopes     public.caregiver_scope[] DEFAULT NULL
)
RETURNS TABLE (link_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id   uuid := private.my_own_patient_id();
  v_name         text := NULLIF(pg_catalog.btrim(p_full_name), '');
  v_phone        text := private.normalize_br_phone(p_phone);
  v_setup_for    text;
  v_caregiver    public.caregivers;
  v_link_id      uuid;
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not_patient_owner' USING ERRCODE = '42501';
  END IF;

  SELECT u.raw_app_meta_data ->> 'caregiver_setup_for' INTO v_setup_for
    FROM auth.users u
   WHERE u.id = p_account_id
   FOR UPDATE;

  IF v_setup_for IS DISTINCT FROM v_patient_id::text THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  -- C3: elemento NULL deixaria `scope = ANY (p_scopes)` em NULL, e a area
  -- ficaria no limbo entre ligada e desligada. Recusa, com o mesmo codigo de
  -- set_caregiver_scope.
  IF p_scopes IS NOT NULL AND pg_catalog.array_position(p_scopes, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;

  -- Cinto: find_reusable_caregiver_account ja recusou, mas o passe nao pode
  -- ser o unico lugar em que isto e verdade.
  IF p_account_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.patients      WHERE account_id = p_account_id)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = p_account_id)
     OR EXISTS (SELECT 1 FROM public.admins        WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'email_in_use' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patient_caregivers
              WHERE patient_id = v_patient_id AND status IN ('pending', 'active')) THEN
    RAISE EXCEPTION 'caregiver_already_active' USING ERRCODE = '23505';
  END IF;

  IF private.caregiver_credential_quota_exceeded(v_patient_id) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  SELECT * INTO v_caregiver FROM public.caregivers WHERE account_id = p_account_id;

  IF NOT FOUND THEN
    INSERT INTO public.caregivers (account_id)
    VALUES (p_account_id)
    RETURNING * INTO v_caregiver;
  ELSIF NOT v_caregiver.is_active THEN
    -- Perfil desligado pela administracao nao volta pela mao do paciente.
    RAISE EXCEPTION 'caregiver_disabled' USING ERRCODE = '42501';
  ELSE
    UPDATE public.caregivers SET dormant_since = NULL WHERE id = v_caregiver.id;
  END IF;

  UPDATE public.accounts
     SET full_name = v_name,
         phone     = v_phone,
         is_active = true
   WHERE id = p_account_id;

  -- trg_seed_caregiver_scopes cria aqui as cinco areas, ligadas.
  INSERT INTO public.patient_caregivers (patient_id, caregiver_id, status)
  VALUES (v_patient_id, v_caregiver.id, 'pending')
  RETURNING id INTO v_link_id;

  -- C3: a escolha do titular. So as que ficaram de fora mudam; cada uma entra
  -- na trilha (trg_audit_write, UPDATE) com o paciente como autor.
  IF p_scopes IS NOT NULL THEN
    UPDATE public.patient_caregiver_scopes s
       SET enabled            = false,
           updated_by_account = auth.uid()
     WHERE s.link_id = v_link_id
       AND NOT (s.scope = ANY (p_scopes));
  END IF;

  link_id := v_link_id;

  INSERT INTO public.caregiver_credential_issuances
    (link_id, patient_id, reason, channel, issued_by_account, expires_at)
  VALUES
    (v_link_id, v_patient_id, 'created', p_channel, auth.uid(), private.caregiver_credential_expiry())
  RETURNING caregiver_credential_issuances.expires_at INTO expires_at;

  -- O passe e de uso unico.
  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data - 'caregiver_setup_for'
   WHERE id = p_account_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel, public.caregiver_scope[]) IS
  'Segundo passo de create-caregiver: perfil, vinculo `pending`, areas e emissao, com o titular como autor. Exige o passe caregiver_setup_for que so service_role grava. p_scopes NULL = as cinco areas ligadas; array = so essas ligadas; elemento NULL = invalid_scope (22023).';


-- ============================================================
-- 2. Privilegios — no fim, e medidos
-- ============================================================
--
-- Iguais aos da versao anterior: authenticated (o titular, pela Edge
-- Function) e service_role; nunca PUBLIC nem anon.

REVOKE EXECUTE ON FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel, public.caregiver_scope[])
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel, public.caregiver_scope[])
  TO authenticated, service_role;

DO $$
DECLARE
  v_fn constant text :=
    'public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel, public.caregiver_scope[])';
BEGIN
  IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca link_caregiver_account';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu link_caregiver_account — create-caregiver quebraria';
  END IF;

  -- Uma assinatura so: sobrecarga deixaria o PostgREST ambiguo.
  IF (SELECT count(*) FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'link_caregiver_account') <> 1 THEN
    RAISE EXCEPTION 'link_caregiver_account com mais de uma assinatura';
  END IF;

  -- SECURITY DEFINER le auth.users: o dono tem de ser postgres.
  IF (SELECT p.proowner::regrole::text FROM pg_catalog.pg_proc p
       WHERE p.oid = v_fn::regprocedure) <> 'postgres' THEN
    RAISE EXCEPTION 'link_caregiver_account com dono diferente de postgres';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;
END;
$$;
