-- Agregado Notificacoes — fatia 2a de Conteudo e engajamento.
-- Design e racional: supera-docs/Modelo de Dados/Conteudo e engajamento.md
-- Decisoes sob teste:  ADR-015 (granularidade e destinatario), que ataca e
-- completa o desenho de tres tabelas da ADR-010 §2 e quita a divida da
-- ADR-011 §2 — a equipe recupera tempo real sem afrouxar o pedagio da ADR-008.
--
-- O rascunho do pre-mortem tinha SETE objetos. Esta migration traz CINCO
-- tabelas, uma publication e tres ausencias testadas. Cortados, e o motivo:
--   * scheduled_notifications — materializava o lembrete de 24h/2h que
--     appointments.starts_at ja sabe calcular. O compromisso remarcado as 09:00
--     dispararia o push do dia seguinte assim mesmo, mandando a paciente a uma
--     consulta que nao existe. Mesma familia do diary_summaries (ADR-007 §2).
--   * notifications.preview / title / body — NAO ha coluna de texto nenhuma.
--     O titulo e generico por tipo e mora em notification_types.label; a previa
--     da tela e derivada NO RENDER pelo app do paciente, que ja le messages
--     direto. Coluna seria segunda copia de dado clinico, sem trilha, viajando
--     ate o provedor de push fora da regiao brasileira (ADR-015 §2).
--   * nps_surveys / nps_responses — fatia 2b, bloqueada pela #32.
--
-- E o que ENTROU sem estar no desenho da ADR-010: device_tokens (sem ela nao
-- sai push nenhum — ADR-015 §4) e a coluna accounts.time_zone, porque a janela
-- de silencio sem fuso erra em 3 horas de forma silenciosa e permanente.


