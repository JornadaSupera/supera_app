-- Avisos da equipe pelas acoes do paciente no app: cinco tipos novos, os
-- produtores e a peneira de envio que os acompanha.
-- Pendencia [40] de 24/10/2026 (outputs/pendecias.md).
-- Design e racional: supera-docs/ADRs/ADR-024 — Produtores de notificação e envio do push.md (§7)
--
-- O QUE HAVIA. So cinco tipos chegavam ao painel (critical_alert,
-- alert_assigned, chat_assigned, chat_forward_resolved, report_ready; conferido
-- em homologacao em 24/10). Pedido do titular, consentimento revogado,
-- confirmacao de presenca e a abertura da orientacao enviada nao avisavam
-- ninguem, e o front-end nao cria notificacao (guia 5.8).
--
-- OS CINCO AVISOS
--
--   acao                      tipo                     destinatario             dedup_key
--   pedido LGPD               data_subject_request     administracao ativa      dsr:<id>
--   consentimento revogado    consent_revoked          administracao ativa      consent:<id>:revoked
--   presenca confirmada       appointment_confirmed    profissional do          appt:<id>:confirmed:<clock_timestamp>
--                                                      compromisso
--   confirmacao desfeita      appointment_unconfirmed  o mesmo                  appt:<id>:unconfirmed:<clock_timestamp>
--   orientacao enviada aberta content_directed_read    quem enviou              directed:<id>:opened
--
-- O QUE O PEDIDO TRAZIA E NAO ENTROU, e o motivo (ADR-024 §7):
--   * diary_submitted — nao existe "equipe do paciente": a #10 tirou o vinculo
--     de cuidado da regra de acesso, e todo profissional ativo le todo diario
--     salvo. Cada diario avisaria a equipe inteira e abafaria o critical_alert,
--     que e o aviso do diario que pede acao. Espera a carteira (D4).
--   * terms_accepted e patient_activated — nascem no mesmo cadastro, e a versao
--     nova dos termos avisaria cada administrador uma vez por paciente. Nada
--     disso pede acao; o fato ja esta em consent_records e na trilha.
--   * nps_answered e caregiver_changed — o NPS se le no relatorio, e o vinculo
--     do acompanhante ja tem trilha propria (Fase 3).
--
-- SO A CONFIRMACAO DO APP AVISA. O aviso sai de dentro de confirm_appointment e
-- unconfirm_appointment, nao de um gatilho em appointments.confirmed_at: a
-- sincronizacao futura com o Gemed ([38] item 8) decide por si se avisa.
--
-- E SO A MUDANCA DE ESTADO. Confirmar o que ja estava confirmado e desfazer o
-- que nao estava continuam aceitos (o segundo e idempotente desde a 6.11), e
-- nao avisam. A chave leva o instante: confirmar, desfazer e confirmar de novo
-- sao dois avisos de confirmacao, e sem o instante o UNIQUE engoliria o segundo.
--
-- O patient_id DOS AVISOS DE PRIVACIDADE so existe quando quem pede e o
-- titular. data_subject_requests e consent_records guardam a CONTA; o pedido do
-- acompanhante e sobre os dados dele, nao do tutelado, e nasce sem ficha. A
-- peneira de envio trata esses dois alvos ANTES do atalho do patient_id nulo.
--
-- SIGILO. A equipe so e avisada do que enxerga, na criacao e no envio. A sessao
-- de Psicologia avisa a psicologa do compromisso enquanto ela for da area; o
-- envio dirigido de Psicologia, a autora enquanto for da area. Os helpers my_*
-- nao servem aqui: nos gatilhos e nas RPCs do app, quem chama e o paciente. O
-- recorte e medido pela CONTA do destinatario (staff_account_sees), e a regra
-- provisoria do envio dirigido (ADR-032) continua num helper so.
--
-- NENHUM PRODUTOR TRAVA A ACAO. Tipo aposentado pelo painel cala o aviso, nao
-- derruba o pedido, a revogacao, a confirmacao nem a abertura.


