-- O profissional envia uma orientacao da biblioteca direto a um paciente, e a
-- equipe sabe se ele abriu.
-- Plano das pendencias do painel de 30/09/2026, Fase G, item G.2 (painel #12).
-- Design e racional: supera-docs/ADRs/ADR-032 — Envio dirigido de orientação.md
--
-- POR QUE NAO E EDITORIAL. A ADR-010 §1 ja tinha dito: "o profissional X
-- enviou o conteudo Y ao paciente Z" e metadado clinico. Se X e a psicologa,
-- a linha revela o acompanhamento psicologico sem ter coluna de conteudo
-- nenhuma. A tabela nasce, por isso, no contrato transversal da ADR-003 §3
-- (patient_id, origin_specialty_id, visibility), com o sigilo forcado por
-- trigger, leitura da equipe pelo pedagio da ADR-008 e trilha de escrita.
--
-- >>> DUAS REGRAS PROVISORIAS, cada uma num helper so. Aguardam a CEON (as
-- >>> perguntas da G.2, registradas em Questoes em aberto em 01/10/2026):
-- >>>   1. QUEM ENVIA — private.can_send_directed_content(especialidade).
-- >>>      Provisorio: TODAS as especialidades, inclusive Psicologia (resposta
-- >>>      b). Se a CEON disser so Nutricao e Fisioterapia (a), muda o corpo
-- >>>      do helper; o que ja foi enviado continua valendo.
-- >>>   2. QUEM VE SE ABRIU — private.directed_send_visible_to_staff(...).
-- >>>      Provisorio: toda a equipe, menos o que e de Psicologia (resposta
-- >>>      b), o recorte de sempre da ADR-003. Se a CEON disser so a
-- >>>      especialidade de quem enviou (a), muda o corpo do helper, e as duas
-- >>>      politicas da equipe seguem iguais.
-- >>> Nos dois casos a direcao provisoria e a aberta, mas a parte sensivel
-- >>> (Psicologia) nasce fechada: abrir primeiro so custa caro quando o que
-- >>> foi aberto e sensivel, e aqui nao e.
--
-- O QUE ENTRA:
--   1. content_directed_sends: paciente, orientacao, quem enviou (perfil e
--      conta), especialidade de origem, visibility, sent_at e opened_at.
--      Imutavel, menos duas mutacoes: opened_at de NULL para um valor, uma
--      vez; e apertar visibility (team -> specialty_restricted).
--   2. send_directed_content(p_patient_id, p_content_item_id,
--      p_origin_specialty_id?): profissional ativo, orientacao com versao
--      publicada, paciente ativo. Devolve o id do envio.
--   3. mark_directed_content_opened(p_send_id): so o TITULAR marca. O
--      acompanhante le, mas "abriu" e do paciente. Idempotente.
--   4. read_content_directed_sends(p_patient_id): a equipe, dono
--      clinical_reader, com pedagio.
--   5. Notificacao `content_directed`, area `resources` do acompanhante. O
--      texto nao nomeia a area. O envio restrito nao avisa o acompanhante.
--   6. Sigilo que retroage (tighten_notes_on_confidential) e o pacote do
--      titular (export_my_data).
--
-- O QUE FICA FORA: o marcador de adesao da fisioterapia (visto/pendente por
-- exercicio) e nivel COMPLETO. "Abriu ou nao" nao e adesao: e um timestamp.
-- E "abriu" e por ENVIO, nao por item: patient_content_states.read_at (ADR-010
-- §5) continua sendo do paciente e sem leitura da equipe.
--
-- A segunda migration (apply_directed_sends_to_visibility) abre a orientacao
-- enviada no app mesmo sem CID compativel e ensina a peneira das
-- notificacoes a reconhecer o envio como alvo.


-- ============================================================
-- 1. As duas regras provisorias
-- ============================================================

-- PROVISORIO (pergunta 1 da G.2). Recebe a especialidade e nao o profissional:
-- a resposta (a) e uma lista de especialidades, e a regra "a especialidade e
-- vigente de quem envia" fica na RPC, que nao muda com a resposta.
CREATE FUNCTION private.can_send_directed_content(p_specialty_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (SELECT 1 FROM public.specialties s
                  WHERE s.id = p_specialty_id AND s.is_active);
$$;

COMMENT ON FUNCTION private.can_send_directed_content(uuid) IS
  'PROVISORIO (G.2, pergunta 1 a CEON, 01/10/2026): que especialidade envia orientacao dirigida. Hoje todas as ativas, inclusive Psicologia (b). Resposta (a): so nutrition e physiotherapy. ADR-032.';

-- PROVISORIO (pergunta 2 da G.2). Entra nas duas politicas da equipe. Recebe
-- as colunas, nao o id: politica que chama funcao com SELECT na mesma tabela
-- seria um segundo acesso por linha.
CREATE FUNCTION private.directed_send_visible_to_staff(
  p_visibility          public.clinical_visibility,
  p_origin_specialty_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT CASE
           WHEN private.is_active_professional() THEN
             p_visibility = 'team'
             OR p_origin_specialty_id = ANY (private.my_specialty_ids())
           WHEN private.is_active_admin() THEN
             p_visibility = 'team'
           ELSE false
         END;
$$;

COMMENT ON FUNCTION private.directed_send_visible_to_staff(public.clinical_visibility, uuid) IS
  'PROVISORIO (G.2, pergunta 2 a CEON, 01/10/2026): quem da equipe ve o envio dirigido e se o paciente abriu. Hoje o recorte da ADR-003 (b): team para todos, restrito so para a propria especialidade, administrador so team. Resposta (a): so p_origin_specialty_id = ANY(my_specialty_ids()). ADR-032.';


-- ============================================================
-- 2. A tabela
-- ============================================================

CREATE TABLE public.content_directed_sends (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- As TRES colunas do contrato transversal da ADR-003 §3.
  patient_id          uuid NOT NULL REFERENCES public.patients (id)    ON DELETE RESTRICT,
  origin_specialty_id uuid NOT NULL REFERENCES public.specialties (id) ON DELETE RESTRICT,
  visibility          public.clinical_visibility NOT NULL DEFAULT 'team',
  -- O item, e nao a versao: o paciente abre a versao publicada do momento. Se
  -- a orientacao for revisada, ele le a nova; se for despublicada, o envio
  -- some do app (a segunda migration so abre item com versao publicada).
  content_item_id     uuid NOT NULL REFERENCES public.content_items (id) ON DELETE RESTRICT,
  -- Autoria em duas colunas, como em specialty_notes: o perfil (regra por
  -- area) e a conta (trilha).
  sent_by_professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE RESTRICT,
  sent_by                 uuid NOT NULL REFERENCES public.accounts (id)      ON DELETE RESTRICT,
  sent_at   timestamptz NOT NULL DEFAULT now(),
  -- NULL = nao abriu. Marcado so pelo titular, uma vez.
  opened_at timestamptz,
  CONSTRAINT ck_content_directed_sends_opened CHECK (opened_at IS NULL OR opened_at >= sent_at)
);

COMMENT ON TABLE public.content_directed_sends IS
  'Orientacao da biblioteca enviada por um profissional a um paciente (G.2, ADR-032). Metadado clinico (ADR-010 §1): o envio de Psicologia nasce specialty_restricted por trigger. Escrita so por RPC.';
COMMENT ON COLUMN public.content_directed_sends.visibility IS
  'Escopo de leitura. Especialidade confidencial forca specialty_restricted por trigger — vale tambem para service_role. So aperta, nunca abre.';
COMMENT ON COLUMN public.content_directed_sends.opened_at IS
  'Quando o TITULAR abriu este envio (mark_directed_content_opened). Por envio, nao por item: nao e patient_content_states.read_at.';


-- ============================================================
-- 3. Sigilo e imutabilidade
-- ============================================================

CREATE FUNCTION private.enforce_directed_send_confidentiality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.specialties s
              WHERE s.id = NEW.origin_specialty_id AND s.is_confidential) THEN
    NEW.visibility := 'specialty_restricted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_confidentiality
BEFORE INSERT ON public.content_directed_sends
FOR EACH ROW EXECUTE FUNCTION private.enforce_directed_send_confidentiality();

-- Duas mutacoes admitidas, e so elas: marcar a abertura (NULL -> valor) e
-- apertar o escopo (team -> specialty_restricted, quando uma especialidade
-- vira confidencial). Vale tambem para service_role.
CREATE FUNCTION private.enforce_directed_send_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF OLD.opened_at IS NULL AND NEW.opened_at IS NOT NULL
     AND to_jsonb(NEW) - 'opened_at' = to_jsonb(OLD) - 'opened_at' THEN
    RETURN NEW;
  END IF;
  IF NEW.visibility = 'specialty_restricted' AND OLD.visibility = 'team'
     AND to_jsonb(NEW) - 'visibility' = to_jsonb(OLD) - 'visibility' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'envio dirigido e imutavel (id=%): so a abertura e o aperto do sigilo mudam', OLD.id
    USING ERRCODE = 'check_violation';
END;
$$;

CREATE TRIGGER trg_enforce_immutability
BEFORE UPDATE ON public.content_directed_sends
FOR EACH ROW EXECUTE FUNCTION private.enforce_directed_send_immutability();

-- O sigilo retroage: a quarta tabela do contrato entra no gatilho de
-- specialties. Mesma assinatura, CREATE OR REPLACE preserva dono e ACL.
CREATE OR REPLACE FUNCTION private.tighten_notes_on_confidential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_confidential AND NOT OLD.is_confidential THEN
    UPDATE public.specialty_notes
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';

    UPDATE public.conversations
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';

    UPDATE public.appointments
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';

    UPDATE public.content_directed_sends
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.content_directed_sends
FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');


-- ============================================================
-- 4. Indices — um para cada FK, e os dois caminhos de leitura
-- ============================================================

-- A ficha (equipe) e o app (titular): os envios de um paciente, recentes primeiro.
CREATE INDEX idx_content_directed_sends_patient
  ON public.content_directed_sends (patient_id, sent_at DESC);
-- O app abre a orientacao: "este item foi enviado a mim?" (segunda migration).
CREATE INDEX idx_content_directed_sends_item
  ON public.content_directed_sends (content_item_id, patient_id);
CREATE INDEX idx_content_directed_sends_specialty
  ON public.content_directed_sends (origin_specialty_id);
CREATE INDEX idx_content_directed_sends_professional
  ON public.content_directed_sends (sent_by_professional_id);
CREATE INDEX idx_content_directed_sends_account
  ON public.content_directed_sends (sent_by);


-- ============================================================
-- 5. RLS
-- ============================================================

ALTER TABLE public.content_directed_sends ENABLE ROW LEVEL SECURITY;

-- O titular ve TODOS os proprios envios, inclusive os de Psicologia: o sigilo
-- e da equipe e do acompanhante, nao contra o paciente (como na agenda).
CREATE POLICY content_directed_sends_select_own ON public.content_directed_sends
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

-- O acompanhante com a area `resources` ve os envios `team`. O de Psicologia
-- nunca. O envio de orientacao marcada por CID exige tambem
-- `clinical_record` (ADR-030 §8): o titulo revela o diagnostico.
CREATE POLICY content_directed_sends_select_caregiver ON public.content_directed_sends
  FOR SELECT TO authenticated
  USING (
    visibility = 'team'
    AND patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('resources'))))
    AND ( NOT EXISTS (SELECT 1 FROM public.content_cid10 cc
                       WHERE cc.content_item_id = content_directed_sends.content_item_id)
          OR patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids_for('clinical_record')))) )
  );

