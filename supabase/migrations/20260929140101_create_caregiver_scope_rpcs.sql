-- As RPCs das areas do acompanhante (Fase C1, ADR-030), e o pacote do titular
-- passa a carregar as areas.
--
--   get_caregiver_scopes()                 titular: as cinco areas do vinculo atual
--   set_caregiver_scope(area, ligada)      titular: liga ou desliga uma area
--   get_my_ward_scopes()                   acompanhante: as areas que alcanca
--
-- A MUDANCA VALE NA PROXIMA CONSULTA. Nao ha cache nem sessao a derrubar: as
-- politicas perguntam a tabela a cada leitura, e o Realtime pergunta a cada
-- evento. O app do acompanhante precisa apenas refazer as consultas (ou
-- reagir ao vazio).
--
-- Nova senha (reset-caregiver-password) e revogacao NAO tocam nas areas:
-- nada escreve na tabela fora de set_caregiver_scope e dos triggers. Um
-- vinculo que volta a `pending` pela troca de senha mantem as escolhas; o
-- revogado guarda as linhas como historico.


-- ============================================================
-- 1. O titular le as areas
-- ============================================================
--
-- SECURITY INVOKER: o titular ja le patient_caregivers e
-- patient_caregiver_scopes pelas politicas _select_own. Vazio para quem nao
-- tem vinculo vivo — e para quem nao e titular: e leitura, e "nada" e a
-- resposta honesta (como get_my_caregiver).

