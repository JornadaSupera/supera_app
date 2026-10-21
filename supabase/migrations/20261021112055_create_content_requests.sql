-- O paciente pede uma orientacao que a biblioteca ainda nao tem, e o
-- administrador responde publicando uma, ou recusando com motivo.
-- Design e racional: supera-docs/ADRs/ADR-033 — Assistente de orientações com IA.md
--
-- A PORTA DE ENTRADA e o assistente de orientacoes: quando a IA nao acha
-- orientacao que responda a pergunta, o app oferece o pedido, ja com um
-- rascunho de contexto que o paciente edita. Mas o pedido nao depende da IA:
-- nao confere ai_assistant_enabled, e o app pode oferece-lo de qualquer tela.
--
-- QUEM PEDE: o publico da biblioteca — o titular, ou o acompanhante com a
-- area `resources` (decisao de 21/10/2026). O acompanhante pede pelo
-- tutelado (um por acompanhante, ADR-026), e a linha guarda a conta dele.
--
-- O ADMINISTRADOR NAO SABE QUEM PEDIU (decisao de 21/10/2026). Ele le o
-- contexto, a pergunta original e se quem pediu foi titular ou acompanhante,
-- por read_content_requests, que nao devolve patient_id nem requested_by. Nao
-- ha politica de SELECT para a equipe. Escrever o conteudo nao exige saber
-- quem pediu, e o pedido e texto de saude escrito pelo paciente: e a
-- minimizacao da LGPD. A ficha fica guardada para uma coisa so — avisar quem
-- pediu quando houver resposta.
--
-- Consequencia: sem identidade, a leitura do administrador nao passa pelo
-- pedagio da ADR-008 (log_clinical_read e por paciente). A ESCRITA vai para a
-- trilha por audit_write('patient_id'), como todo dado de paciente.
--
-- A RESPOSTA PRECISA ABRIR para quem pediu. Atender com orientacao marcada
-- por CID que o paciente nao tem, ou que o acompanhante sem
-- `clinical_record` nao ve, avisaria "respondido" com um link que nao abre. A
-- RPC recusa com content_not_available_to_requester. O administrador aprende
-- um bit ("este pedido anonimo nao alcanca esta orientacao") sobre alguem
-- que ele nao sabe quem e.
--
-- MAQUINA DE ESTADOS: open -> fulfilled | declined | cancelled. Os tres
-- destinos sao finais. Um gatilho guarda a transicao; um CHECK guarda a
-- coerencia das colunas de cada estado.


-- ============================================================
-- 1. O estado
-- ============================================================

CREATE TYPE public.content_request_status AS ENUM ('open', 'fulfilled', 'declined', 'cancelled');

COMMENT ON TYPE public.content_request_status IS
  'open: na fila do administrador. fulfilled: atendido com uma orientacao publicada. declined: recusado com motivo. cancelled: quem pediu desistiu. Os tres ultimos sao finais (ADR-033).';


-- ============================================================
-- 2. A tabela
-- ============================================================