-- A equipe, pelo papel auditado. A regra e o helper provisorio.
CREATE POLICY content_directed_sends_select_professional ON public.content_directed_sends
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_professional())
          AND private.directed_send_visible_to_staff(visibility, origin_specialty_id) );

CREATE POLICY content_directed_sends_select_admin ON public.content_directed_sends
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin())
          AND private.directed_send_visible_to_staff(visibility, origin_specialty_id) );

-- NENHUMA politica de escrita: o envio e a abertura sao RPC.


-- ============================================================
-- 6. Enviar
-- ============================================================
--
-- SECURITY DEFINER: grava sem politica de INSERT e chama o produtor de
-- notificacao. As checagens sao as da politica que nao existe:
--   * profissional ativo;
--   * especialidade de origem VIGENTE de quem envia (a informada, ou a
--     primaria vigente — o desempate do E.1);
--   * a especialidade pode enviar (helper provisorio);
--   * paciente ativo; orientacao com versao publicada.
-- Paciente e orientacao inexistentes ou fora do caminho respondem erros
-- proprios: quem envia ja ve a ficha (lista de pacientes) e a biblioteca
-- inteira, entao nao ha oraculo a esconder.

CREATE FUNCTION public.send_directed_content(
  p_patient_id          uuid,
  p_content_item_id     uuid,
  p_origin_specialty_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := private.my_professional_id();
  v_specialty_id    uuid := p_origin_specialty_id;
  v_send_id         uuid;
  v_visibility      public.clinical_visibility;
BEGIN
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'professional_profile_required' USING ERRCODE = '42501';
  END IF;

  IF v_specialty_id IS NULL THEN
    SELECT ps.specialty_id INTO v_specialty_id
      FROM public.professional_specialties ps
     WHERE ps.professional_id = v_professional_id
       AND ps.ended_at IS NULL
     ORDER BY ps.is_primary DESC, ps.started_at DESC
     LIMIT 1;
  END IF;

  IF v_specialty_id IS NULL
     OR NOT (v_specialty_id = ANY (private.my_specialty_ids())) THEN
    RAISE EXCEPTION 'origin_specialty_not_allowed'
      USING ERRCODE = '42501',
            HINT    = 'O envio sai de uma especialidade vigente de quem envia.';
  END IF;

  IF NOT private.can_send_directed_content(v_specialty_id) THEN
    RAISE EXCEPTION 'directed_send_not_allowed'
      USING ERRCODE = '42501',
            HINT    = 'Esta especialidade nao envia orientacao dirigida.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patients p
                  WHERE p.id = p_patient_id AND p.is_active) THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.content_versions v
                  WHERE v.content_item_id = p_content_item_id
                    AND v.status = 'published') THEN
    RAISE EXCEPTION 'content_not_published'
      USING ERRCODE = '22023',
            HINT    = 'So orientacao com versao publicada e enviada.';
  END IF;

  INSERT INTO public.content_directed_sends
    (patient_id, origin_specialty_id, content_item_id, sent_by_professional_id, sent_by)
  VALUES
    (p_patient_id, v_specialty_id, p_content_item_id, v_professional_id, auth.uid())
  RETURNING id, visibility INTO v_send_id, v_visibility;

  -- O envio restrito avisa so o titular (p_include_caregivers = false), como
  -- todo alvo restrito. A area do acompanhante e o CID sao conferidos dentro
  -- do produtor e de novo no envio do push (segunda migration).
  PERFORM private.notify_patient_audience(
    p_patient_id, 'content_directed', 'directed:' || v_send_id::text,
    'content_directed_sends', v_send_id, v_visibility = 'team');

  RETURN v_send_id;
