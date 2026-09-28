-- Fase 2.2 das pendencias consolidadas (app #9, painel T-4): as notificacoes do
-- paciente ganham produtor.
--
-- Desde 28/08/2026 a caixa, as preferencias, o registro de aparelho e a fila
-- de envio existiam, e seis dos nove tipos de notification_types nao tinham
-- quem os produzisse. So o alerta (create_alerts) chamava private.notify. Esta
-- migration liga os seis tipos do paciente:
--
--   tipo                      produtor                                   dedup_key
--   appointment_scheduled     trigger AFTER INSERT em appointments       appt:<id>:scheduled
--   appointment_changed       o mesmo INSERT, quando e remarcacao        appt:<id>:rescheduled
--                             trigger de estado, quando e cancelamento   appt:<id>:cancelled
--   appointment_reminder_24h  rotina pg_cron, a cada 5 min               appt:<id>:24h
--   appointment_reminder_2h   a mesma rotina                             appt:<id>:2h
--   chat_message              trigger AFTER INSERT em messages           message:<id>
--   content_published         trigger na aprovacao da versao             content:<item_id>
--
-- DESTINATARIOS: o titular (se a ficha tem conta ativa) e o acompanhante com
-- vinculo ativo — EXCETO quando o alvo e restrito. Conversa e compromisso de
-- especialidade sigilosa notificam so o titular: a existencia deles e, ela
-- mesma, o dado sigiloso (restrict_caregiver_confidential, Fase 1.2).
--
-- O QUE NENHUMA NOTIFICACAO LEVA: texto. A linha continua sem coluna de
-- conteudo (ADR-015 §2); o que viaja e o codigo do tipo e a referencia ao alvo.
--
-- TRES DECISOES QUE O PEDIDO NAO TOMAVA, e o motivo de cada uma (ADR-024):
--   * Compromisso marcado com MENOS de 24 h de antecedencia nao recebe o
--     lembrete de 24 h — o aviso "novo compromisso" acabou de sair. O mesmo
--     vale para o de 2 h. Sem isto, marcar uma consulta para daqui a uma hora
--     produziria tres avisos no mesmo minuto.
--   * Lembrete tem PRAZO: a entrega expira no inicio do compromisso. A janela
--     de silencio atrasa o envio (create_notifications §8), e um lembrete de
--     2 h adiado para depois da consulta e desinformacao, nao lembrete.
--   * Orientacao notifica na PRIMEIRA publicacao. A chave e por item, nao por
--     versao: corrigir um texto ja publicado nao dispara um segundo aviso.
--
-- E UMA CORRECAO que o pedido nao listava: private.recipient_still_eligible
-- reavaliava o VINCULO do cuidador no envio, mas nao o ALVO. Conversa que
-- passa a restrita depois de a notificacao nascer sairia no aparelho do
-- acompanhante assim mesmo. O envio agora reavalia tambem o alvo.
--
-- Nenhum destes produtores pode travar o fluxo que o dispara: tipo desativado
-- na tabela de dominio faz o produtor calar, nao levantar erro dentro de
-- schedule_appointment ou do INSERT da mensagem.


-- ============================================================
-- 1. O publico de um paciente — titular e, se couber, acompanhante
-- ============================================================
--
-- Espelha as condicoes de private.my_own_patient_id() e
-- private.my_ward_patient_ids(): conta ativa, perfil ativo, ficha ativa,
-- vinculo ativo. Quem nao ve o dado pela RLS nao e avisado dele.

CREATE FUNCTION private.notify_patient_audience(
  p_patient_id         uuid,
  p_type_code          text,
  p_dedup_key          text,
  p_target_table       text,
  p_target_id          uuid,
  p_include_caregivers boolean,
  p_give_up_at         timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account uuid;
  v_id      uuid;
  v_count   integer := 0;
BEGIN
  -- Tipo aposentado cala o produtor. private.notify levantaria erro, e o erro
  -- abortaria a marcacao do compromisso ou o envio da mensagem.
  IF NOT EXISTS (SELECT 1 FROM public.notification_types t
                  WHERE t.code = p_type_code AND t.is_active) THEN
    RETURN 0;
  END IF;

  FOR v_account IN
    SELECT p.account_id
      FROM public.patients p
      JOIN public.accounts a ON a.id = p.account_id
     WHERE p.id = p_patient_id
       AND p.is_active
       AND a.is_active
    UNION
    SELECT c.account_id
      FROM public.patient_caregivers pc
      JOIN public.caregivers c ON c.id = pc.caregiver_id
      JOIN public.accounts   a ON a.id = c.account_id
      JOIN public.patients   p ON p.id = pc.patient_id
     WHERE p_include_caregivers
       AND pc.patient_id = p_patient_id
       AND pc.status = 'active'
       AND c.is_active
       AND a.is_active
       AND p.is_active
  LOOP
    v_id := private.notify(v_account, p_type_code, p_dedup_key,
                           p_target_table, p_target_id, p_patient_id);
    IF v_id IS NOT NULL THEN
      v_count := v_count + 1;
      IF p_give_up_at IS NOT NULL THEN
        UPDATE public.notification_deliveries d
           SET give_up_at = p_give_up_at
         WHERE d.notification_id = v_id
           AND d.status = 'pending'
           AND d.give_up_at IS NULL;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.notify_patient_audience(uuid, text, text, text, uuid, boolean, timestamptz) IS
  'Notifica o titular e, com p_include_caregivers, o acompanhante ativo. Alvo restrito passa false. Tipo inativo devolve 0 em vez de erro: o produtor nunca trava o fluxo que o dispara.';


-- ============================================================
-- 2. Agenda — marcado, remarcado, cancelado
-- ============================================================
--
-- Compromisso do passado nao avisa ninguem: e registro retroativo, nao
-- agenda. Remarcar cria a linha nova (reschedule_appointment); o aviso sai
-- dela, como "alterado", e a linha antiga — que vai a 'rescheduled' — cala.

CREATE FUNCTION private.notify_appointment_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.starts_at <= pg_catalog.now() THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.appointment_statuses s
                  WHERE s.id = NEW.status_id AND s.code = 'scheduled') THEN
    RETURN NULL;
  END IF;

  IF NEW.rescheduled_from_id IS NULL THEN
    PERFORM private.notify_patient_audience(
      NEW.patient_id, 'appointment_scheduled', 'appt:' || NEW.id::text || ':scheduled',
      'appointments', NEW.id, NEW.visibility = 'team');
  ELSE
    PERFORM private.notify_patient_audience(
      NEW.patient_id, 'appointment_changed', 'appt:' || NEW.id::text || ':rescheduled',
      'appointments', NEW.id, NEW.visibility = 'team');
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_appointment_created
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.notify_appointment_created();

-- Falta e realizado sao registro depois do fato; so o cancelamento muda o que
-- o paciente tem de fazer.
CREATE FUNCTION private.notify_appointment_cancelled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.starts_at <= pg_catalog.now() THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.appointment_statuses s
                  WHERE s.id = NEW.status_id AND s.code = 'cancelled') THEN
    RETURN NULL;
  END IF;

  PERFORM private.notify_patient_audience(
    NEW.patient_id, 'appointment_changed', 'appt:' || NEW.id::text || ':cancelled',
    'appointments', NEW.id, NEW.visibility = 'team');

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_appointment_cancelled
AFTER UPDATE OF status_id ON public.appointments
FOR EACH ROW
WHEN (OLD.status_id IS DISTINCT FROM NEW.status_id)
EXECUTE FUNCTION private.notify_appointment_cancelled();