CREATE TABLE public.content_requests (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id   uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- A conta que pediu: o titular ou o acompanhante. Nunca devolvida ao
  -- administrador.
  requested_by uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  -- O que o paciente precisa, nas palavras dele (ou no rascunho da IA que ele
  -- confirmou). E o que o administrador le para escrever.
  context      text NOT NULL CHECK (length(btrim(context)) BETWEEN 10 AND 1000),
  -- A pergunta feita ao assistente, quando o pedido nasceu dele. O teto e o
  -- maximo que ai_assistant_question_max_chars admite.
  original_question text CHECK (original_question IS NULL
                                OR length(btrim(original_question)) BETWEEN 1 AND 2000),
  status       public.content_request_status NOT NULL DEFAULT 'open',
  fulfilled_content_item_id uuid REFERENCES public.content_items (id) ON DELETE RESTRICT,
  -- Mostrado a quem pediu: escrito para o paciente ler.
  decline_reason text CHECK (decline_reason IS NULL
                             OR length(btrim(decline_reason)) BETWEEN 1 AND 500),
  -- Quem resolveu: o perfil (regra) e a conta (trilha), como em
  -- content_items. No cancelamento, o perfil fica vazio e a conta e a de
  -- quem pediu.
  resolved_by_admin_id uuid REFERENCES public.admins (id)   ON DELETE RESTRICT,
  resolved_by          uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_content_requests_state CHECK (
    CASE status
      WHEN 'open' THEN
            resolved_at IS NULL AND resolved_by IS NULL AND resolved_by_admin_id IS NULL
        AND fulfilled_content_item_id IS NULL AND decline_reason IS NULL
      WHEN 'fulfilled' THEN
            resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolved_by_admin_id IS NOT NULL
        AND fulfilled_content_item_id IS NOT NULL AND decline_reason IS NULL
      WHEN 'declined' THEN
            resolved_at IS NOT NULL AND resolved_by IS NOT NULL AND resolved_by_admin_id IS NOT NULL
        AND fulfilled_content_item_id IS NULL AND decline_reason IS NOT NULL
      WHEN 'cancelled' THEN
            resolved_at IS NOT NULL AND resolved_by = requested_by AND resolved_by_admin_id IS NULL
        AND fulfilled_content_item_id IS NULL AND decline_reason IS NULL
    END
  ),
  CONSTRAINT ck_content_requests_order CHECK (resolved_at IS NULL OR resolved_at >= created_at)
);

COMMENT ON TABLE public.content_requests IS
  'Pedido de orientacao feito pelo titular ou pelo acompanhante com resources (ADR-033). O administrador le e resolve por RPC, SEM a identidade de quem pediu. Escrita so por RPC.';
COMMENT ON COLUMN public.content_requests.context IS
  'O que a pessoa precisa, nas palavras dela (10 a 1000 caracteres). Texto de saude escrito pelo paciente: chega ao administrador sem nome nem ficha.';
COMMENT ON COLUMN public.content_requests.original_question IS
  'A pergunta feita ao assistente de orientacoes, quando o pedido nasceu dele. Unico lugar em que uma pergunta ao assistente fica gravada — e so porque a pessoa pediu.';
COMMENT ON COLUMN public.content_requests.decline_reason IS
  'Motivo da recusa, mostrado a quem pediu.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.content_requests
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 3. A transicao
-- ============================================================
--
-- So sai de `open`, e so as colunas da resolucao mudam. Vale tambem para
-- service_role. O CHECK da tabela confere a forma de cada destino.

CREATE FUNCTION private.enforce_content_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'open' THEN
    RAISE EXCEPTION 'pedido de orientacao % ja resolvido (%): o desfecho e final', OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF to_jsonb(NEW) - ARRAY['status', 'fulfilled_content_item_id', 'decline_reason',
                           'resolved_by_admin_id', 'resolved_by', 'resolved_at', 'updated_at']
     IS DISTINCT FROM
     to_jsonb(OLD) - ARRAY['status', 'fulfilled_content_item_id', 'decline_reason',
                           'resolved_by_admin_id', 'resolved_by', 'resolved_at', 'updated_at'] THEN
    RAISE EXCEPTION 'pedido de orientacao %: so a resolucao muda, o pedido e imutavel', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_transition
BEFORE UPDATE ON public.content_requests
FOR EACH ROW EXECUTE FUNCTION private.enforce_content_request_transition();

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.content_requests
FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');


-- ============================================================
-- 4. Indices — um para cada FK, e os caminhos de leitura
-- ============================================================

-- O app do titular: os pedidos da ficha, recentes primeiro.
CREATE INDEX idx_content_requests_patient
  ON public.content_requests (patient_id, created_at DESC);
-- O app do acompanhante (os dele) e o limite diario por conta.
CREATE INDEX idx_content_requests_requester
  ON public.content_requests (requested_by, created_at DESC);