END;
$$;

COMMENT ON FUNCTION public.send_directed_content(uuid, uuid, uuid) IS
  'Envia orientacao publicada a um paciente ativo, a partir de especialidade vigente de quem envia (padrao: a primaria). Notifica o titular e, se o envio e team, o acompanhante com a area resources. ADR-032.';


-- ============================================================
-- 7. Abrir
-- ============================================================
--
-- So o titular: "abriu" e do paciente. O acompanhante le o envio, mas a
-- leitura dele nao marca nada. Idempotente: a segunda chamada nao muda a
-- data. Id inexistente e envio de outra pessoa respondem o mesmo.

CREATE FUNCTION public.mark_directed_content_opened(p_send_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
  v_opened_at  timestamptz;
BEGIN
  SELECT s.opened_at INTO v_opened_at
    FROM public.content_directed_sends s
   WHERE s.id = p_send_id
     AND s.patient_id = v_patient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'directed_send_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_opened_at IS NULL THEN
    UPDATE public.content_directed_sends
       SET opened_at = pg_catalog.now()
     WHERE id = p_send_id
    RETURNING opened_at INTO v_opened_at;
  END IF;

  RETURN v_opened_at;
END;
$$;

COMMENT ON FUNCTION public.mark_directed_content_opened(uuid) IS
  'O titular marca que abriu o envio. Idempotente: devolve a data da primeira abertura. Acompanhante e equipe recebem directed_send_not_found. ADR-032.';


-- ============================================================
-- 8. Notificacao
-- ============================================================
--
-- Silenciavel: e recomendacao, nao dever clinico. Area `resources`, a mesma
-- de content_published. O rotulo NAO nomeia a especialidade: o push aparece
-- na tela bloqueada.
INSERT INTO public.notification_types
  (code, label, category, is_silenceable, sort_order, audience, caregiver_scope)
VALUES
  ('content_directed', 'Sua equipe enviou uma orientação', 'content', true, 12, 'patient', 'resources')
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 9. O pacote do titular
-- ============================================================
--
-- export_my_data e INVOKER: le pela politica do titular, que ve os proprios
-- envios. Mesma assinatura e mesmo corpo da versao de
-- create_caregiver_scope_rpcs, com a secao `directed_contents` no fim da ficha.

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
          FROM public.patient_caregiver_scopes x WHERE x.patient_id = v_patient_id),
      -- G.2 (ADR-032): as orientacoes enviadas a ele e quando as abriu.
      'directed_contents', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.sent_at), '[]'::jsonb)
          FROM public.content_directed_sends x WHERE x.patient_id = v_patient_id)
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
-- 10. A leitura da equipe — dono clinical_reader, com pedagio
-- ============================================================

