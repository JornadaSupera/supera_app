-- As areas passam a valer (Fase C1, ADR-030): cada trecho do acompanhante
-- troca private.my_ward_patient_ids() por private.my_ward_patient_ids_for(<area>).
--
-- SO O TRECHO DO ACOMPANHANTE MUDA. O titular, a equipe e a administracao
-- continuam com a regra que tinham, letra por letra.
--
-- ALTER POLICY, e nao DROP + CREATE: preserva o papel (TO authenticated) e o
-- nome, e nao abre janela sem politica. CREATE OR REPLACE FUNCTION com a mesma
-- assinatura: preserva dono e ACL (quem tinha EXECUTE continua tendo).
--
--   area            politicas                                   funcoes
--   schedule        appointments_select_caregiver               can_confirm_appointment
--   diary           diary_entries_{select,insert,update}_caregiver
--   chat            conversations_select_caregiver,             can_read_chat_attachment,
--                   messages_insert_caregiver                   can_attach_to_message,
--                                                               start_conversation,
--                                                               mark_conversation_read
--   resources                                                   is_library_audience,
--                                                               my_library_cid10_ids
--   clinical_record patient_diagnoses_, treatment_plans_,
--                   patient_clinical_history_select_caregiver
--
-- HERDAM SOZINHAS, sem alteracao (provado em caregiver_scopes.test.sql):
-- messages e message_attachments (leitura pela conversa), conversation_assignments,
-- diary_symptom_reports (todas as operacoes, pelo EXISTS no diario), content_*
-- (por is_library_audience/is_content_visible_to_me), o upload de anexo do chat
-- (can_write_chat_attachment exige a linha de message_attachments, que exige
-- can_attach_to_message) e o Realtime (a RLS vale por evento do WAL).
--
-- DOIS ACRESCIMOS AO PLANO:
--   1. can_attach_to_message checava so autor, conversa aberta e `team`. Com o
--      chat desligado, o acompanhante ainda anexaria arquivo a mensagem antiga
--      dele — e o upload no Storage viria atras. Passa a exigir a area.
--   2. my_library_cid10_ids: a orientacao marcada por CID revela o diagnostico
--      ("Cuidados na quimioterapia do cancer de mama"). Com clinical_record
--      desligada, o acompanhante ve so a orientacao universal, mesmo com
--      resources ligada. Desligar os dados clinicos nao pode vazar pela
--      biblioteca.


-- ============================================================
-- 1. schedule
-- ============================================================

ALTER POLICY appointments_select_caregiver ON public.appointments
  USING (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('schedule'))))
    AND visibility = 'team'
  );

CREATE OR REPLACE FUNCTION private.can_confirm_appointment(p_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.id = p_appointment_id
       AND ( a.patient_id = private.my_own_patient_id()
             OR ( a.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('schedule'))))
                  AND a.visibility = 'team' ) )
  );
$$;


-- ============================================================
-- 2. diary
-- ============================================================
--
-- diary_symptom_reports nao muda: as quatro politicas dela perguntam ao
-- diario (EXISTS sob a RLS de quem chama), e o diario agora responde vazio.

ALTER POLICY diary_entries_select_caregiver ON public.diary_entries
  USING (patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('diary')))));

ALTER POLICY diary_entries_insert_caregiver ON public.diary_entries
  WITH CHECK (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('diary'))))
    AND authored_by = (SELECT public.get_my_uid())
    AND acting_as = 'caregiver'
  );

ALTER POLICY diary_entries_update_caregiver ON public.diary_entries
  USING (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('diary'))))
    AND status = 'draft'
  )
  WITH CHECK (patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('diary')))));


-- ============================================================
-- 3. chat
-- ============================================================

ALTER POLICY conversations_select_caregiver ON public.conversations
  USING (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('chat'))))
    AND visibility = 'team'
  );

ALTER POLICY messages_insert_caregiver ON public.messages
  WITH CHECK (
    author_kind = 'caregiver'
    AND author_account_id = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = messages.conversation_id
         AND c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('chat'))))
         AND c.visibility = 'team'
         AND c.status = 'open'
    )
  );

CREATE OR REPLACE FUNCTION private.can_read_chat_attachment(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.message_attachments a
      JOIN public.messages      m ON m.id = a.message_id
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE a.storage_path = p_name
       AND (
         -- Titular: tudo o que e dele, restrito ou nao.
         c.patient_id = private.my_own_patient_id()
         -- Cuidador: so o que e da equipe (Visao multidisciplinar e sigilo,
         -- regra 4), e so com a area `chat` ligada (ADR-030).
         OR ( c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('chat'))))
              AND c.visibility = 'team' )
         -- Equipe: a matriz da #9, identica a da conversa.
         OR ( private.is_active_professional()
              AND ( c.visibility = 'team'
                    OR c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) ) )
         -- #11 + #23: administracao ve tudo, exceto psicologia.
         OR ( private.is_active_admin() AND c.visibility = 'team' )
       )
  );
$$;

-- Acrescimo 1: o acompanhante so anexa com a area ligada. O ramo do titular e
-- da equipe continua o mesmo (autor, conversa aberta).
CREATE OR REPLACE FUNCTION private.can_attach_to_message(p_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.messages      m
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = p_message_id
       AND m.author_account_id = auth.uid()
       AND c.status = 'open'
       AND ( m.author_kind <> 'caregiver'
             OR ( c.visibility = 'team'
                  AND private.caregiver_scope_allows(c.patient_id, 'chat') ) )
  );
$$;