-- ============================================================
-- 1. A categoria "privacy"
-- ============================================================
--
-- Pedido do titular e consentimento nao sao agenda, chat, conteudo, alerta nem
-- relatorio. Mesmo caminho da categoria "report" (refine_notification_types
-- §3): a constraint sai e volta NOT VALID, e a validacao fica em migration
-- propria (validate_team_activity_notice_constraints).
ALTER TABLE public.notification_types DROP CONSTRAINT ck_notification_types_category;

ALTER TABLE public.notification_types
  ADD CONSTRAINT ck_notification_types_category
  CHECK (category IN ('agenda', 'chat', 'content', 'alert', 'report', 'privacy')) NOT VALID;


-- ============================================================
-- 2. Os cinco tipos
-- ============================================================
--
-- Publico `team`, sem area de acompanhante (o CHECK
-- ck_notification_types_caregiver_scope exige NULL para `team`). O rotulo nao
-- nomeia especialidade, como o de content_directed (ADR-032 §6).
--
-- OS DOIS DE PRIVACIDADE SAO INSILENCIAVEIS. O pedido do titular tem prazo
-- legal do controlador (LGPD art. 18 e 19), e a revogacao muda a base legal do
-- tratamento. Silenciar seria a administracao deixar de saber de um dever, e a
-- FK composta de notification_preferences recusa a preferencia.
INSERT INTO public.notification_types
  (code, label, category, is_silenceable, sort_order, audience, caregiver_scope)
VALUES
  ('data_subject_request',    'Novo pedido do titular (LGPD)',         'privacy', false, 14, 'team', NULL),
  ('consent_revoked',         'Consentimento revogado',                'privacy', false, 15, 'team', NULL),
  ('appointment_confirmed',   'Presença confirmada pelo paciente',     'agenda',  true,  16, 'team', NULL),
  ('appointment_unconfirmed', 'Confirmação de presença desfeita',      'agenda',  true,  17, 'team', NULL),
  ('content_directed_read',   'O paciente abriu a orientação enviada', 'content', true,  18, 'team', NULL)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 3. O recorte da equipe medido pela conta
-- ============================================================

-- O par de private.my_specialty_ids() para uma conta qualquer.
CREATE FUNCTION private.account_specialty_ids(p_account_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(ps.specialty_id), '{}'::uuid[])
    FROM public.professional_specialties ps
    JOIN public.professionals p ON p.id = ps.professional_id
    JOIN public.accounts      a ON a.id = p.account_id
   WHERE a.id = p_account_id
     AND a.is_active
     AND p.is_active
     AND ps.ended_at IS NULL;
$$;

COMMENT ON FUNCTION private.account_specialty_ids(uuid) IS
  'As especialidades vigentes da conta, com conta e perfil ativos. Par de my_specialty_ids() para quando quem chama nao e quem recebe ([40]).';

-- O recorte das politicas da equipe sobre dado com visibility (ADR-003):
-- profissional ativo ve `team` e o que e da area vigente dele; administrador
-- ativo, so `team`. E o USING de appointments_select_professional/_admin,
-- medido pela conta do destinatario.
CREATE FUNCTION private.staff_account_sees(
  p_account_id          uuid,
  p_visibility          public.clinical_visibility,
  p_origin_specialty_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
           CASE
             WHEN EXISTS (SELECT 1 FROM public.professionals p
                            JOIN public.accounts a ON a.id = p.account_id
                           WHERE a.id = p_account_id AND a.is_active AND p.is_active) THEN
               p_visibility = 'team'
               OR p_origin_specialty_id = ANY (private.account_specialty_ids(p_account_id))
             WHEN EXISTS (SELECT 1 FROM public.admins ad
                            JOIN public.accounts a ON a.id = ad.account_id
                           WHERE a.id = p_account_id AND a.is_active AND ad.is_active) THEN
               p_visibility = 'team'
             ELSE false
           END,
           false);
$$;

COMMENT ON FUNCTION private.staff_account_sees(uuid, public.clinical_visibility, uuid) IS
  'A conta da equipe enxerga um dado com este escopo? O recorte da ADR-003 medido pela conta do destinatario, nao por auth.uid(). Alvo inexistente (visibility nula) responde false ([40]).';