-- ============================================================
-- 3. Lembretes de 24 h e 2 h — rotina agendada
-- ============================================================
--
-- Sem tabela de lembrete agendado, de proposito (create_notifications cortou
-- scheduled_notifications): a rotina le appointments.starts_at a cada volta.
-- Compromisso remarcado ou cancelado sai do recorte sozinho, porque deixa de
-- ser 'scheduled'. Reprocessar a mesma janela nao duplica nada — a chave de
-- dedup e (destinatario, tipo, appt:<id>:24h).
--
-- A JANELA de cada lembrete:
--   24 h: de 24 h antes ate o inicio da janela de 2 h;
--    2 h: de 2 h antes ate o inicio.
-- E so para compromisso marcado ANTES da janela abrir (created_at): quem
-- marcou com menos antecedencia acabou de receber "novo compromisso".
--
-- O recorte por starts_at usa idx_appointments_period (create_clinical_summaries).

CREATE FUNCTION private.enqueue_appointment_reminders()
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   record;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT a.id, a.patient_id, a.visibility, a.starts_at, w.type_code, w.suffix
      FROM public.appointments a
      JOIN public.appointment_statuses s
        ON s.id = a.status_id AND s.code = 'scheduled'
     CROSS JOIN (VALUES
       ('appointment_reminder_24h', '24h', interval '24 hours', interval '2 hours'),
       ('appointment_reminder_2h',  '2h',  interval '2 hours',  interval '0')
     ) AS w(type_code, suffix, opens, closes)
     WHERE a.starts_at >  pg_catalog.now() + w.closes
       AND a.starts_at <= pg_catalog.now() + w.opens
       AND a.created_at <= a.starts_at - w.opens
  LOOP
    v_count := v_count + private.notify_patient_audience(
      v_row.patient_id, v_row.type_code,
      'appt:' || v_row.id::text || ':' || v_row.suffix,
      'appointments', v_row.id, v_row.visibility = 'team',
      v_row.starts_at);
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.enqueue_appointment_reminders() IS
  'Rotina pg_cron (appointment-reminders, a cada 5 min). Idempotente pela chave de dedup. A entrega do lembrete expira no inicio do compromisso (give_up_at).';

