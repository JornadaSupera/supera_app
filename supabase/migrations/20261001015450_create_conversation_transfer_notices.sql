-- Os avisos do encaminhamento: quem recebe a conversa e avisado, o paciente e
-- notificado da mensagem de transicao como das outras mensagens da equipe, e
-- quem tinha a conversa antes de encaminha-la fica sabendo quando ela e
-- resolvida.
-- Plano das pendencias do painel de 30/09/2026, Fase H, item H.3 (painel #9;
-- Mapa 4.3.4 e 4.3.5, Medio).
-- Design e racional: supera-docs/ADRs/ADR-012 — Granularidade e corte do agregado Comunicação.md
--                    supera-docs/ADRs/ADR-015 — Granularidade e destinatário do agregado Notificações.md
--
-- O QUE HAVIA. `chat_assigned` existia desde create_notifications sem
-- produtor. O unico produtor do chat (trg_notify_team_reply) dispara em
-- author_kind = 'professional', e a mensagem de transicao e 'system' — o
-- paciente a via dentro do chat e nao recebia push. resolve_conversation nao
-- avisava ninguem.
--
-- OS TRES AVISOS
--
--   aviso                     tipo                    destinatario              dedup_key
--   conversa encaminhada      chat_assigned           quem recebe               assignment:<id da designacao nova>
--   mensagem de transicao     chat_message            titular (+ acompanhante   message:<id da mensagem system>
--                                                     com a area chat, se team)
--   encaminhada resolvida     chat_forward_resolved   quem encaminhou antes     resolved:<conversation_id>
--                             (tipo novo, team)
--
-- POR QUE O AVISO AO PACIENTE NAO VEM DO GATILHO. Bastaria estender o WHEN de
-- trg_notify_team_reply a 'system', mas toda mensagem automatica futura passaria
-- a notificar sem ninguem decidir. O aviso sai de dentro de
-- transfer_conversation, pelo mesmo private.notify_patient_audience, com a
-- mesma chave por mensagem: o acompanhante so o recebe com a area `chat` e com
-- a conversa `team` — a conversa encaminhada a Psicologia avisa so o titular.
--
-- QUEM "ENCAMINHOU ANTES" — O MOTIVO DO ENCERRAMENTO PASSA A SER GRAVADO.
-- Uma designacao se encerra por tres caminhos: encaminhamento, resolucao e
-- devolucao a fila (return_conversation_to_queue). So o primeiro e
-- "encaminhou". conversation_assignments ganha release_reason, um enum
-- (ADR-002: o codigo ramifica no valor), que as tres RPCs gravam.
--
-- A alternativa sem coluna — reconhecer o encaminhamento por
-- `released_at = assigned_at` da designacao seguinte, ja que transfer grava as
-- duas com o mesmo now() — foi escrita e DERRUBADA pela suite: now() e o
-- instante da TRANSACAO, e devolver a fila e assumir de novo na mesma
-- transacao (um lote, um script, a propria suite) produz o mesmo empate. O
-- estado tem de estar na linha, nao na coincidencia de dois relogios.
--
-- E o RESPONSAVEL no momento do encaminhamento, nao necessariamente quem
-- clicou: transfer_conversation aceita qualquer profissional da area. O
-- "profissional original" do Mapa 4.3.5 e quem estava com a conversa.
--
-- SIGILO. A conversa encaminhada a Psicologia vira `specialty_restricted`, e a
-- enfermeira que a encaminhou deixa de ve-la. Avisar "a conversa que voce
-- encaminhou foi resolvida" apontaria para uma conversa que ela nao abre, e
-- diria quando a psicologa encerrou o atendimento. Por isso:
--   * NA CRIACAO, resolve_conversation so avisa quem esta HOJE na area da
--     conversa quando ela e restrita;
--   * NO ENVIO, private.recipient_still_eligible passa a conferir, para a
--     equipe, a visibilidade da conversa alvo. Ate aqui ele aceitava qualquer
--     pessoa da equipe; agora o profissional precisa enxergar a conversa (team
--     ou da area vigente dele) e o administrador, so `team`. Vale para
--     chat_assigned tambem: quem recebeu e saiu da area antes do envio nao e
--     avisado.
--
-- NENHUM PRODUTOR TRAVA O FLUXO. Tipo aposentado pelo painel cala o aviso, nao
-- derruba o encaminhamento nem a resolucao (private.notify levantaria erro).