-- A fila do administrador, por estado.
CREATE INDEX idx_content_requests_status
  ON public.content_requests (status, created_at DESC);
CREATE INDEX idx_content_requests_content_item
  ON public.content_requests (fulfilled_content_item_id);
CREATE INDEX idx_content_requests_admin
  ON public.content_requests (resolved_by_admin_id);
CREATE INDEX idx_content_requests_resolved_by
  ON public.content_requests (resolved_by);


-- ============================================================
-- 5. RLS
-- ============================================================

ALTER TABLE public.content_requests ENABLE ROW LEVEL SECURITY;

-- O titular ve todos os pedidos da propria ficha, inclusive os que o
-- acompanhante fez por ele: o pedido e sobre ele.
CREATE POLICY content_requests_select_own ON public.content_requests
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

-- O acompanhante ve so os que ELE fez, e enquanto tiver a area `resources`.
CREATE POLICY content_requests_select_caregiver ON public.content_requests
  FOR SELECT TO authenticated
  USING ( requested_by = (SELECT public.get_my_uid())
          AND patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('resources')))) );

-- NENHUMA politica para a equipe nem de escrita: o administrador le pela
-- RPC sem identidade, e toda escrita e RPC.


-- ============================================================
-- 6. A resposta abre para quem pediu?
-- ============================================================
--
-- O recorte de is_content_visible_to_me, mas para um pedido, e nao para a
-- sessao (quem chama e o administrador). Versao publicada E (sem CID, OU o
-- CID cruza com o diagnostico da ficha E quem pediu e o titular ou um
-- acompanhante com `clinical_record`).

CREATE FUNCTION private.is_content_available_to_requester(
  p_content_item_id uuid,
  p_patient_id      uuid,
  p_requester_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.content_versions v
                  WHERE v.content_item_id = p_content_item_id
                    AND v.status = 'published')
     AND (
           NOT EXISTS (SELECT 1 FROM public.content_cid10 c
                        WHERE c.content_item_id = p_content_item_id)
           OR (
                EXISTS (SELECT 1
                          FROM public.content_cid10 c
                          JOIN public.patient_diagnoses pd ON pd.cid10_id = c.cid10_id
                         WHERE c.content_item_id = p_content_item_id
                           AND pd.patient_id = p_patient_id)
                AND (
                      EXISTS (SELECT 1 FROM public.patients p
                               WHERE p.id = p_patient_id AND p.account_id = p_requester_id)
                      OR EXISTS (SELECT 1
                                   FROM public.patient_caregivers pc
                                   JOIN public.caregivers cg ON cg.id = pc.caregiver_id
                                   JOIN public.patient_caregiver_scopes s
                                     ON s.link_id = pc.id
                                    AND s.scope   = 'clinical_record'
                                    AND s.enabled
                                  WHERE cg.account_id = p_requester_id
                                    AND pc.patient_id = p_patient_id
                                    AND pc.status = 'active'
                                    AND cg.is_active)
                    )
              )
         );
$$;

COMMENT ON FUNCTION private.is_content_available_to_requester(uuid, uuid, uuid) IS
  'A orientacao abriria para quem fez o pedido? Versao publicada e (universal, ou CID da ficha e quem pediu e titular ou acompanhante com clinical_record). Usado por resolve_content_request. ADR-033.';


-- ============================================================
-- 7. Pedir
-- ============================================================
--
-- O titular pede pela propria ficha; o acompanhante, pelo tutelado com a
-- area `resources`. O limite e por CONTA e por DIA no fuso da clinica
-- (clinic_settings.content_request_daily_limit), com trava por conta para
-- dois pedidos simultaneos nao dividirem a ultima vaga.