-- ============================================================
-- 1. Vocabulario dos canais e estados (ADR-002)
-- ============================================================
--
-- Canal e estado sao vocabulario FECHADO e nomeado na fonte: enum. Tipo de
-- notificacao e vocabulario que se mexe (a #32 ainda pode acrescentar o NPS, a
-- #7 pode partir o alerta): tabela de dominio.

CREATE TYPE public.notification_channel AS ENUM ('push', 'sms', 'email');

COMMENT ON TYPE public.notification_channel IS
  'Os tres canais nomeados no requisito. O in-app nao e canal: e a propria linha de notifications.';

CREATE TYPE public.notification_delivery_status AS ENUM
  ('pending', 'sending', 'sent', 'failed', 'skipped', 'given_up');

COMMENT ON TYPE public.notification_delivery_status IS
  'Ciclo da entrega. skipped e o desfecho de quem deixou de ser elegivel entre a criacao e o envio (ADR-015 §4).';

CREATE TYPE public.device_platform AS ENUM ('ios', 'android', 'web');


-- ============================================================
-- 2. notification_types — onde mora a regra que a chave impoe
-- ============================================================

CREATE TABLE public.notification_types (
  id             uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code           text NOT NULL UNIQUE,
  -- O TITULO GENERICO da notificacao. E o unico texto que a tela recebe do
  -- banco: a linha de notifications nao tem nenhum (ADR-015 §2).
  label          text NOT NULL CHECK (length(btrim(label)) > 0),
  -- Os quatro filtros da tela, nominalmente nas fontes. CHECK e nao tabela:
  -- dominio local e pequeno; um quinto filtro e ALTER de CHECK numa tabela
  -- sem dado de paciente.
  category       text NOT NULL CHECK (category IN ('agenda', 'chat', 'content', 'alert')),
  icon_name      text,
  -- A DECISAO DE SEGURANCA CLINICA DO AGREGADO (ADR-015 §1). Falso aqui e o
  -- que a FK composta de notification_preferences torna insilenciavel — para
  -- o paciente, para o cuidador, para o profissional e para service_role, que
  -- ignora RLS mas nao ignora chave estrangeira.
  is_silenceable boolean NOT NULL DEFAULT true,
  sort_order     smallint NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Redundante para o Postgres, indispensavel para a FK composta abaixo: e o
  -- alvo que carrega is_silenceable junto do id.
  UNIQUE (id, is_silenceable)
);

COMMENT ON TABLE public.notification_types IS
  'Tipos de notificacao e o titulo generico de cada um. is_silenceable=false e imposto por FK composta, nao por funcao (ADR-015 §1).';
COMMENT ON COLUMN public.notification_types.label IS
  'Titulo generico exibido na tela. A previa e derivada no cliente; nunca sai daqui nem de notifications.';

-- Vive na migration, como specialties e appointment_types: seed nao roda em
-- db push, e is_silenceable e regra de seguranca, nao dado de exemplo.
INSERT INTO public.notification_types (code, label, category, is_silenceable, sort_order) VALUES
  ('appointment_reminder_24h', 'Lembrete de compromisso',        'agenda',  true,  1),
  ('appointment_reminder_2h',  'Seu compromisso e em breve',     'agenda',  true,  2),
  ('appointment_scheduled',    'Novo compromisso agendado',      'agenda',  true,  3),
  ('appointment_changed',      'Compromisso alterado',           'agenda',  true,  4),
  ('chat_message',             'Nova mensagem da equipe',        'chat',    true,  5),
  ('chat_assigned',            'Conversa atribuida a voce',      'chat',    true,  6),
  ('content_published',        'Nova orientacao disponivel',     'content', true,  7),
  -- NASCE SEM PRODUTOR, de proposito: alerts esta na fatia 2 de Diario e
  -- alertas, travada por #7, #25 e #28. A linha existe hoje para que o
  -- invariante da ADR-015 §1 seja TESTAVEL antes de haver alerta.
  ('critical_alert',           'Alerta de sintoma critico',      'alert',   false, 8)
ON CONFLICT (code) DO NOTHING;

-- NAO ha tipo de NPS: a fatia 2b esta bloqueada pela #32, e semear o
-- vocabulario dela seria decidir por antecipacao o que a CEON nao respondeu.


-- ============================================================
-- 3. accounts.time_zone — a janela de silencio precisa de fuso
-- ============================================================
--
-- Sem isto a rotina interpreta quiet hours em UTC e o lembrete das 08:00 sai
-- as 05:00. Chapeco nao tem horario de verao, o que torna o erro silencioso e
-- PERMANENTE — nao ha dia do ano em que ele se denuncie sozinho.

ALTER TABLE public.accounts
  ADD COLUMN time_zone text NOT NULL DEFAULT 'America/Sao_Paulo';

COMMENT ON COLUMN public.accounts.time_zone IS
  'Fuso do titular da conta, usado para interpretar a janela de silencio das preferencias (ADR-015 §1).';


-- ============================================================
-- 4. notifications — referencia, nunca conteudo
-- ============================================================

CREATE TABLE public.notifications (
  id                   uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- QUEM RECEBE, nao de quem e o dado. Uma unica politica de leitura nasce
  -- desta coluna, e ela vale para os quatro perfis (ADR-015 §5).
  recipient_account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  type_id              uuid NOT NULL REFERENCES public.notification_types (id) ON DELETE RESTRICT,
  -- Alvo POLIMORFICO e sem FK, de proposito: uma FK por tipo de alvo seria
  -- coluna nova a cada agregado. O preco (sem integridade referencial) e
  -- pequeno porque DELETE e proibido no projeto inteiro (ADR-005).
  target_table         text,
  target_id            uuid,
  -- NAO e o dono da notificacao: e o alcance da eliminacao. Sem esta coluna a
  -- rotina da ADR-005 nao encontra a caixa de entrada de TERCEIROS, e a
  -- eliminacao viraria expurgo por idade, isto e, eventual (ADR-015 §5).
  patient_id           uuid REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- Idempotencia NA ORIGEM, nao na entrega: dedup em notification_deliveries
  -- impediria o push repetido e deixaria a TELA repetir. Irma do
  -- UNIQUE (symptom_report_id) da ADR-007 §6.
  dedup_key            text NOT NULL CHECK (length(btrim(dedup_key)) > 0),
  -- Dois eixos INDEPENDENTES: arquivar nao e ler, ler nao e arquivar.
  read_at              timestamptz,
  archived_at          timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_notifications_target_pair
    CHECK ((target_table IS NULL) = (target_id IS NULL)),
  CONSTRAINT uq_notifications_dedup
    UNIQUE (recipient_account_id, type_id, dedup_key)
);

COMMENT ON TABLE public.notifications IS
  'Caixa de entrada do destinatario. SEM COLUNA DE TEXTO: titulo e generico por tipo e a previa da tela e derivada no cliente (ADR-015 §2).';
COMMENT ON COLUMN public.notifications.patient_id IS
  'Alcance da eliminacao da ADR-005, nao o dono da linha. Quem le a linha e o destinatario, e so ele.';
COMMENT ON COLUMN public.notifications.dedup_key IS
  'Chave de negocio do evento (ex.: appointment:<id>:24h). Reprocessar a rotina agendada nao duplica a linha na tela.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.notifications
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. notification_preferences — a FK que recusa silenciar o alerta
-- ============================================================

CREATE TABLE public.notification_preferences (
  account_id        uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  type_id           uuid NOT NULL,
  -- Coluna redundante COM PROPOSITO: e o segundo termo da FK composta. O
  -- CHECK a prende em `true`, e a FK entao so aceita type_id cujo
  -- is_silenceable seja true. Tipo obrigatorio nao tem linha possivel aqui.
  is_silenceable    boolean NOT NULL DEFAULT true,
  channel           public.notification_channel NOT NULL,
  is_enabled        boolean NOT NULL DEFAULT true,
  -- As tres dimensoes que a fonte junta: "horarios, canais e tipos".
  quiet_hours_start time,
  quiet_hours_end   time,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, type_id, channel),
  CONSTRAINT ck_notification_preferences_silenceable CHECK (is_silenceable),
  CONSTRAINT ck_notification_preferences_quiet_pair
    CHECK ((quiet_hours_start IS NULL) = (quiet_hours_end IS NULL)),
  CONSTRAINT fk_notification_preferences_type
    FOREIGN KEY (type_id, is_silenceable)
    REFERENCES public.notification_types (id, is_silenceable) ON DELETE RESTRICT
);