-- ============================================================
-- 4. A regra provisoria do envio dirigido, por conta
-- ============================================================
--
-- A regra "quem da equipe ve se o paciente abriu" e PROVISORIA (ADR-032,
-- pergunta 2 a CEON) e mora num helper so. O aviso precisa dela para a conta de
-- quem enviou, nao para quem chama: o corpo passa para a versao por conta, e a
-- versao por quem chama vira uma chamada a ela. A resposta da CEON continua
-- trocando um corpo so — este.
CREATE FUNCTION private.directed_send_visible_to_account(
  p_account_id          uuid,
  p_visibility          public.clinical_visibility,
  p_origin_specialty_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(
           CASE
             WHEN EXISTS (SELECT 1 FROM public.professionals p
                            JOIN public.accounts a ON a.id = p.account_id
                           WHERE a.id = p_account_id AND a.is_active AND p.is_active) THEN
               p_visibility = 'team'
               OR p_origin_specialty_id = ANY (private.account_specialty_ids(p_account_id))
             WHEN EXISTS (SELECT 1 FROM public.admins ad
                            JOIN public.accounts a ON a.id = ad.account_id
                           WHERE a.id = p_account_id AND a.is_active AND ad.is_active) THEN
               p_visibility = 'team'
             ELSE false
           END,
           false);
$$;

COMMENT ON FUNCTION private.directed_send_visible_to_account(uuid, public.clinical_visibility, uuid) IS
  'PROVISORIO (G.2, pergunta 2 a CEON, 01/10/2026): quem da equipe ve o envio dirigido e se o paciente abriu. Hoje o recorte da ADR-003 (b): team para todos, restrito so para a propria especialidade, administrador so team. Resposta (a): so p_origin_specialty_id = ANY(account_specialty_ids(p_account_id)). ADR-032. directed_send_visible_to_staff chama esta.';

-- Mesma assinatura: preserva dono e ACL (o EXECUTE de clinical_reader, que as
-- politicas de content_directed_sends exigem).
CREATE OR REPLACE FUNCTION private.directed_send_visible_to_staff(
  p_visibility          public.clinical_visibility,
  p_origin_specialty_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.directed_send_visible_to_account(public.get_my_uid(), p_visibility, p_origin_specialty_id);
$$;

COMMENT ON FUNCTION private.directed_send_visible_to_staff(public.clinical_visibility, uuid) IS
  'A regra provisoria do envio dirigido (ADR-032) para quem chama. O corpo da regra mora em directed_send_visible_to_account ([40]).';


-- ============================================================
-- 5. Os helpers dos produtores
-- ============================================================

-- O par de private.notify_professional para a administracao: tipo inativo
-- devolve 0 em vez de erro, e so recebe administrador ativo com conta ativa.
CREATE FUNCTION private.notify_admins(
  p_type_code    text,
  p_dedup_key    text,
  p_target_table text,
  p_target_id    uuid,
  p_patient_id   uuid
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account uuid;
  v_count   integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.notification_types t
                  WHERE t.code = p_type_code AND t.is_active) THEN
    RETURN 0;
  END IF;

  FOR v_account IN
    SELECT ad.account_id
      FROM public.admins ad
      JOIN public.accounts a ON a.id = ad.account_id
     WHERE ad.is_active
       AND a.is_active
  LOOP
    IF private.notify(v_account, p_type_code, p_dedup_key,
                      p_target_table, p_target_id, p_patient_id) IS NOT NULL THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.notify_admins(text, text, text, uuid, uuid) IS
  'Notifica cada administrador ativo. Tipo inativo devolve 0: o produtor nunca trava o fluxo que o dispara ([40]).';

-- O aviso ao profissional do compromisso, so se ele o enxerga hoje. Sem
-- profissional (compromisso que o Gemed trouxer sem vinculo, ou marcado sem
-- nome), ninguem recebe.
CREATE FUNCTION private.notify_appointment_professional(
  p_appointment_id uuid,
  p_type_code      text,
  p_dedup_key      text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_appt    record;
  v_account uuid;
BEGIN
  SELECT a.patient_id, a.professional_id, a.visibility, a.origin_specialty_id
    INTO v_appt
    FROM public.appointments a
   WHERE a.id = p_appointment_id;

  IF v_appt.professional_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT p.account_id INTO v_account
    FROM public.professionals p
   WHERE p.id = v_appt.professional_id;

  IF NOT private.staff_account_sees(v_account, v_appt.visibility, v_appt.origin_specialty_id) THEN
    RETURN NULL;
  END IF;

  RETURN private.notify_professional(
    v_appt.professional_id, p_type_code, p_dedup_key,
    'appointments', p_appointment_id, v_appt.patient_id);
END;
$$;

COMMENT ON FUNCTION private.notify_appointment_professional(uuid, text, text) IS
  'Avisa o profissional do compromisso, se houver e se ele enxerga o compromisso hoje (staff_account_sees). Chamada pelas RPCs de confirmacao ([40]).';


-- ============================================================
-- 6. Pedido do titular e consentimento revogado — gatilhos
-- ============================================================
--
-- Gatilho e nao RPC: data_subject_requests so recebe linha por
-- request_data_subject_action, e consent_records so e revogado por
-- revoke_consent, mas o aviso nao deve depender da assinatura delas (a do
-- pedido ja mudou uma vez, por DROP + CREATE, na Fase K).

CREATE FUNCTION private.notify_data_subject_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.notify_admins(
    'data_subject_request', 'dsr:' || NEW.id::text,
    'data_subject_requests', NEW.id,
    (SELECT p.id FROM public.patients p WHERE p.account_id = NEW.account_id));
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_data_subject_request
AFTER INSERT ON public.data_subject_requests
FOR EACH ROW EXECUTE FUNCTION private.notify_data_subject_request();

CREATE FUNCTION private.notify_consent_revoked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.notify_admins(
    'consent_revoked', 'consent:' || NEW.id::text || ':revoked',
    'consent_records', NEW.id,
    (SELECT p.id FROM public.patients p WHERE p.account_id = NEW.account_id));
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_consent_revoked
AFTER UPDATE OF revoked_at ON public.consent_records
FOR EACH ROW
WHEN (OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL)
EXECUTE FUNCTION private.notify_consent_revoked();


-- ============================================================
-- 7. Orientacao enviada aberta — gatilho
-- ============================================================
--
-- opened_at so vai de nulo a data, uma vez (trg_enforce_immutability), e so
-- mark_directed_content_opened o escreve. A abertura repetida nao chega aqui.

CREATE FUNCTION private.notify_directed_content_opened()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_account uuid;
BEGIN
  SELECT p.account_id INTO v_account
    FROM public.professionals p
   WHERE p.id = NEW.sent_by_professional_id;

  -- A autora do envio de Psicologia que saiu da area deixou de ve-lo.
  IF NOT private.directed_send_visible_to_account(v_account, NEW.visibility, NEW.origin_specialty_id) THEN
    RETURN NULL;
  END IF;

  PERFORM private.notify_professional(
    NEW.sent_by_professional_id, 'content_directed_read', 'directed:' || NEW.id::text || ':opened',
    'content_directed_sends', NEW.id, NEW.patient_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_notify_directed_content_opened
AFTER UPDATE OF opened_at ON public.content_directed_sends
FOR EACH ROW
WHEN (OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL)
EXECUTE FUNCTION private.notify_directed_content_opened();


-- ============================================================
-- 8. Confirmacao de presenca — dentro das RPCs do app
-- ============================================================
--
-- Corpos de create_appointments (confirm) e guard_clinical_writes (unconfirm,
-- 6.11). Mesmas mensagens de erro e o mesmo ROW_COUNT; entra so a leitura do
-- estado anterior, com a linha travada, e o aviso quando o estado muda.

CREATE OR REPLACE FUNCTION public.confirm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated       bigint;
  v_was_confirmed boolean;
BEGIN
  IF NOT private.can_confirm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'apenas o titular ou quem o acompanha confirma comparecimento';
  END IF;

  SELECT a.confirmed_at IS NOT NULL INTO v_was_confirmed
    FROM public.appointments a
   WHERE a.id = p_appointment_id
     FOR UPDATE;

  UPDATE public.appointments a
     SET confirmed_at = now(), confirmed_by_account_id = auth.uid()
   WHERE a.id = p_appointment_id
     AND a.starts_at > now()
     AND EXISTS (SELECT 1 FROM public.appointment_statuses s
                  WHERE s.id = a.status_id AND s.code = 'scheduled');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'compromisso ja comecou ou nao esta agendado';
  END IF;

  -- [40] Reconfirmar nao avisa. A chave leva clock_timestamp(), e nao now():
  -- now() e o instante da TRANSACAO, e confirmar, desfazer e confirmar de novo
  -- numa transacao so (um lote, a propria suite) repetiria a chave.
  IF NOT v_was_confirmed THEN
    PERFORM private.notify_appointment_professional(
      p_appointment_id, 'appointment_confirmed',
      'appt:' || p_appointment_id::text || ':confirmed:'
        || (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.confirm_appointment(uuid) IS
  'O titular ou o acompanhante confirma presenca no compromisso futuro e agendado. A primeira confirmacao (nao a reconfirmacao) avisa o profissional do compromisso, se ele o enxerga (appointment_confirmed, [40]).';

CREATE OR REPLACE FUNCTION public.unconfirm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated       bigint;
  v_was_confirmed boolean;
BEGIN
  IF NOT private.can_confirm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'apenas o titular ou quem o acompanha desfaz a confirmacao';
  END IF;

  SELECT a.confirmed_at IS NOT NULL INTO v_was_confirmed
    FROM public.appointments a
   WHERE a.id = p_appointment_id
     FOR UPDATE;

  UPDATE public.appointments a
     SET confirmed_at = NULL, confirmed_by_account_id = NULL
   WHERE a.id = p_appointment_id
     AND a.starts_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'compromisso ja comecou';
  END IF;

  -- [40] Desfazer o que nao estava confirmado continua aceito, e nao avisa.
  IF v_was_confirmed THEN
    PERFORM private.notify_appointment_professional(
      p_appointment_id, 'appointment_unconfirmed',
      'appt:' || p_appointment_id::text || ':unconfirmed:'
        || (extract(epoch FROM pg_catalog.clock_timestamp()) * 1000000)::bigint::text);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.unconfirm_appointment(uuid) IS
  'O titular ou o acompanhante desfaz a confirmacao do compromisso futuro. Idempotente sobre compromisso nao confirmado; so o desfazer de uma confirmacao avisa o profissional (appointment_unconfirmed, [40]).';


-- ============================================================
-- 9. No envio — a peneira conhece os alvos novos
-- ============================================================
--
-- Mesma assinatura (preserva o EXECUTE de service_role). Corpo de
-- apply_directed_sends_to_visibility (G.2), com tres mudancas:
--   * pedido do titular e consentimento: so administrador ativo, conferido
--     ANTES do atalho do patient_id nulo (o pedido do acompanhante nasce sem
--     ficha);
--   * compromisso: a equipe precisa enxerga-lo hoje (staff_account_sees);
--   * envio dirigido: a equipe precisa enxerga-lo hoje, pela regra provisoria.

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

  -- [40]: assunto da administracao, e so dela.
  IF v_n.target_table IN ('data_subject_requests', 'consent_records') THEN
    RETURN EXISTS (SELECT 1 FROM public.admins ad
                    WHERE ad.account_id = v_n.recipient_account_id
                      AND ad.is_active);
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
    SELECT ap.visibility, s.code, ap.origin_specialty_id INTO v_visibility, v_status, v_specialty
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
    -- [40]: a psicologa que saiu da area nao e avisada da sessao.
    IF v_staff AND NOT v_titular
       AND NOT private.staff_account_sees(v_n.recipient_account_id, v_visibility, v_specialty) THEN
      RETURN false;
    END IF;

  ELSIF v_n.target_table = 'conversations' AND v_caregiver THEN
    IF NOT EXISTS (SELECT 1 FROM public.conversations c
                    WHERE c.id = v_n.target_id AND c.visibility = 'team') THEN
      RETURN false;
    END IF;

  -- G.2: o envio dirigido restrito (Psicologia, ou area que virou
  -- confidencial depois do envio) nunca chega ao acompanhante. O titular
  -- recebe sempre; o envio inexistente nao avisa ninguem.
  ELSIF v_n.target_table = 'content_directed_sends' THEN
    SELECT s.visibility, s.origin_specialty_id INTO v_visibility, v_specialty
      FROM public.content_directed_sends s
     WHERE s.id = v_n.target_id;

    IF v_visibility IS NULL THEN
      RETURN false;
    END IF;
    IF v_caregiver AND v_visibility <> 'team' THEN
      RETURN false;
    END IF;
    -- [40]: quem enviou so e avisada da abertura enquanto enxerga o envio.
    IF v_staff AND NOT v_titular
       AND NOT private.directed_send_visible_to_account(v_n.recipient_account_id, v_visibility, v_specialty) THEN
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
  'Reavalia NO ENVIO o vinculo do destinatario, a area do acompanhante (ADR-030 §8) e o alvo: acompanhante revogado ou sem a area, alvo que passou a restrito, lembrete de compromisso que deixou de estar agendado, conversa que a pessoa da equipe deixou de enxergar (H.3) e — desde a [40] — compromisso ou envio dirigido que o profissional deixou de enxergar e aviso de privacidade a quem deixou de ser administrador saem como skipped, nunca como sent (ADR-015 §4, ADR-024).';


-- ============================================================
-- 10. Privilegios — SEMPRE no fim
-- ============================================================
--
-- Os helpers recebem o destinatario ou a conta a medir: so o dono (postgres)
-- os executa, por dentro das funcoes DEFINER acima. CREATE OR REPLACE preserva
-- o ACL das demais; a repeticao protege contra o default privilege (ADR-016).

REVOKE EXECUTE ON FUNCTION private.account_specialty_ids(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.staff_account_sees(uuid, public.clinical_visibility, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.directed_send_visible_to_account(uuid, public.clinical_visibility, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.notify_admins(text, text, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.notify_appointment_professional(uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.notify_data_subject_request()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.notify_consent_revoked()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.notify_directed_content_opened()
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.confirm_appointment(uuid)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unconfirm_appointment(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_appointment(uuid)   TO authenticated;
GRANT  EXECUTE ON FUNCTION public.unconfirm_appointment(uuid) TO authenticated;

DO $$
DECLARE
  v_role text;
  v_fn   text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    FOREACH v_fn IN ARRAY ARRAY[
      'private.account_specialty_ids(uuid)',
      'private.staff_account_sees(uuid, public.clinical_visibility, uuid)',
      'private.directed_send_visible_to_account(uuid, public.clinical_visibility, uuid)',
      'private.notify_admins(text, text, text, uuid, uuid)',
      'private.notify_appointment_professional(uuid, text, text)',
      'private.notify_data_subject_request()',
      'private.notify_consent_revoked()',
      'private.notify_directed_content_opened()'
    ] LOOP
      IF pg_catalog.has_function_privilege(v_role, v_fn, 'EXECUTE') THEN
        RAISE EXCEPTION '% alcanca % — criaria aviso ou mediria conta alheia', v_role, v_fn;
      END IF;
    END LOOP;
  END LOOP;

  -- A rotina de push nao pode parar, e o app continua confirmando.
  IF NOT pg_catalog.has_function_privilege('service_role', 'private.recipient_still_eligible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu a peneira de envio — o push pararia';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.confirm_appointment(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.unconfirm_appointment(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu a confirmacao de presenca';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.confirm_appointment(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.unconfirm_appointment(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca a confirmacao de presenca';
  END IF;
  -- As politicas de content_directed_sends rodam como clinical_reader.
  IF NOT pg_catalog.has_function_privilege('clinical_reader',
       'private.directed_send_visible_to_staff(public.clinical_visibility, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader perdeu directed_send_visible_to_staff — a leitura dos envios devolveria vazio';
  END IF;

  IF (SELECT count(*) FROM public.notification_types
       WHERE code IN ('data_subject_request', 'consent_revoked', 'appointment_confirmed',
                      'appointment_unconfirmed', 'content_directed_read')
         AND audience = 'team'
         AND caregiver_scope IS NULL
         AND is_active) <> 5 THEN
    RAISE EXCEPTION 'os cinco tipos da [40] nao nasceram como tipos ativos da equipe';
  END IF;

  IF EXISTS (SELECT 1 FROM public.notification_types
              WHERE code IN ('data_subject_request', 'consent_revoked')
                AND is_silenceable) THEN
    RAISE EXCEPTION 'aviso de privacidade nasceu silenciavel';
  END IF;
END;
$$;