-- ============================================================
-- 0. O motivo do encerramento da designacao
-- ============================================================

CREATE TYPE public.assignment_release_reason AS ENUM ('transferred', 'resolved', 'returned');

COMMENT ON TYPE public.assignment_release_reason IS
  'Por que a designacao da conversa se encerrou: encaminhamento, resolucao ou devolucao a fila pelo administrador.';

ALTER TABLE public.conversation_assignments
  ADD COLUMN release_reason public.assignment_release_reason;

COMMENT ON COLUMN public.conversation_assignments.release_reason IS
  'NULL enquanto vigente. Gravado por transfer_conversation (transferred), resolve_conversation (resolved) e return_conversation_to_queue (returned). E o que diz quem encaminhou (H.3).';

-- Backfill das designacoes ja encerradas. Aqui a coincidencia dos relogios E
-- confiavel: em homologacao cada RPC rodou na propria transacao (PostgREST),
-- e so o encaminhamento abria a seguinte no mesmo now(). Resolucao: o
-- released_at e o resolved_at da conversa saem do mesmo now(). O resto e
-- devolucao a fila (E.2), a unica outra RPC que encerra designacao.
UPDATE public.conversation_assignments a
   SET release_reason = CASE
         WHEN EXISTS (SELECT 1 FROM public.conversation_assignments b
                       WHERE b.conversation_id = a.conversation_id
                         AND b.id <> a.id
                         AND b.assigned_at = a.released_at) THEN 'transferred'
         WHEN EXISTS (SELECT 1 FROM public.conversations c
                       WHERE c.id = a.conversation_id
                         AND c.resolved_at = a.released_at) THEN 'resolved'
         ELSE 'returned'
       END::public.assignment_release_reason
 WHERE a.released_at IS NOT NULL
   AND a.release_reason IS NULL;

-- Encerrada <=> com motivo. NOT VALID, validada em validate_phase_h_constraints.
ALTER TABLE public.conversation_assignments
  ADD CONSTRAINT ck_conversation_assignments_release_reason
  CHECK ((released_at IS NULL) = (release_reason IS NULL)) NOT VALID;


-- ============================================================
-- 1. O tipo novo
-- ============================================================
--
-- Silenciavel: e aviso de acompanhamento, nao dever clinico. Publico `team`:
-- nunca aparece no app, e por isso sem area de acompanhante (o CHECK
-- ck_notification_types_caregiver_scope exige NULL para `team`).
INSERT INTO public.notification_types (code, label, category, is_silenceable, sort_order, audience) VALUES
  ('chat_forward_resolved', 'Conversa encaminhada resolvida', 'chat', true, 11, 'team')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 2. O produtor da equipe
-- ============================================================
--
-- O par de private.notify_patient_audience para um profissional: tipo inativo
-- devolve NULL em vez de erro, e perfil ou conta inativos nao recebem.

CREATE FUNCTION private.notify_professional(
  p_professional_id uuid,
  p_type_code       text,
  p_dedup_key       text,
  p_target_table    text,
  p_target_id       uuid,
  p_patient_id      uuid
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_account uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_types t
                  WHERE t.code = p_type_code AND t.is_active) THEN
    RETURN NULL;
  END IF;

  SELECT p.account_id INTO v_account
    FROM public.professionals p
    JOIN public.accounts a ON a.id = p.account_id
   WHERE p.id = p_professional_id
     AND p.is_active
     AND a.is_active;

  IF v_account IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN private.notify(v_account, p_type_code, p_dedup_key,
                        p_target_table, p_target_id, p_patient_id);
END;
$$;

COMMENT ON FUNCTION private.notify_professional(uuid, text, text, text, uuid, uuid) IS
  'Notifica um profissional ativo. Tipo inativo, perfil ou conta inativos devolvem NULL: o produtor nunca trava o fluxo que o dispara.';