GRANT SELECT ON public.content_directed_sends TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.directed_send_visible_to_staff(public.clinical_visibility, uuid) TO clinical_reader;

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

CREATE FUNCTION public.read_content_directed_sends(
  p_patient_id uuid,
  p_limit      integer     DEFAULT 50,
  p_before     timestamptz DEFAULT NULL
)
RETURNS SETOF public.content_directed_sends
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT s.* FROM public.content_directed_sends s
     WHERE s.patient_id = p_patient_id
       AND (p_before IS NULL OR s.sent_at < p_before)
     ORDER BY s.sent_at DESC
     LIMIT LEAST(GREATEST(p_limit, 1), 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('content_directed_sends', p_patient_id, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_content_directed_sends(uuid, integer, timestamptz) IS
  'Os envios dirigidos de um paciente, para a equipe, com opened_at. Recorte da politica (helper provisorio directed_send_visible_to_staff) e pedagio da ADR-008. Paginacao por p_before (sent_at). ADR-032.';

REVOKE EXECUTE ON FUNCTION public.read_content_directed_sends(uuid, integer, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.read_content_directed_sends(uuid, integer, timestamptz) TO authenticated, service_role;

RESET ROLE;
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 11. Privilegios — no fim, e medidos
-- ============================================================

REVOKE ALL ON public.content_directed_sends FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.content_directed_sends FROM authenticated, service_role;
GRANT  SELECT ON public.content_directed_sends TO authenticated;

REVOKE EXECUTE ON FUNCTION private.can_send_directed_content(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.directed_send_visible_to_staff(public.clinical_visibility, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.enforce_directed_send_confidentiality()        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.enforce_directed_send_immutability()           FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.send_directed_content(uuid, uuid, uuid)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_directed_content_opened(uuid)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.send_directed_content(uuid, uuid, uuid)  TO authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_directed_content_opened(uuid)       TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.send_directed_content(uuid, uuid, uuid)',
    'public.mark_directed_content_opened(uuid)',
    'public.read_content_directed_sends(uuid, integer, timestamptz)',
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

  SELECT pg_catalog.string_agg(f, ', ') INTO v_ruim
    FROM pg_catalog.unnest(ARRAY[
           'private.can_send_directed_content(uuid)',
           'private.directed_send_visible_to_staff(public.clinical_visibility, uuid)']) AS f
   WHERE pg_catalog.has_function_privilege('anon', f, 'EXECUTE')
      OR pg_catalog.has_function_privilege('authenticated', f, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'helper provisorio executavel por anon/authenticated: %', v_ruim;
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.content_directed_sends', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.content_directed_sends', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.content_directed_sends', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.content_directed_sends', 'DELETE') THEN
    RAISE EXCEPTION 'content_directed_sends: anon le ou authenticated escreve direto';
  END IF;

  IF NOT pg_catalog.has_function_privilege('clinical_reader',
           'private.directed_send_visible_to_staff(public.clinical_visibility, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader sem EXECUTE no helper da politica: a leitura da equipe morreria';
  END IF;
END;
$$;