CREATE FUNCTION public.request_content(
  p_context           text,
  p_original_question text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_patient_id uuid := private.my_own_patient_id();
  v_wards      uuid[];
  v_context    text := btrim(p_context);
  v_question   text := NULLIF(btrim(p_original_question), '');
  v_limit      smallint;
  v_tz         text;
  v_day_start  timestamptz;
  v_used       bigint;
  v_id         uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_patient_id IS NULL THEN
    v_wards := private.my_ward_patient_ids_for('resources');
    -- Um tutelado por acompanhante (ADR-026). Zero e quem nao e publico da
    -- biblioteca; mais de um nao deveria existir, e adivinhar a ficha seria pior.
    IF pg_catalog.cardinality(v_wards) <> 1 THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    v_patient_id := v_wards[1];
  END IF;

  IF v_context IS NULL OR length(v_context) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'invalid_context'
      USING ERRCODE = '22023',
            HINT    = 'Descreva o que precisa em 10 a 1000 caracteres.';
  END IF;

  IF v_question IS NOT NULL AND length(v_question) > 2000 THEN
    RAISE EXCEPTION 'invalid_question' USING ERRCODE = '22023';
  END IF;

  SELECT s.content_request_daily_limit, s.time_zone
    INTO v_limit, v_tz
    FROM public.clinic_settings s
   WHERE s.id = 1;
  v_limit := coalesce(v_limit, 5);
  v_tz    := coalesce(v_tz, 'America/Sao_Paulo');

  -- Meia-noite de hoje NO FUSO DA CLINICA. `date::timestamp` e a meia-noite
  -- sem fuso; AT TIME ZONE a le no fuso da clinica e devolve o instante.
  v_day_start := (private.clinic_today()::timestamp) AT TIME ZONE v_tz;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content_request:' || v_uid::text, 0));

  SELECT count(*) INTO v_used
    FROM public.content_requests r
   WHERE r.requested_by = v_uid
     AND r.created_at >= v_day_start;

  IF v_used >= v_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  INSERT INTO public.content_requests (patient_id, requested_by, context, original_question)
  VALUES (v_patient_id, v_uid, v_context, v_question)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.request_content(text, text) IS
  'Titular, ou acompanhante com resources, pede uma orientacao. Contexto de 10 a 1000 caracteres; pergunta original opcional (a do assistente). Limite diario por conta em clinic_settings.content_request_daily_limit. ADR-033.';


-- ============================================================
-- 8. Desistir
-- ============================================================

CREATE FUNCTION public.cancel_content_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_status public.content_request_status;
BEGIN
  -- So quem pediu. O titular ve o pedido do acompanhante, mas nao o retira:
  -- o pedido e de quem o escreveu.
  SELECT r.status INTO v_status
    FROM public.content_requests r
   WHERE r.id = p_request_id
     AND r.requested_by = v_uid
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'content_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_status <> 'open' THEN
    RAISE EXCEPTION 'content_request_not_open' USING ERRCODE = '55000';
  END IF;

  UPDATE public.content_requests
     SET status      = 'cancelled',
         resolved_by = v_uid,
         resolved_at = pg_catalog.clock_timestamp()
   WHERE id = p_request_id;
END;
$$;

COMMENT ON FUNCTION public.cancel_content_request(uuid) IS
  'Quem pediu desiste do pedido ainda aberto. Pedido de outra conta responde content_request_not_found. ADR-033.';


-- ============================================================
-- 9. A fila do administrador — sem identidade
-- ============================================================
--
-- Devolve o que o administrador precisa para escrever: o contexto, a
-- pergunta, se quem pediu e titular ou acompanhante, e o andamento. NAO
-- devolve patient_id nem requested_by. p_status NULL = todos.

CREATE FUNCTION public.read_content_requests(
  p_status public.content_request_status DEFAULT 'open',
  p_limit  integer     DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS TABLE (
  id                        uuid,
  status                    public.content_request_status,
  requester_kind            text,
  context                   text,
  original_question         text,
  fulfilled_content_item_id uuid,
  decline_reason            text,
  resolved_by_admin_id      uuid,
  resolved_at               timestamptz,
  created_at                timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT r.id,
           r.status,
           CASE WHEN p.account_id = r.requested_by THEN 'patient' ELSE 'caregiver' END,
           r.context,
           r.original_question,
           r.fulfilled_content_item_id,
           r.decline_reason,
           r.resolved_by_admin_id,
           r.resolved_at,
           r.created_at
      FROM public.content_requests r
      JOIN public.patients p ON p.id = r.patient_id
     WHERE (p_status IS NULL OR r.status = p_status)
       AND (p_before IS NULL OR r.created_at < p_before)
     ORDER BY r.created_at DESC
     LIMIT LEAST(GREATEST(coalesce(p_limit, 50), 1), 200);
END;
$$;

COMMENT ON FUNCTION public.read_content_requests(public.content_request_status, integer, timestamptz) IS
  'A fila de pedidos de orientacao, para o administrador, SEM a identidade de quem pediu (sem patient_id nem requested_by). requester_kind: patient ou caregiver. Paginacao por p_before (created_at). ADR-033.';


-- ============================================================
-- 10. Resolver
-- ============================================================
--
-- p_action: 'fulfill' (com p_content_item_id, orientacao publicada que abra
-- para quem pediu) ou 'decline' (com p_reason). Avisa quem pediu.

CREATE FUNCTION public.resolve_content_request(
  p_request_id      uuid,
  p_action          text,
  p_content_item_id uuid DEFAULT NULL,
  p_reason          text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_admin_id uuid := private.my_admin_id();
  v_req      record;
  v_reason   text := NULLIF(btrim(p_reason), '');
BEGIN
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_action IS NULL OR p_action NOT IN ('fulfill', 'decline') THEN
    RAISE EXCEPTION 'invalid_action' USING ERRCODE = '22023';
  END IF;

  SELECT r.id, r.status, r.patient_id, r.requested_by INTO v_req
    FROM public.content_requests r
   WHERE r.id = p_request_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'content_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_req.status <> 'open' THEN
    RAISE EXCEPTION 'content_request_not_open' USING ERRCODE = '55000';
  END IF;

  IF p_action = 'fulfill' THEN
    IF NOT EXISTS (SELECT 1 FROM public.content_versions v
                    WHERE v.content_item_id = p_content_item_id
                      AND v.status = 'published') THEN
      RAISE EXCEPTION 'content_not_published'
        USING ERRCODE = '22023',
              HINT    = 'O pedido e atendido com orientacao ja publicada.';
    END IF;
    IF NOT private.is_content_available_to_requester(p_content_item_id, v_req.patient_id, v_req.requested_by) THEN
      RAISE EXCEPTION 'content_not_available_to_requester'
        USING ERRCODE = '22023',
              HINT    = 'Esta orientacao e marcada por CID e nao abriria para quem pediu. Use uma orientacao universal.';
    END IF;

    UPDATE public.content_requests
       SET status                    = 'fulfilled',
           fulfilled_content_item_id = p_content_item_id,
           resolved_by_admin_id      = v_admin_id,
           resolved_by               = auth.uid(),
           resolved_at               = pg_catalog.clock_timestamp()
     WHERE id = p_request_id;
  ELSE
    IF v_reason IS NULL OR length(v_reason) > 500 THEN
      RAISE EXCEPTION 'reason_required'
        USING ERRCODE = '22023',
              HINT    = 'A recusa leva um motivo de 1 a 500 caracteres, que quem pediu vai ler.';
    END IF;

    UPDATE public.content_requests
       SET status               = 'declined',
           decline_reason       = v_reason,
           resolved_by_admin_id = v_admin_id,
           resolved_by          = auth.uid(),
           resolved_at          = pg_catalog.clock_timestamp()
     WHERE id = p_request_id;
  END IF;

  -- Avisa SO quem pediu. Tipo aposentado cala o aviso, sem travar a
  -- resolucao (private.notify levantaria erro). A area do acompanhante e
  -- conferida de novo no envio do push (recipient_still_eligible).
  IF EXISTS (SELECT 1 FROM public.notification_types t
              WHERE t.code = 'content_request_resolved' AND t.is_active) THEN
    PERFORM private.notify(v_req.requested_by, 'content_request_resolved',
                           'content_request:' || p_request_id::text,
                           'content_requests', p_request_id, v_req.patient_id);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.resolve_content_request(uuid, text, uuid, text) IS
  'Administrador atende (fulfill, com orientacao publicada que abra para quem pediu) ou recusa (decline, com motivo) um pedido aberto, e avisa quem pediu. ADR-033.';


-- ============================================================
-- 11. Notificacao
-- ============================================================
--
-- Silenciavel. Area `resources`: o acompanhante que pediu deixa de ser
-- avisado se perder a area. O rotulo nao diz o assunto: o push aparece na
-- tela bloqueada.
INSERT INTO public.notification_types
  (code, label, category, is_silenceable, sort_order, audience, caregiver_scope)
VALUES
  ('content_request_resolved', 'Sua solicitação de orientação foi respondida', 'content', true, 13, 'patient', 'resources')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 12. O pacote do titular
-- ============================================================
--
-- Mesma assinatura e mesmo corpo da versao de create_content_directed_sends,
-- com duas secoes novas: na ficha, `content_requests` (todos os pedidos
-- sobre ela); na conta, `content_requests_as_caregiver` (os que a conta fez
-- pelo tutelado).

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
         AND m.author_kind = 'caregiver'),
    -- ADR-033: os pedidos de orientacao que a conta fez por outra ficha.
    'content_requests_as_caregiver', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cr) ORDER BY cr.created_at), '[]'::jsonb)
        FROM public.content_requests cr
       WHERE cr.requested_by = v_uid
         AND cr.patient_id IS DISTINCT FROM v_patient_id)
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
          FROM public.patient_caregiver_scopes x WHERE x.patient_id = v_patient_id),
      -- G.2 (ADR-032): as orientacoes enviadas a ele e quando as abriu.
      'directed_contents', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.sent_at), '[]'::jsonb)
          FROM public.content_directed_sends x WHERE x.patient_id = v_patient_id),
      -- ADR-033: os pedidos de orientacao sobre a ficha, dele e do acompanhante.
      'content_requests', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.content_requests x WHERE x.patient_id = v_patient_id)
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
-- 13. Privilegios — no fim, e medidos
-- ============================================================