-- ============================================================
-- 3. transfer_conversation — avisa quem recebe e o paciente
-- ============================================================
--
-- Parte da versao de fix_conversation_specialty_lookup (E.1). Muda so o fim:
-- os ids da designacao e da mensagem voltam por RETURNING para virar chave, e
-- os dois avisos saem depois de a conversa ter sido reroteada — a visibilidade
-- lida e a do destino.

CREATE OR REPLACE FUNCTION public.transfer_conversation(
  p_conversation_id    uuid,
  p_to_professional_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_professional_id uuid := private.my_professional_id();
  v_to_specialty_id      uuid;
  v_conversation         public.conversations;
  v_assignment_id        uuid;
  v_message_id           uuid;
  v_visibility           public.clinical_visibility;
BEGIN
  IF v_from_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo encaminha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- So encaminha quem esta na especialidade da conversa — a mesma regra da
  -- escrita (#25).
  SELECT c.* INTO v_conversation
    FROM public.conversations c
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())));

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, resolvida ou de outra especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A area do DESTINO e a vigente (E.1).
  SELECT ps.specialty_id INTO v_to_specialty_id
    FROM public.professional_specialties ps
    JOIN public.professionals p ON p.id = ps.professional_id
    JOIN public.accounts     a ON a.id = p.account_id
   WHERE ps.professional_id = p_to_professional_id
     AND ps.ended_at IS NULL
     AND p.is_active AND a.is_active
   ORDER BY ps.is_primary DESC, ps.started_at DESC
   LIMIT 1;

  IF v_to_specialty_id IS NULL THEN
    RAISE EXCEPTION 'profissional destino inexistente, inativo ou sem especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- O motivo e o que resolve_conversation le para saber quem encaminhou.
  UPDATE public.conversation_assignments
     SET released_at    = now(),
         release_reason = 'transferred'
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;

  INSERT INTO public.conversation_assignments (conversation_id, professional_id, specialty_id)
  VALUES (p_conversation_id, p_to_professional_id, v_to_specialty_id)
  RETURNING id INTO v_assignment_id;

  UPDATE public.conversations
     SET origin_specialty_id      = v_to_specialty_id,
         assigned_professional_id = p_to_professional_id
   WHERE id = p_conversation_id
  RETURNING visibility INTO v_visibility;

  -- Texto GENERICO: nomear a especialidade destino vazaria pelo corpo o que a
  -- visibility acabou de fechar (comentario original em create_conversations).
  INSERT INTO public.messages (conversation_id, author_kind, body)
  VALUES (p_conversation_id, 'system',
          'Sua conversa foi encaminhada para outro profissional da equipe.')
  RETURNING id INTO v_message_id;

  -- H.3 — quem recebe. Encaminhar para si mesmo nao avisa ninguem.
  IF p_to_professional_id <> v_from_professional_id THEN
    PERFORM private.notify_professional(
      p_to_professional_id, 'chat_assigned', 'assignment:' || v_assignment_id::text,
      'conversations', p_conversation_id, v_conversation.patient_id);
  END IF;

  -- H.3 — o paciente, pelo caminho das respostas da equipe. Conversa que
  -- acabou de ficar restrita avisa so o titular.
  PERFORM private.notify_patient_audience(
    v_conversation.patient_id, 'chat_message', 'message:' || v_message_id::text,
    'conversations', p_conversation_id, v_visibility = 'team');
END;
$$;

COMMENT ON FUNCTION public.transfer_conversation(uuid, uuid) IS
  'Encaminha a conversa: libera a designacao vigente, cria a nova, reroteia, grava a mensagem de transicao (sem nomear a area) e avisa quem recebe (chat_assigned) e o paciente (chat_message; acompanhante so se a conversa segue team e com a area chat).';


-- ============================================================
-- 4. resolve_conversation — avisa quem encaminhou antes
-- ============================================================

CREATE OR REPLACE FUNCTION public.resolve_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := private.my_professional_id();
  v_conversation    public.conversations;
  v_forwarder       uuid;