COMMENT ON TABLE public.notification_preferences IS
  'Matriz tipo x canal + janela de silencio, POR DESTINATARIO (ADR-015 §1). Vazio = fail-open. Tipo nao silenciavel e recusado pela FK composta.';
COMMENT ON COLUMN public.notification_preferences.is_silenceable IS
  'Nao e configuracao: e o segundo termo da FK composta. CHECK(is_silenceable) + FK(type_id, is_silenceable) tornam o alerta insilenciavel por CHAVE.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.notification_preferences
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 6. notification_deliveries — a fila do provedor
-- ============================================================

CREATE TABLE public.notification_deliveries (
  id                  uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  notification_id     uuid NOT NULL REFERENCES public.notifications (id) ON DELETE CASCADE,
  channel             public.notification_channel NOT NULL,
  status              public.notification_delivery_status NOT NULL DEFAULT 'pending',
  -- Identificador do provedor, para reconciliar entrega. NAO ha coluna de
  -- payload: o conteudo do push e montado no envio, como no outbox do Gemed
  -- (ADR-007 §3).
  provider_message_id text,
  last_error          text,
  attempts            smallint NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz NOT NULL DEFAULT now(),
  give_up_at          timestamptz,
  sent_at             timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notification_deliveries_channel UNIQUE (notification_id, channel)
);

COMMENT ON TABLE public.notification_deliveries IS
  'Fila de envio por canal. Sem payload: o conteudo e montado no envio. Nenhum perfil de usuario le esta tabela — so service_role.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.notification_deliveries
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 7. device_tokens — credencial ao portador
-- ============================================================
--
-- ADR-015 §4. Nao estava no desenho de tres tabelas da ADR-010, e sem ela nao
-- sai push nenhum. Quem tem o token envia para o aparelho: leitura estrita do
-- dono, nada para profissional, nada para administrador, nada para anon.