SELECT cron.schedule(
  'appointment-reminders',
  '*/5 * * * *',
  $$SELECT private.enqueue_appointment_reminders()$$
);


-- ============================================================
-- 4. Chat — resposta da equipe
-- ============================================================
--
-- So o autor profissional. A mensagem 'system' (transferencia) nao avisa: ela
-- descreve um movimento interno da equipe. E mensagem do proprio paciente ou
-- do acompanhante tampouco — quem escreveu sabe que escreveu.
--
-- O alvo e a CONVERSA, nao a mensagem: e para la que o app navega, e o push
-- agrupa por conversa no aparelho (collapse_id na Edge Function). A chave e
-- por mensagem, para que a caixa mostre cada resposta.

CREATE FUNCTION private.notify_team_reply()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid;
  v_visibility public.clinical_visibility;
BEGIN
  SELECT c.patient_id, c.visibility INTO v_patient_id, v_visibility
    FROM public.conversations c
   WHERE c.id = NEW.conversation_id;

  PERFORM private.notify_patient_audience(
    v_patient_id, 'chat_message', 'message:' || NEW.id::text,
    'conversations', NEW.conversation_id, v_visibility = 'team');

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_team_reply
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.author_kind = 'professional')
EXECUTE FUNCTION private.notify_team_reply();


-- ============================================================
-- 5. Orientacao publicada
-- ============================================================
--
-- O publico e exatamente o que a RLS de content_versions deixaria ler
-- (private.is_content_visible_to_me): conteudo sem marcacao de CID e de todos;
-- conteudo marcado, de quem tem aquele diagnostico. O acompanhante entra:
-- orientacao nao carrega visibility e nao e dado clinico de ninguem.
--
-- A chave e por ITEM: a segunda versao aprovada da mesma orientacao cai no
-- ON CONFLICT e nao avisa de novo.
--
-- Custo declarado: roda dentro da transacao da aprovacao, uma chamada de
-- notify por destinatario. Na escala de uma clinica (milhares de fichas) sao
-- milissegundos por ficha; se um dia pesar, o destino e a mesma rotina
-- agendada dos lembretes, nao um trigger mais esperto.

CREATE FUNCTION private.notify_content_published()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  FOR v_patient_id IN
    SELECT p.id
      FROM public.patients p
     WHERE p.is_active
       AND ( NOT EXISTS (SELECT 1 FROM public.content_cid10 cc
                          WHERE cc.content_item_id = NEW.content_item_id)
             OR EXISTS (SELECT 1
                          FROM public.content_cid10 cc
                          JOIN public.patient_diagnoses pd ON pd.cid10_id = cc.cid10_id
                         WHERE cc.content_item_id = NEW.content_item_id
                           AND pd.patient_id = p.id) )
  LOOP
    PERFORM private.notify_patient_audience(
      v_patient_id, 'content_published', 'content:' || NEW.content_item_id::text,
      'content_items', NEW.content_item_id, true);
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_content_published
AFTER UPDATE OF status ON public.content_versions
FOR EACH ROW
WHEN (OLD.status = 'in_review' AND NEW.status = 'published')
EXECUTE FUNCTION private.notify_content_published();


-- ============================================================
-- 6. Elegibilidade no envio — o vinculo E o alvo
-- ============================================================
--
-- Ate aqui a funcao reavaliava so o VINCULO do acompanhante (ADR-015 §4). Com
-- produtor de agenda e chat, o ALVO tambem muda entre a criacao e o envio:
--   * conversa assumida pela Psicologia passa a restrita — o acompanhante
--     deixou de ve-la, e o push que sairia para ele revela que ela existe;
--   * compromisso cancelado depois de o lembrete nascer — o lembrete manda a
--     paciente a uma consulta que nao existe (o argumento que cortou
--     scheduled_notifications em 28/08).
-- Mesma assinatura: CREATE OR REPLACE preserva dono e o EXECUTE de
-- service_role concedido em grant_delivery_helper_to_service_role.

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
BEGIN
  SELECT n.recipient_account_id, n.patient_id, n.target_table, n.target_id,
         a.is_active AS account_active, t.code AS type_code
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
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION private.recipient_still_eligible(uuid) IS
  'Reavalia NO ENVIO o vinculo do destinatario e o alvo: acompanhante revogado, alvo que passou a restrito e lembrete de compromisso que deixou de estar agendado saem como skipped, nunca como sent (ADR-015 §4, ADR-024).';