BEGIN
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo resolve conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversations c
     SET status                      = 'resolved',
         resolved_at                 = now(),
         resolved_by_professional_id = v_professional_id
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())))
  RETURNING c.* INTO v_conversation;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, ja resolvida ou de outra especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversation_assignments
     SET released_at    = now(),
         release_reason = 'resolved'
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;

  -- H.3 — quem estava com a conversa quando ela foi encaminhada. Fora: quem
  -- resolveu, e — na conversa restrita — quem nao esta hoje na area dela.
  FOR v_forwarder IN
    SELECT DISTINCT a.professional_id
      FROM public.conversation_assignments a
     WHERE a.conversation_id = p_conversation_id
       AND a.release_reason = 'transferred'
       AND a.professional_id <> v_professional_id
       AND ( v_conversation.visibility = 'team'
             OR EXISTS (SELECT 1 FROM public.professional_specialties ps
                         WHERE ps.professional_id = a.professional_id
                           AND ps.specialty_id = v_conversation.origin_specialty_id
                           AND ps.ended_at IS NULL) )
  LOOP
    PERFORM private.notify_professional(
      v_forwarder, 'chat_forward_resolved', 'resolved:' || p_conversation_id::text,
      'conversations', p_conversation_id, v_conversation.patient_id);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.resolve_conversation(uuid) IS
  'Resolve a conversa da propria area, encerra a designacao aberta e avisa (chat_forward_resolved) quem estava com ela quando foi encaminhada. Conversa restrita so avisa quem esta hoje na area dela.';


-- ============================================================
-- 4b. return_conversation_to_queue — grava o motivo
-- ============================================================
--
-- Corpo de create_conversation_queue_return (E.2); muda so o motivo gravado.
-- Sem ele, a constraint da secao 0 recusaria a devolucao.