CREATE TABLE public.device_tokens (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id   uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  token        text NOT NULL UNIQUE CHECK (length(btrim(token)) > 0),
  platform     public.device_platform NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.device_tokens IS
  'Registro de aparelho para push. O token e CREDENCIAL AO PORTADOR: so o dono le, e a desativacao da conta o invalida (ADR-015 §4).';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.device_tokens
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

-- Conta desativada nao recebe push. Sem isto, o aparelho de quem saiu da
-- clinica continuaria recebendo notificacao clinica.
CREATE FUNCTION private.deactivate_tokens_on_account_off()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.device_tokens
     SET is_active = false
   WHERE account_id = NEW.id
     AND is_active;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_deactivate_tokens
AFTER UPDATE OF is_active ON public.accounts
FOR EACH ROW
WHEN (OLD.is_active AND NOT NEW.is_active)
EXECUTE FUNCTION private.deactivate_tokens_on_account_off();


-- ============================================================
-- 8. Resolucao da preferencia — fail-open, com a janela em fuso
-- ============================================================

-- Devolve QUANDO o envio pode sair, dada a janela de silencio. A janela
-- ATRASA, nunca cancela: quem esta em silencio recebe depois, e nao perde.
CREATE FUNCTION private.next_send_time(
  p_now   timestamptz,
  p_start time,
  p_end   time,
  p_tz    text
)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz        text := COALESCE(p_tz, 'America/Sao_Paulo');
  v_local     timestamp;
  v_time      time;
  v_in_window boolean;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_start = p_end THEN
    RETURN p_now;
  END IF;

  v_local := p_now AT TIME ZONE v_tz;
  v_time  := v_local::time;

  -- Janela que atravessa a meia-noite (22:00 -> 07:00) e o caso normal aqui.
  v_in_window := CASE
    WHEN p_start < p_end THEN v_time >= p_start AND v_time < p_end
    ELSE v_time >= p_start OR v_time < p_end
  END;

  IF NOT v_in_window THEN
    RETURN p_now;
  END IF;

  -- Fim da janela: hoje, se ele ainda nao passou no relogio local; amanha,
  -- se ja estamos do outro lado da meia-noite.
  IF v_time < p_end THEN
    RETURN (pg_catalog.date_trunc('day', v_local) + p_end) AT TIME ZONE v_tz;
  END IF;

  RETURN (pg_catalog.date_trunc('day', v_local)
          + pg_catalog.make_interval(days => 1) + p_end) AT TIME ZONE v_tz;
END;
$$;

-- O plano de entrega de uma notificacao: um par (canal, quando) por canal
-- habilitado. AUSENCIA DE LINHA E FAIL-OPEN — semantica OPOSTA a de
-- alert_rules (ADR-007 §1), e declarada: quem nunca abriu a tela de
-- preferencias recebe por todos os canais.
CREATE FUNCTION private.delivery_plan(p_account_id uuid, p_type_id uuid)
RETURNS TABLE (channel public.notification_channel, next_attempt_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.ch,
         private.next_send_time(pg_catalog.now(), p.quiet_hours_start, p.quiet_hours_end, a.time_zone)
    FROM pg_catalog.unnest(pg_catalog.enum_range(NULL::public.notification_channel)) AS c(ch)
    CROSS JOIN public.accounts a
    LEFT JOIN public.notification_preferences p
           ON p.account_id = a.id
          AND p.type_id    = p_type_id
          AND p.channel    = c.ch
   WHERE a.id = p_account_id
     AND COALESCE(p.is_enabled, true);
$$;

COMMENT ON FUNCTION private.delivery_plan(uuid, uuid) IS
  'Canais habilitados e quando enviar. Vazio de preferencia = FAIL-OPEN (oposto de alert_rules). A janela atrasa, nao cancela.';


-- ============================================================
-- 9. private.notify — o unico produtor de notificacao
-- ============================================================
--
-- Chamada por trigger de dominio e pela Edge Function com service_role. A
-- idempotencia e da chave, nao do chamador: repetir a mesma (destinatario,
-- tipo, dedup_key) devolve a linha existente e NAO cria entrega nova.

CREATE FUNCTION private.notify(
  p_recipient_account_id uuid,
  p_type_code            text,
  p_dedup_key            text,
  p_target_table         text DEFAULT NULL,
  p_target_id            uuid DEFAULT NULL,
  p_patient_id           uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type_id uuid;
  v_id      uuid;
  v_active  boolean;
BEGIN
  SELECT t.id INTO v_type_id
    FROM public.notification_types t
   WHERE t.code = p_type_code AND t.is_active;
  IF v_type_id IS NULL THEN
    RAISE EXCEPTION 'tipo de notificacao inexistente: %', p_type_code;
  END IF;

  -- Conta desativada nao recebe. A desativacao e a revogacao (#26).
  SELECT a.is_active INTO v_active
    FROM public.accounts a WHERE a.id = p_recipient_account_id;
  IF v_active IS NOT TRUE THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications
    (recipient_account_id, type_id, target_table, target_id, patient_id, dedup_key)
  VALUES
    (p_recipient_account_id, v_type_id, p_target_table, p_target_id, p_patient_id, p_dedup_key)
  ON CONFLICT ON CONSTRAINT uq_notifications_dedup DO NOTHING
  RETURNING id INTO v_id;

  -- Ja existia: a rotina agendada reprocessou a mesma janela. Devolve a linha
  -- e sai sem enfileirar entrega nova.
  IF v_id IS NULL THEN
    SELECT n.id INTO v_id
      FROM public.notifications n
     WHERE n.recipient_account_id = p_recipient_account_id
       AND n.type_id              = v_type_id
       AND n.dedup_key            = p_dedup_key;
    RETURN v_id;
  END IF;

  INSERT INTO public.notification_deliveries (notification_id, channel, next_attempt_at)
  SELECT v_id, d.channel, d.next_attempt_at
    FROM private.delivery_plan(p_recipient_account_id, v_type_id) d;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION private.notify(uuid, text, text, text, uuid, uuid) IS
  'Unico produtor de notificacao. Idempotente pela chave de dedup. Nao recebe texto: a linha nao tem onde guarda-lo (ADR-015 §2).';


-- ============================================================
-- 10. Elegibilidade no ENVIO — onde a revogacao do cuidador chega
-- ============================================================
--
-- ADR-015 §4. Primeira vez no projeto em que a allow-list derivada precisa
-- valer FORA da RLS: a rotina de envio roda com service_role, que a ignora.
-- Sem esta funcao, a revogacao instantanea que a ADR-003 comprou ao recusar
-- claim no JWT valeria no banco e NAO valeria no aparelho.

CREATE FUNCTION private.recipient_still_eligible(p_notification_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT a.is_active
     AND ( n.patient_id IS NULL
           -- o proprio titular
           OR EXISTS (SELECT 1 FROM public.patients p
                       WHERE p.id = n.patient_id AND p.account_id = n.recipient_account_id)
           -- a equipe: o vinculo dela nao e por paciente (resposta #10)
           OR EXISTS (SELECT 1 FROM public.professionals pr
                       WHERE pr.account_id = n.recipient_account_id)
           OR EXISTS (SELECT 1 FROM public.admins ad
                       WHERE ad.account_id = n.recipient_account_id)
           -- o cuidador: REAVALIADO agora, nao no momento em que a linha nasceu
           OR EXISTS (SELECT 1
                        FROM public.patient_caregivers pc
                        JOIN public.caregivers c ON c.id = pc.caregiver_id
                       WHERE c.account_id = n.recipient_account_id
                         AND pc.patient_id = n.patient_id
                         AND pc.status = 'active') )
    FROM public.notifications n
    JOIN public.accounts a ON a.id = n.recipient_account_id
   WHERE n.id = p_notification_id;
$$;

COMMENT ON FUNCTION private.recipient_still_eligible(uuid) IS
  'Reavalia o vinculo NO ENVIO. Cuidador revogado entre a criacao e o disparo sai como skipped, nunca como sent (ADR-015 §4).';


-- ============================================================
-- 11. O contrato da rotina de envio — service_role, e so ele
-- ============================================================
--
-- SECURITY INVOKER de proposito: quem pode chamar e decidido por privilegio
-- (GRANT apenas a service_role), nao por um IF no corpo da funcao.

CREATE FUNCTION public.claim_notification_deliveries(p_limit smallint DEFAULT 100)
RETURNS SETOF public.notification_deliveries
LANGUAGE plpgsql
VOLATILE
SET search_path = ''
AS $$
BEGIN
  -- Primeiro a peneira: quem deixou de ser elegivel NAO e enviado.
  UPDATE public.notification_deliveries d
     SET status = 'skipped', last_error = 'destinatario deixou de ser elegivel'
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

CREATE FUNCTION public.mark_delivery_result(
  p_delivery_id         uuid,
  p_status              public.notification_delivery_status,
  p_provider_message_id text DEFAULT NULL,
  p_error               text DEFAULT NULL,
  p_next_attempt_at     timestamptz DEFAULT NULL
)
RETURNS void
LANGUAGE sql
VOLATILE
SET search_path = ''
AS $$
  UPDATE public.notification_deliveries
     SET status              = p_status,
         provider_message_id = COALESCE(p_provider_message_id, provider_message_id),
         last_error          = p_error,
         sent_at             = CASE WHEN p_status = 'sent' THEN pg_catalog.now() ELSE sent_at END,
         next_attempt_at     = COALESCE(p_next_attempt_at, next_attempt_at)
   WHERE id = p_delivery_id;
$$;


-- ============================================================
-- 12. Aparelho — registrar e desregistrar
-- ============================================================

CREATE FUNCTION public.register_device_token(
  p_token    text,
  p_platform public.device_platform
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sem sessao';
  END IF;

  -- ON CONFLICT REATRIBUI o token a quem o registra agora. E o caso do
  -- aparelho que troca de dono ou do app reinstalado: quem apresenta o token
  -- tem o aparelho, e a alternativa (recusar) deixaria o dono anterior
  -- recebendo notificacao clinica no telefone de outra pessoa.
  INSERT INTO public.device_tokens (account_id, token, platform)
  VALUES (auth.uid(), p_token, p_platform)
  ON CONFLICT (token) DO UPDATE
     SET account_id   = auth.uid(),
         platform     = EXCLUDED.platform,
         is_active    = true,
         last_seen_at = pg_catalog.now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.unregister_device_token(p_token text)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.device_tokens
     SET is_active = false
   WHERE token = p_token
     AND account_id = auth.uid();
$$;


-- ============================================================
-- 13. RLS — destinatario unico, e a ausencia e a decisao
-- ============================================================

ALTER TABLE public.notification_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_deliveries  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_tokens            ENABLE ROW LEVEL SECURITY;

-- Vocabulario: nao e dado de paciente. A tela precisa do rotulo e do icone.
CREATE POLICY notification_types_select_authenticated ON public.notification_types
  FOR SELECT TO authenticated USING ( is_active );

-- A UNICA politica de leitura da caixa, e ela vale para os quatro perfis:
-- quem le e o destinatario. O administrador NAO le a caixa alheia — os
-- "alertas operacionais" do dashboard executivo sao consulta derivada sobre
-- conversations e accounts, nao esta tabela (ADR-015 §5).
CREATE POLICY notifications_select_recipient ON public.notifications
  FOR SELECT TO authenticated
  USING ( recipient_account_id = (SELECT public.get_my_uid()) );

-- Ler e arquivar sao do destinatario, e por politica direta: nao ha regra de
-- negocio a impor alem de "e minha". O que impede mexer em recipient_account_id
-- ou em target_id nao e a politica — e o GRANT UPDATE por COLUNA, no fim.
CREATE POLICY notifications_update_recipient ON public.notifications
  FOR UPDATE TO authenticated
  USING ( recipient_account_id = (SELECT public.get_my_uid()) )
  WITH CHECK ( recipient_account_id = (SELECT public.get_my_uid()) );

-- NENHUMA politica de INSERT: a notificacao nasce so por private.notify.

-- Preferencia: do destinatario, ciclo completo e direto. O que a RLS nao
-- alcanca (silenciar o alerta) esta na FK composta, nao aqui.
CREATE POLICY notification_preferences_select_own ON public.notification_preferences
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY notification_preferences_insert_own ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY notification_preferences_update_own ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) )
  WITH CHECK ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY notification_preferences_delete_own ON public.notification_preferences
  FOR DELETE TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

-- Aparelho: so o dono LE. A escrita e por RPC, porque o registro reatribui o
-- token e isso e regra, nao filtro.
CREATE POLICY device_tokens_select_own ON public.device_tokens
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

-- notification_deliveries fica com RLS LIGADA E ZERO POLITICAS. Nenhum perfil
-- de usuario le a fila do provedor: ela nao tem tela, e o id da mensagem no
-- provedor e rastro operacional. So service_role (BYPASSRLS) a alcanca.
-- A ausencia e a decisao, e esta sob teste para os quatro perfis.


-- ============================================================
-- 14. Realtime — a divida da ADR-011 §2, quitada
-- ============================================================
--
-- Aqui o canal NAO fura o pedagio, e e por isso que ele existe: a linha nao
-- tem conteudo clinico, e abrir o que ela referencia continua passando por
-- read_conversations / read_appointments / read_specialty_notes. A equipe
-- recupera tempo real; a trilha continua medindo leitura real.
--
-- REPLICA IDENTITY no padrao, pelo mesmo motivo da ADR-011 §3.

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;


-- ============================================================
-- 15. Indices
-- ============================================================

-- A tela: lista cronologica do destinatario, com as arquivadas fora.
CREATE INDEX idx_notifications_inbox
  ON public.notifications (recipient_account_id, created_at DESC)
  WHERE archived_at IS NULL;

-- O indicador de nao lidas.
CREATE INDEX idx_notifications_unread
  ON public.notifications (recipient_account_id)
  WHERE read_at IS NULL AND archived_at IS NULL;

-- Os filtros por tipo da tela.
CREATE INDEX idx_notifications_type
  ON public.notifications (recipient_account_id, type_id, created_at DESC);

-- A rotina de eliminacao da ADR-005 — a razao de patient_id existir.
CREATE INDEX idx_notifications_patient
  ON public.notifications (patient_id)
  WHERE patient_id IS NOT NULL;

-- A fila do enviador.
CREATE INDEX idx_notification_deliveries_queue
  ON public.notification_deliveries (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX idx_device_tokens_owner
  ON public.device_tokens (account_id)
  WHERE is_active;


-- ============================================================
-- 16. Privilegios — SEMPRE no fim
-- ============================================================

-- A notificacao nasce so por private.notify, e nem service_role a insere
-- direto: o produtor unico e o que garante dedup e plano de entrega.
REVOKE INSERT, UPDATE, DELETE ON public.notifications            FROM authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.notification_types       FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_deliveries  FROM authenticated;
REVOKE SELECT                  ON public.notification_deliveries FROM authenticated;
REVOKE INSERT, UPDATE, DELETE  ON public.device_tokens           FROM authenticated;
REVOKE DELETE ON public.notification_preferences FROM service_role;

-- O destinatario marca como lida e arquiva — e SO isso. A RLS nao distingue
-- coluna; o privilegio sim. Mesmo instrumento que barrou a auto-reativacao de
-- accounts.is_active na primeira migration.
GRANT UPDATE (read_at, archived_at) ON public.notifications TO authenticated;

REVOKE EXECUTE ON FUNCTION private.next_send_time(timestamptz, time, time, text)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.delivery_plan(uuid, uuid)                       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.notify(uuid, text, text, text, uuid, uuid)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.recipient_still_eligible(uuid)                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.deactivate_tokens_on_account_off()              FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.claim_notification_deliveries(smallint) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_delivery_result(uuid, public.notification_delivery_status, text, text, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.register_device_token(text, public.device_platform) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unregister_device_token(text)                       FROM PUBLIC;

-- A rotina de envio e da Edge Function: privilegio, nao IF no corpo.
GRANT EXECUTE ON FUNCTION public.claim_notification_deliveries(smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_delivery_result(uuid, public.notification_delivery_status, text, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION private.notify(uuid, text, text, text, uuid, uuid)          TO service_role;
GRANT USAGE   ON SCHEMA private TO service_role;

-- O app registra o aparelho.
GRANT EXECUTE ON FUNCTION public.register_device_token(text, public.device_platform) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unregister_device_token(text)                       TO authenticated;

-- Entra em POLITICA: EXECUTE e exigido em runtime de quem consulta e de quem
-- escreve. A armadilha que ja mordeu duas vezes no projeto.
GRANT EXECUTE ON FUNCTION public.get_my_uid() TO authenticated;

-- anon nao le nada deste agregado.
REVOKE SELECT ON public.notifications            FROM anon;
REVOKE SELECT ON public.notification_preferences FROM anon;
REVOKE SELECT ON public.notification_deliveries  FROM anon;
REVOKE SELECT ON public.notification_types       FROM anon;
REVOKE SELECT ON public.device_tokens            FROM anon;