-- ============================================================
-- 7. A fila se recupera sozinha
-- ============================================================
--
-- Duas pontas que a fila de 28/08 deixava soltas, e que so aparecem quando
-- ha consumidor de verdade:
--   * entrega em 'sending' cuja Edge Function morreu no meio (timeout, deploy)
--     ficava 'sending' para sempre. Passados 10 min, volta a 'pending'. O
--     reenvio nao duplica o push: a Edge Function manda o id da entrega como
--     chave de idempotencia ao provedor;
--   * entrega com give_up_at vencido nunca era escolhida e nunca saia de
--     'pending'. Agora vira 'given_up', que e o que ela e.
-- Mesma assinatura e mesmo SECURITY INVOKER: quem chama continua decidido por
-- privilegio (so service_role).

CREATE OR REPLACE FUNCTION public.claim_notification_deliveries(p_limit smallint DEFAULT 100)
RETURNS SETOF public.notification_deliveries
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  UPDATE public.notification_deliveries d
     SET status = 'pending', last_error = 'envio interrompido: devolvida a fila'
   WHERE d.status = 'sending'
     AND d.updated_at < pg_catalog.now() - interval '10 minutes';

  UPDATE public.notification_deliveries d
     SET status = 'given_up', last_error = 'prazo de envio vencido'
   WHERE d.status = 'pending'
     AND d.give_up_at IS NOT NULL
     AND d.give_up_at <= pg_catalog.now();

  -- A peneira: quem deixou de ser elegivel NAO e enviado.
  UPDATE public.notification_deliveries d
     SET status = 'skipped', last_error = 'destinatario ou alvo deixou de ser elegivel'
   WHERE d.status = 'pending'
     AND NOT private.recipient_still_eligible(d.notification_id);

  RETURN QUERY
  UPDATE public.notification_deliveries d
     SET status = 'sending', attempts = d.attempts + 1
   WHERE d.id IN (
     SELECT dd.id
       FROM public.notification_deliveries dd
      WHERE dd.status = 'pending'
        AND dd.next_attempt_at <= pg_catalog.now()
        AND (dd.give_up_at IS NULL OR dd.give_up_at > pg_catalog.now())
      ORDER BY dd.next_attempt_at
      LIMIT LEAST(p_limit, 500)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING d.*;
END;
$$;

-- A varredura do lease expirado.
CREATE INDEX idx_notification_deliveries_in_flight
  ON public.notification_deliveries (updated_at)
  WHERE status = 'sending';


-- ============================================================
-- 8. Privilegios — SEMPRE no fim
-- ============================================================
--
-- Funcao nova em `private` nasce com EXECUTE para PUBLIC, e authenticated tem
-- USAGE no schema (as politicas chamam helpers de la). Sem o REVOKE, o
-- paciente chamaria notify_patient_audience e se mandaria push. As funcoes de
-- trigger tambem: EXECUTE de trigger so e conferido no CREATE TRIGGER, e
-- nenhum usuario tem por que chama-las direto.

REVOKE EXECUTE ON FUNCTION private.notify_patient_audience(uuid, text, text, text, uuid, boolean, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.notify_appointment_created()    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.notify_appointment_cancelled()  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.enqueue_appointment_reminders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.notify_team_reply()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.notify_content_published()      FROM PUBLIC, anon, authenticated;

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'private.notify_patient_audience(uuid, text, text, text, uuid, boolean, timestamptz)',
    'private.notify_appointment_created()',
    'private.notify_appointment_cancelled()',
    'private.enqueue_appointment_reminders()',
    'private.notify_team_reply()',
    'private.notify_content_published()'
  ] LOOP
    IF pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION '% alcancavel por usuario da API', v_fn;
    END IF;
  END LOOP;

  -- O outro lado: o CREATE OR REPLACE nao pode ter derrubado a fila.
  IF NOT pg_catalog.has_function_privilege('service_role',
         'private.recipient_still_eligible(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role',
         'public.claim_notification_deliveries(smallint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu a fila de envio';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated',
         'public.claim_notification_deliveries(smallint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated alcanca a fila de envio';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'appointment-reminders') THEN
    RAISE EXCEPTION 'job appointment-reminders nao foi agendado';
  END IF;
END;
$$;
