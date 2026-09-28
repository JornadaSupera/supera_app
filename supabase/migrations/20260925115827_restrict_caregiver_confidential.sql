-- Fase 1.2 das pendencias consolidadas (app #27): o acompanhante enxergava e
-- escrevia em conteudo sigiloso.
--
-- O REQUISITO E TEXTUAL, e a modelagem o contrariava: "o cuidador nao ve
-- conteudo sigiloso" (Requisitos/Painel Clinico/Visao multidisciplinar e
-- sigilo, regra 4; repetido em Espacos de trabalho por especialidade). A
-- conversa e o compromisso ganharam `visibility` pela ADR-003 §3, mas as
-- politicas do cuidador foram escritas como copia da do titular — e a suite
-- chegou a afirmar o contrario ("o sigilo e ENTRE ESPECIALIDADES, nao contra o
-- titular"), estendendo ao acompanhante uma frase que so vale para o titular.
--
-- O QUE MUDA, e so para o cuidador:
--   * conversations e appointments: le so `visibility = 'team'`;
--   * messages: nao escreve em conversa restrita;
--   * as quatro funcoes SECURITY DEFINER que repetiam a derivacao do cuidador
--     fora da RLS (marca de leitura, leitura do arquivo do chat, registro de
--     anexo, confirmacao de compromisso). Funcao SECURITY DEFINER nao herda a
--     politica: se so a politica mudasse, a funcao continuaria respondendo
--     "sim" — e a marca de leitura viraria oraculo da EXISTENCIA da conversa.
--
-- O QUE NAO MUDA:
--   * o TITULAR continua vendo a propria agenda e as proprias conversas
--     inteiras. Para ele o sigilo e entre especialidades, e a frase da suite
--     continua certa;
--   * messages e message_attachments nao sao tocadas na LEITURA: elas derivam
--     da conversa por EXISTS sob a RLS de quem consulta, e herdam o recorte;
--   * orientacoes (conteudo educativo) continuam liberadas ao cuidador — nao
--     carregam visibility e nao sao conteudo clinico de ninguem.
--
-- EFEITO QUE FICA DECLARADO: conversa aberta pelo cuidador e depois assumida
-- pela Psicologia SOME da lista dele. E o comportamento pedido — a existencia
-- da conversa de psicologia e, ela mesma, o dado sigiloso.


-- ============================================================
-- 1. Leitura direta
-- ============================================================

ALTER POLICY conversations_select_caregiver ON public.conversations
  USING (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
    AND visibility = 'team'
  );

ALTER POLICY appointments_select_caregiver ON public.appointments
  USING (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
    AND visibility = 'team'
  );


-- ============================================================
-- 2. Escrita direta no chat
-- ============================================================
--
-- O EXISTS abaixo ja roda sob a RLS do cuidador e, depois do §1, nao enxerga a
-- conversa restrita. O predicado explicito fica mesmo assim: politica de
-- escrita que depende de OUTRA politica para negar e a barreira unica que a
-- proxima refatoracao remove sem perceber.

ALTER POLICY messages_insert_caregiver ON public.messages
  WITH CHECK (
    author_kind = 'caregiver'
    AND author_account_id = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_id
         AND c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
         AND c.visibility = 'team'
         AND c.status = 'open'
    )
  );


-- ============================================================
-- 3. As funcoes que repetiam a derivacao fora da RLS
-- ============================================================

-- 3.1 Marca de leitura. Sem o recorte, o cuidador descobriria por tentativa que
-- existe conversa restrita com aquele id: "marcou" versus "fora do seu alcance".
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
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
             OR ( c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
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

-- 3.2 O arquivo do chat. A politica do bucket chama esta funcao; o recorte da
-- tabela nao chegaria ao Storage sem ela.
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
         -- Cuidador: so o que e da equipe (Visao multidisciplinar e sigilo, regra 4).
         OR ( c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
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

-- 3.3 Registrar anexo. A regra "o autor anexa a propria mensagem" nao olhava a
-- conversa alem do status: o cuidador que escreveu antes de a Psicologia
-- assumir continuaria anexando arquivo numa conversa que ja nao enxerga.
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
       AND ( m.author_kind <> 'caregiver' OR c.visibility = 'team' )
  );
$$;

-- 3.4 Confirmar comparecimento. Confirmar sessao que nao se ve e, de novo,
-- oraculo: "confirmado" versus "apenas o titular ou quem o acompanha".
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
             OR ( a.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
                  AND a.visibility = 'team' ) )
  );
$$;


-- ============================================================
-- 4. Asserção de efeito
-- ============================================================
--
-- CREATE OR REPLACE preserva dono e ACL, e ALTER POLICY preserva o role. Mede
-- os dois lados mesmo assim: que as funcoes que entram em politica continuam
-- executaveis por quem consulta, e que `anon` nao ganhou nada no caminho.
DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated',
         'public.mark_conversation_read(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em mark_conversation_read';
  END IF;
  IF pg_catalog.has_function_privilege('anon',
         'public.mark_conversation_read(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca mark_conversation_read';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated',
         'private.can_read_chat_attachment(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em can_read_chat_attachment — o bucket do chat ficaria mudo';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated',
         'private.can_attach_to_message(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em can_attach_to_message — ninguem anexaria';
  END IF;
END;
$$;