CREATE OR REPLACE FUNCTION public.start_conversation(p_subject_id uuid, p_body text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id      uuid := private.my_own_patient_id();
  v_author_kind     public.message_author_kind := 'patient';
  v_conversation_id uuid;
  v_specialty_id    uuid;
BEGIN
  IF v_patient_id IS NULL THEN
    -- Cuidador abre conversa em nome do tutelado. Ele conversa no chat, e a
    -- origem aparece na tela do profissional (#22). So com a area `chat`
    -- ligada (ADR-030); desligada, cai na mesma excecao de quem nao tem vinculo.
    SELECT w INTO v_patient_id
      FROM unnest(private.my_ward_patient_ids_for('chat')) AS w
     LIMIT 1;
    v_author_kind := 'caregiver';
  END IF;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'apenas titular ou cuidador abre conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.specialty_id INTO v_specialty_id
    FROM public.conversation_subjects s
   WHERE s.id = p_subject_id AND s.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assunto inexistente ou inativo' USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.conversations
    (patient_id, subject_id, origin_specialty_id, opened_by)
  VALUES
    (v_patient_id, p_subject_id, v_specialty_id, auth.uid())
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.messages (conversation_id, author_kind, author_account_id, body)
  VALUES (v_conversation_id, v_author_kind, auth.uid(), p_body);

  RETURN v_conversation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now             timestamptz := now();
  v_is_professional boolean := private.my_professional_id() IS NOT NULL;
  v_visible         boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao sem conta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Espelha a RLS de conversations perfil a perfil. SECURITY DEFINER nao herda
  -- politica: toda mudanca la tem de ser repetida aqui.
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE c.id = p_conversation_id
       AND ( c.patient_id = private.my_own_patient_id()
             OR ( c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('chat'))))
                  AND c.visibility = 'team' )
             OR ( private.is_active_professional()
                  AND ( c.visibility = 'team'
                        OR c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) ) )
             OR ( private.is_active_admin() AND c.visibility = 'team' ) )
  ) INTO v_visible;

  IF NOT v_visible THEN
    RAISE EXCEPTION 'conversa inexistente ou fora do seu alcance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.conversation_read_marks (conversation_id, account_id, last_read_at)
  VALUES (p_conversation_id, auth.uid(), v_now)
  ON CONFLICT (conversation_id, account_id)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  IF v_is_professional THEN
    UPDATE public.conversations
       SET team_last_read_at = v_now
     WHERE id = p_conversation_id;
  END IF;
END;
$$;


-- ============================================================
-- 4. resources
-- ============================================================
--
-- content_items, content_versions, content_attachments e o bucket
-- content-attachments leem por estas duas funcoes; nenhuma politica muda.

CREATE OR REPLACE FUNCTION private.is_library_audience()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.my_own_patient_id() IS NOT NULL
      OR pg_catalog.cardinality(private.my_ward_patient_ids_for('resources')) > 0;
$$;

-- Acrescimo 2: o CID do tutelado so direciona orientacao ao acompanhante que
-- alcanca as DUAS areas. Sem clinical_record, so a orientacao universal.
CREATE OR REPLACE FUNCTION private.my_library_cid10_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(pg_catalog.array_agg(DISTINCT pd.cid10_id), '{}'::uuid[])
    FROM public.patient_diagnoses pd
   WHERE pd.patient_id = private.my_own_patient_id()
      OR ( pd.patient_id = ANY (private.my_ward_patient_ids_for('resources'))
           AND pd.patient_id = ANY (private.my_ward_patient_ids_for('clinical_record')) );
$$;


-- ============================================================
-- 5. clinical_record
-- ============================================================

ALTER POLICY patient_diagnoses_select_caregiver ON public.patient_diagnoses
  USING (patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('clinical_record')))));

ALTER POLICY treatment_plans_select_caregiver ON public.treatment_plans
  USING (patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('clinical_record')))));

ALTER POLICY patient_clinical_history_select_caregiver ON public.patient_clinical_history
  USING (patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('clinical_record')))));


-- ============================================================
-- 6. Assercao de efeito
-- ============================================================
--
-- Nenhuma politica em `public` ou `storage` usa mais o helper sem area, e
-- nenhuma das funcoes trocadas o chama. Quem escrever politica nova de
-- acompanhante com my_ward_patient_ids() cai em caregiver_scopes.test.sql,
-- que repete esta verificacao.

DO $$
DECLARE
  v_left text;
BEGIN
  SELECT string_agg(schemaname || '.' || tablename || '.' || policyname, ', ')
    INTO v_left
    FROM pg_catalog.pg_policies
   WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%my_ward_patient_ids()%';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'politica ainda sem area: %', v_left;
  END IF;

  SELECT string_agg(n.nspname || '.' || p.proname, ', ')
    INTO v_left
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname || '.' || p.proname IN (
           'private.can_confirm_appointment', 'private.can_read_chat_attachment',
           'private.can_attach_to_message',   'public.start_conversation',
           'public.mark_conversation_read',   'private.is_library_audience',
           'private.my_library_cid10_ids')
     AND p.prosrc LIKE '%my_ward_patient_ids()%';
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'funcao ainda sem area: %', v_left;
  END IF;

  -- CREATE OR REPLACE preserva ACL — mas mede-se o efeito, nao a promessa.
  IF NOT pg_catalog.has_function_privilege('authenticated', 'private.can_read_chat_attachment(text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.can_attach_to_message(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.is_library_audience()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.my_library_cid10_ids()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.start_conversation(uuid, text)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.mark_conversation_read(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE numa funcao que entra em politica ou no app';
  END IF;

  IF pg_catalog.has_function_privilege('anon', 'public.start_conversation(uuid, text)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.mark_conversation_read(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'private.can_read_chat_attachment(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca funcao do chat';
  END IF;
END;
$$;