CREATE FUNCTION public.get_caregiver_scopes()
RETURNS TABLE (
  scope      public.caregiver_scope,
  enabled    boolean,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT s.scope, s.enabled, s.updated_at
    FROM public.patient_caregiver_scopes s
    JOIN public.patient_caregivers pc ON pc.id = s.link_id
   WHERE pc.patient_id = (SELECT private.my_own_patient_id())
     AND pc.status IN ('pending', 'active')
   ORDER BY s.scope;
$$;

COMMENT ON FUNCTION public.get_caregiver_scopes() IS
  'Titular: as areas do vinculo de acompanhante atual (pending ou active), na ordem do enum. Vazio sem vinculo ou para quem nao e titular.';


-- ============================================================
-- 2. O titular liga ou desliga
-- ============================================================
--
-- SECURITY DEFINER: authenticated nao escreve na tabela. O titular e o unico
-- autor (nem o acompanhante, nem a equipe, nem a administracao): e o
-- consentimento dele que a area expressa (LGPD art. 11, ADR-030).
--
-- Desligar as cinco e permitido: e o "pausar sem revogar". O acompanhante
-- continua vendo o nome do tutelado (get_my_ward) e nada mais.
--
-- Linha ausente (so por intervencao manual) e recriada com o valor pedido,
-- com o titular como autor — e entra na trilha pelo trg_audit_write_insert.
-- Pedido sem mudanca nao grava nada: nem updated_at, nem trilha.

CREATE FUNCTION public.set_caregiver_scope(
  p_scope   public.caregiver_scope,
  p_enabled boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
  v_link_id    uuid;
  v_current    boolean;
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not_patient_owner' USING ERRCODE = '42501';
  END IF;

  IF p_scope IS NULL OR p_enabled IS NULL THEN
    RAISE EXCEPTION 'invalid_scope' USING ERRCODE = '22023';
  END IF;

  -- Trava o vinculo: duas chamadas simultaneas do titular se enfileiram, e a
  -- revogacao concorrente espera (ou e esperada).
  SELECT pc.id INTO v_link_id
    FROM public.patient_caregivers pc
   WHERE pc.patient_id = v_patient_id
     AND pc.status IN ('pending', 'active')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'caregiver_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.enabled INTO v_current
    FROM public.patient_caregiver_scopes s
   WHERE s.link_id = v_link_id
     AND s.scope   = p_scope
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.patient_caregiver_scopes (link_id, patient_id, scope, enabled, updated_by_account)
    VALUES (v_link_id, v_patient_id, p_scope, p_enabled, auth.uid());
  ELSIF v_current IS DISTINCT FROM p_enabled THEN
    UPDATE public.patient_caregiver_scopes
       SET enabled            = p_enabled,
           updated_by_account = auth.uid()
     WHERE link_id = v_link_id
       AND scope   = p_scope;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_caregiver_scope(public.caregiver_scope, boolean) IS
  'Titular liga ou desliga uma area do acompanhante. Erros: not_patient_owner (42501), caregiver_not_found (P0002), invalid_scope (22023); area fora do enum falha antes, em 22P02. Vale na proxima consulta do acompanhante.';


-- ============================================================
-- 3. O acompanhante le o que alcanca
-- ============================================================
--
-- Mesma regra das politicas, e nao uma copia dela: pergunta a
-- my_ward_patient_ids_for, area por area. Se uma diz "sim" aqui, a leitura
-- correspondente devolve linha; se diz "nao", devolve vazio. Vinculo
-- `pending`, revogado ou inexistente: vazio.
--
-- `resources` sem `clinical_record` responde "sim", mas a biblioteca mostra so
-- a orientacao universal (my_library_cid10_ids).

CREATE FUNCTION public.get_my_ward_scopes()
RETURNS TABLE (scope public.caregiver_scope)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s
    FROM pg_catalog.unnest(pg_catalog.enum_range(NULL::public.caregiver_scope)) AS s
   WHERE pg_catalog.cardinality(private.my_ward_patient_ids_for(s)) > 0
   ORDER BY s;
$$;

COMMENT ON FUNCTION public.get_my_ward_scopes() IS
  'Acompanhante: as areas ligadas do vinculo active. Vazio para vinculo pending, revogado ou para quem nao e acompanhante. Serve para montar o menu; a RLS e quem garante.';


-- ============================================================
-- 4. O pacote do titular (art. 18) leva as areas
-- ============================================================
--
-- Mesma funcao de close_data_subject_request_cycle, com uma chave a mais em
-- `patient`: caregiver_scopes. E escolha do titular sobre dado dele. SECURITY
-- INVOKER como antes: le sob a politica patient_caregiver_scopes_select_own.

CREATE OR REPLACE FUNCTION public.export_my_data(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_patient_id uuid := private.my_own_patient_id();
  v_account    jsonb;
  v_sections   jsonb := '{}'::jsonb;
  v_patient    jsonb := NULL;
  v_rows       bigint := 0;
  v_part       jsonb;
  v_key        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.to_jsonb(a) INTO v_account
    FROM public.accounts a WHERE a.id = v_uid;

  -- ---------- o que e da CONTA (vale para qualquer perfil) ----------

  v_sections := v_sections || pg_catalog.jsonb_build_object(
    'consents', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', c.id, 'document_kind', v.kind, 'document_version', v.version,
               'accepted_at', c.accepted_at, 'revoked_at', c.revoked_at)
             ORDER BY c.accepted_at), '[]'::jsonb)
        FROM public.consent_records c
        LEFT JOIN public.legal_document_versions v ON v.id = c.document_version_id
       WHERE c.account_id = v_uid),
    'data_subject_requests', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) - 'execution_error'
             ORDER BY r.created_at), '[]'::jsonb)
        FROM public.data_subject_requests r
       WHERE r.account_id = v_uid),
    'notification_preferences', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(np)), '[]'::jsonb)
        FROM public.notification_preferences np
       WHERE np.account_id = v_uid),
    'notifications', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(n) ORDER BY n.created_at), '[]'::jsonb)
        FROM public.notifications n
       WHERE n.recipient_account_id = v_uid),
    'device_tokens', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.created_at), '[]'::jsonb)
        FROM public.device_tokens d
       WHERE d.account_id = v_uid),
    -- Como acompanhante: o perfil e os vinculos (so o id da ficha, que e de
    -- outro titular), e as mensagens que a propria conta escreveu.
    'caregiver_profiles', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cg)), '[]'::jsonb)
        FROM public.caregivers cg
       WHERE cg.account_id = v_uid),
    'caregiver_links', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pc) ORDER BY pc.granted_at), '[]'::jsonb)
        FROM public.patient_caregivers pc
        JOIN public.caregivers cg ON cg.id = pc.caregiver_id
       WHERE cg.account_id = v_uid),
    'messages_as_caregiver', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', m.id, 'conversation_id', m.conversation_id,
               'body', m.body, 'created_at', m.created_at)
             ORDER BY m.created_at), '[]'::jsonb)
        FROM public.messages m
       WHERE m.author_account_id = v_uid
         AND m.author_kind = 'caregiver')
  );

  -- ---------- o que e da FICHA, quando a conta e titular ----------

  IF v_patient_id IS NOT NULL THEN
    v_patient := pg_catalog.jsonb_build_object(
      'record', (
        SELECT pg_catalog.to_jsonb(p) FROM public.patients p WHERE p.id = v_patient_id),
      'diagnoses', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.patient_diagnoses x WHERE x.patient_id = v_patient_id),
      'clinical_history', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.patient_clinical_history x WHERE x.patient_id = v_patient_id),
      'treatment_plans', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.treatment_plans x WHERE x.patient_id = v_patient_id),
      'diary_entries', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.entry_date), '[]'::jsonb)
          FROM public.diary_entries x WHERE x.patient_id = v_patient_id),
      'diary_symptom_reports', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.diary_symptom_reports x
          JOIN public.diary_entries e ON e.id = x.diary_entry_id
         WHERE e.patient_id = v_patient_id),
      'appointments', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.starts_at), '[]'::jsonb)
          FROM public.appointments x WHERE x.patient_id = v_patient_id),
      'conversations', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.conversations x WHERE x.patient_id = v_patient_id),
      'messages', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.messages x
          JOIN public.conversations c ON c.id = x.conversation_id
         WHERE c.patient_id = v_patient_id),
      -- Metadado do anexo, nao o arquivo: o arquivo se baixa pelo Storage com a
      -- mesma sessao, e embuti-lo em base64 faria o pacote pesar o que os
      -- anexos pesam.
      'message_attachments', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.message_attachments x
          JOIN public.messages m      ON m.id = x.message_id
          JOIN public.conversations c ON c.id = m.conversation_id
         WHERE c.patient_id = v_patient_id),
      'nps_responses', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.nps_responses x
          JOIN public.nps_surveys s ON s.id = x.survey_id
         WHERE s.patient_id = v_patient_id),
      'content_states', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.patient_content_states x WHERE x.patient_id = v_patient_id),
      'caregiver_links', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.granted_at), '[]'::jsonb)
          FROM public.patient_caregivers x WHERE x.patient_id = v_patient_id),
      -- ADR-030: as areas que o titular ligou ou desligou, por vinculo.
      'caregiver_scopes', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.link_id, x.scope), '[]'::jsonb)
          FROM public.patient_caregiver_scopes x WHERE x.patient_id = v_patient_id)
    );
  END IF;

  -- A contagem da trilha: uma linha por registro entregue. E o numero que
  -- distingue "exportou a ficha de um paciente" de "exportou a base".
  FOR v_key, v_part IN SELECT * FROM pg_catalog.jsonb_each(v_sections) LOOP
    v_rows := v_rows + pg_catalog.jsonb_array_length(v_part);
  END LOOP;
  IF v_patient IS NOT NULL THEN
    FOR v_key, v_part IN SELECT * FROM pg_catalog.jsonb_each(v_patient) LOOP
      v_rows := v_rows + CASE WHEN pg_catalog.jsonb_typeof(v_part) = 'array'
                              THEN pg_catalog.jsonb_array_length(v_part) ELSE 1 END;
    END LOOP;
  END IF;
  v_rows := v_rows + 1;  -- a conta

  PERFORM private.register_subject_export(p_request_id, v_rows);

  RETURN pg_catalog.jsonb_build_object(
    'format',         'jornada-supera/data-subject-export',
    'format_version', 1,
    'generated_at',   pg_catalog.now(),
    'request_id',     p_request_id,
    'account',        v_account,
    'patient',        v_patient
  ) || v_sections;
END;
$$;


-- ============================================================
-- 5. Privilegios — SEMPRE no fim
-- ============================================================
--
-- As tres nascem alcancaveis por PUBLIC e, pelo default privilege do
-- Supabase, por anon (armadilhas 2, 3 e 5).

REVOKE EXECUTE ON FUNCTION public.get_caregiver_scopes()                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_caregiver_scope(public.caregiver_scope, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_ward_scopes()                               FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_caregiver_scopes()                             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.set_caregiver_scope(public.caregiver_scope, boolean) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.get_my_ward_scopes()                               TO authenticated;


DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.get_caregiver_scopes()',
    'public.set_caregiver_scope(public.caregiver_scope, boolean)',
    'public.get_my_ward_scopes()'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated sem EXECUTE em %', v_fn;
    END IF;
  END LOOP;

  -- export_my_data: CREATE OR REPLACE preserva o ACL; medir mesmo assim.
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.export_my_data(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu export_my_data';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.export_my_data(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca export_my_data';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;
END;
$$;