CREATE OR REPLACE FUNCTION public.return_conversation_to_queue(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversations c
     SET origin_specialty_id      = NULL,
         assigned_professional_id = NULL
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.visibility = 'team'
     AND c.origin_specialty_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found'
      USING ERRCODE = 'P0002',
            HINT    = 'So conversa aberta, ja assumida e visivel a administracao volta a fila.';
  END IF;

  UPDATE public.conversation_assignments
     SET released_at    = now(),
         release_reason = 'returned'
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;
END;
$$;


-- ============================================================
-- 5. No envio — a equipe precisa enxergar a conversa
-- ============================================================
--
-- Mesma assinatura (preserva o EXECUTE de service_role). Parte da versao de
-- apply_caregiver_scopes_to_notifications; o que entra e o ramo da equipe com
-- alvo em conversations.

CREATE OR REPLACE FUNCTION private.recipient_still_eligible(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n          record;
  v_titular    boolean;
  v_staff      boolean;
  v_caregiver  boolean;
  v_visibility public.clinical_visibility;
  v_status     text;
  v_specialty  uuid;
BEGIN
  SELECT n.recipient_account_id, n.patient_id, n.target_table, n.target_id,
         n.type_id, a.is_active AS account_active, t.code AS type_code
    INTO v_n
    FROM public.notifications n
    JOIN public.accounts a           ON a.id = n.recipient_account_id
    JOIN public.notification_types t ON t.id = n.type_id
   WHERE n.id = p_notification_id;

  IF NOT FOUND OR NOT v_n.account_active THEN
    RETURN false;
  END IF;

  IF v_n.patient_id IS NULL THEN
    RETURN true;
  END IF;

  v_titular := EXISTS (SELECT 1 FROM public.patients p
                        WHERE p.id = v_n.patient_id
                          AND p.account_id = v_n.recipient_account_id);
  -- A equipe: o vinculo dela nao e por paciente (resposta #10).
  v_staff := EXISTS (SELECT 1 FROM public.professionals pr
                      WHERE pr.account_id = v_n.recipient_account_id)
          OR EXISTS (SELECT 1 FROM public.admins ad
                      WHERE ad.account_id = v_n.recipient_account_id);
  -- O acompanhante: REAVALIADO agora, nao quando a linha nasceu.
  v_caregiver := NOT v_titular AND NOT v_staff
             AND EXISTS (SELECT 1
                           FROM public.patient_caregivers pc
                           JOIN public.caregivers c ON c.id = pc.caregiver_id
                          WHERE c.account_id = v_n.recipient_account_id
                            AND pc.patient_id = v_n.patient_id
                            AND pc.status = 'active');

  IF NOT (v_titular OR v_staff OR v_caregiver) THEN
    RETURN false;
  END IF;

  -- ADR-030 §8: a area tambem e reavaliada no envio.
  IF v_caregiver
     AND NOT private.notification_area_allows(v_n.recipient_account_id, v_n.patient_id,
                                              v_n.type_id, v_n.target_table, v_n.target_id) THEN
    RETURN false;
  END IF;

  IF v_n.target_table = 'appointments' THEN
    SELECT ap.visibility, s.code INTO v_visibility, v_status
      FROM public.appointments ap
      JOIN public.appointment_statuses s ON s.id = ap.status_id
     WHERE ap.id = v_n.target_id;

    IF v_caregiver AND v_visibility IS DISTINCT FROM 'team' THEN
      RETURN false;
    END IF;
    IF v_n.type_code IN ('appointment_reminder_24h', 'appointment_reminder_2h')
       AND v_status IS DISTINCT FROM 'scheduled' THEN
      RETURN false;
    END IF;

  ELSIF v_n.target_table = 'conversations' AND v_caregiver THEN
    IF NOT EXISTS (SELECT 1 FROM public.conversations c
                    WHERE c.id = v_n.target_id AND c.visibility = 'team') THEN
      RETURN false;
    END IF;

  -- H.3: a equipe so e avisada da conversa que enxerga. O mesmo recorte das
  -- politicas de leitura de conversations: o profissional ativo ve `team` e o
  -- que e da area vigente dele; o administrador, so `team`. O titular que
  -- tambem e da equipe cai aqui so se nao for o dono da ficha.
  ELSIF v_n.target_table = 'conversations' AND v_staff AND NOT v_titular THEN
    SELECT c.visibility, c.origin_specialty_id INTO v_visibility, v_specialty
      FROM public.conversations c
     WHERE c.id = v_n.target_id;

    IF v_visibility IS NULL THEN
      RETURN false;
    END IF;

    IF v_visibility <> 'team'
       AND NOT EXISTS (SELECT 1
                         FROM public.professionals pr
                         JOIN public.professional_specialties ps ON ps.professional_id = pr.id
                        WHERE pr.account_id = v_n.recipient_account_id
                          AND pr.is_active
                          AND ps.specialty_id = v_specialty
                          AND ps.ended_at IS NULL) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION private.recipient_still_eligible(uuid) IS
  'Reavalia NO ENVIO o vinculo do destinatario, a area do acompanhante (ADR-030 §8) e o alvo: acompanhante revogado ou sem a area, alvo que passou a restrito, lembrete de compromisso que deixou de estar agendado e — desde a H.3 — conversa que a pessoa da equipe deixou de enxergar saem como skipped, nunca como sent (ADR-015 §4, ADR-024).';


-- ============================================================
-- 6. Privilegios — SEMPRE no fim
-- ============================================================
--
-- notify_professional recebe o destinatario: so o dono (postgres) a executa,
-- por dentro das RPCs DEFINER acima. CREATE OR REPLACE preserva o ACL das
-- demais; a repeticao protege contra o default privilege (ADR-016).

REVOKE EXECUTE ON FUNCTION private.notify_professional(uuid, text, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_conversation(uuid)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid)    FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid)     TO authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_conversation(uuid)            TO authenticated;
GRANT  EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid)    TO authenticated;

DO $$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_function_privilege(v_role,
         'private.notify_professional(uuid, text, text, text, uuid, uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION '% alcanca notify_professional — criaria notificacao para qualquer profissional', v_role;
    END IF;
  END LOOP;

  -- A rotina de push nao pode parar.
  IF NOT pg_catalog.has_function_privilege('service_role', 'private.recipient_still_eligible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu a peneira de envio — o push pararia';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.notification_types
                  WHERE code = 'chat_forward_resolved'
                    AND audience = 'team'
                    AND caregiver_scope IS NULL
                    AND is_active) THEN
    RAISE EXCEPTION 'o tipo chat_forward_resolved nao nasceu como tipo ativo da equipe';
  END IF;

  IF EXISTS (SELECT 1 FROM public.conversation_assignments
              WHERE (released_at IS NULL) <> (release_reason IS NULL)) THEN
    RAISE EXCEPTION 'designacao encerrada sem motivo depois do backfill';
  END IF;
END;
$$;