REVOKE ALL ON public.content_requests FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.content_requests FROM authenticated, service_role;
GRANT  SELECT ON public.content_requests TO authenticated;

REVOKE EXECUTE ON FUNCTION private.is_content_available_to_requester(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.enforce_content_request_transition()               FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.request_content(text, text)                                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_content_request(uuid)                                             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.read_content_requests(public.content_request_status, integer, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_content_request(uuid, text, uuid, text)                          FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_content(text, text)                                              TO authenticated;
GRANT  EXECUTE ON FUNCTION public.cancel_content_request(uuid)                                             TO authenticated;
GRANT  EXECUTE ON FUNCTION public.read_content_requests(public.content_request_status, integer, timestamptz) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.resolve_content_request(uuid, text, uuid, text)                          TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.request_content(text, text)',
    'public.cancel_content_request(uuid)',
    'public.read_content_requests(public.content_request_status, integer, timestamptz)',
    'public.resolve_content_request(uuid, text, uuid, text)',
    'public.export_my_data(uuid)'
  ];
  v_ruim text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_rpcs) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio errado (authenticated sem EXECUTE ou anon com) em: %', v_ruim;
  END IF;

  IF pg_catalog.has_function_privilege('authenticated',
       'private.is_content_available_to_requester(uuid, uuid, uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
       'private.is_content_available_to_requester(uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'is_content_available_to_requester executavel pela API: seria oraculo de CID';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.content_requests', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.content_requests', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.content_requests', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.content_requests', 'DELETE') THEN
    RAISE EXCEPTION 'content_requests: anon le ou authenticated escreve direto';
  END IF;
END;
$$;
