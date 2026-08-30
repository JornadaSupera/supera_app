-- Ficha clínica do paciente: o primeiro agregado clínico, e o primeiro espelhado.
-- Design e racional: supera-docs/Modelo de Dados/Paciente.md
-- Decisões: ADR-001 (nomes/PK), ADR-002 (vocabulário), ADR-003 (RLS multi-perfil),
--           ADR-004 (espelhamento do Gemed), ADR-005 (ciclo de vida do dado).
--
-- Nenhum helper private.* novo: os cinco de create_identity_core e os dois de
-- create_caregiver_links já são o predicado completo. É o retorno de ter
-- fechado a camada de acesso antes de tocar em dado de saúde.


-- ============================================================
-- Vocabulário (ADR-002: estado é enum; motivo/categoria é tabela)
-- ============================================================

CREATE TYPE public.external_link_status AS ENUM ('proposed', 'confirmed', 'rejected');

-- Proveniência do valor. O código ramifica nela (a ficha mostra a origem ao
-- profissional), não carrega metadado, ninguém lhe aponta FK => enum.
CREATE TYPE public.field_source AS ENUM ('local', 'gemed');

CREATE TYPE public.clinical_history_kind AS ENUM ('allergy', 'prior_reaction');

CREATE TYPE public.legal_document_kind AS ENUM ('terms_of_use', 'privacy_policy');

CREATE TYPE public.data_subject_request_type AS ENUM
  ('access', 'rectification', 'portability', 'consent_revocation', 'deletion');

-- granted != executed DE PROPÓSITO (ADR-005): a carência entre deferir e
-- executar é o que impede que um clique irreversível não tenha volta.
CREATE TYPE public.data_subject_request_status AS ENUM
  ('requested', 'under_review', 'granted', 'executed', 'refused');


-- ============================================================
-- external_refs — a chave externa de qualquer entidade espelhada
-- ============================================================
--
-- ADR-004: a forma da chave do Gemed é desconhecida (anexo técnico ausente,
-- questão #15). jsonb absorve chave simples, composta ou escopada por unidade.
-- Uma coluna gemed_patient_id exigiria migration de chave em tabela com dado
-- de saúde; esta tabela absorve a descoberta sem tocar em patients.

CREATE TABLE public.external_refs (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  system       text NOT NULL DEFAULT 'gemed',
  entity_type  text NOT NULL,
  -- Polimórfico de propósito: aponta para tabelas diferentes conforme
  -- entity_type, logo sem FK. Custo assumido explicitamente na ADR-004.
  local_id     uuid NOT NULL,
  -- jsonb normaliza chaves (ordenadas, sem duplicata) => igualdade canônica,
  -- e o UNIQUE abaixo funciona sem truque de serialização.
  external_key jsonb NOT NULL CHECK (jsonb_typeof(external_key) = 'object'),
  link_status  public.external_link_status NOT NULL DEFAULT 'proposed',
  confirmed_at timestamptz,
  confirmed_by uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_external_refs_key   UNIQUE (system, entity_type, external_key),
  CONSTRAINT uq_external_refs_local UNIQUE (system, entity_type, local_id),
  CONSTRAINT ck_external_refs_confirmed
    CHECK ((link_status = 'confirmed') = (confirmed_at IS NOT NULL))
);

COMMENT ON TABLE public.external_refs IS
  'Chave de origem de entidade espelhada (ADR-004). Enquanto link_status <> confirmed, nenhum campo espelhado entra na ficha.';
COMMENT ON COLUMN public.external_refs.link_status IS
  'A barreira que a RLS nao pega: vinculo errado por CPF digitado errado nao e acesso indevido, e nenhuma politica o detecta.';


-- ============================================================
-- patients — o que se acrescenta
-- ============================================================

ALTER TABLE public.patients
  -- Substituida pela external_refs acima (ADR-004). Nao ha dado a preservar:
  -- o banco so existe localmente. Fazer agora custa uma linha; depois custaria
  -- migration de chave em tabela com dado de saude.
  DROP COLUMN gemed_source_id,
  ADD COLUMN email                  extensions.citext,
  ADD COLUMN phone                  text,
  ADD COLUMN documents              jsonb CHECK (documents IS NULL OR jsonb_typeof(documents) = 'object'),
  -- jsonb, nao sete colunas: a forma vem de fora e e desconhecida (#15), e
  -- nada consulta endereco por parte. Coluna gerada resolve, se um dia doer.
  ADD COLUMN address                jsonb CHECK (address IS NULL OR jsonb_typeof(address) = 'object'),
  ADD COLUMN insurance_name         text,
  -- Proveniencia por GRUPO de campos (ADR-004 §3): por coluna seria ruido,
  -- global perderia a distincao que protege a contingencia manual.
  ADD COLUMN demographics_source    public.field_source NOT NULL DEFAULT 'local',
  ADD COLUMN demographics_synced_at timestamptz,
  ADD COLUMN clinical_source        public.field_source NOT NULL DEFAULT 'local',
  ADD COLUMN clinical_synced_at     timestamptz,
  ADD COLUMN plan_source            public.field_source NOT NULL DEFAULT 'local',
  ADD COLUMN plan_synced_at         timestamptz;

COMMENT ON COLUMN public.patients.demographics_source IS
  'O upsert do Gemed sobrescreve SO com valor nao-nulo, e so entao vira gemed. Protege a contingencia manual prevista em contrato.';


-- ============================================================
-- cid10 — tabela de dominio (ADR-002: recebe FK, logo nao e enum)
-- ============================================================

CREATE TABLE public.cid10 (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code       text NOT NULL UNIQUE CHECK (code ~ '^[A-Z][0-9]{2}(\.[0-9]{1,2})?$'),
  label      text NOT NULL CHECK (length(btrim(label)) > 0),
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Carga inicial pela premissa ja registrada nas fontes: comecar pelos CIDs mais
-- atendidos. Vive na migration, nao em seed — seed NAO roda em db push, e
-- cid10 vazia impede cadastrar diagnostico (FK RESTRICT).
INSERT INTO public.cid10 (code, label) VALUES
  ('C50',   'Neoplasia maligna da mama'),
  ('C18',   'Neoplasia maligna do colon'),
  ('C34',   'Neoplasia maligna dos bronquios e do pulmao'),
  ('C61',   'Neoplasia maligna da prostata'),
  ('C16',   'Neoplasia maligna do estomago'),
  ('C20',   'Neoplasia maligna do reto'),
  ('C25',   'Neoplasia maligna do pancreas'),
  ('C56',   'Neoplasia maligna do ovario'),
  ('C73',   'Neoplasia maligna da glandula tireoide'),
  ('C91',   'Leucemia linfoide');


-- ============================================================
-- patient_diagnoses
-- ============================================================
--
-- Tabela, nao colunas em patients: o CID muda ("atualizacao sempre que houver
-- mudanca no Gemed") e mudanca de CID repropaga elegibilidade de orientacoes.
-- Colunas guardariam so o estado atual; a tabela guarda a linha do tempo.

CREATE TABLE public.patient_diagnoses (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id   uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  cid10_id     uuid NOT NULL REFERENCES public.cid10 (id)    ON DELETE RESTRICT,
  -- text sem CHECK de formato DE PROPOSITO: nenhuma fonte especifica o
  -- vocabulario, e um CHECK errado rejeitaria sincronizacao legitima.
  staging      text,
  tnm          text,
  diagnosed_on date,
  is_primary   boolean NOT NULL DEFAULT false,
  source       public.field_source NOT NULL DEFAULT 'local',
  recorded_by  uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Indice parcial: a unicidade so vale para a linha marcada; as demais
-- permanecem como historico do paciente.
CREATE UNIQUE INDEX uq_patient_diagnoses_primary
  ON public.patient_diagnoses (patient_id) WHERE is_primary;


-- ============================================================
-- patient_clinical_history — alergias e reacoes previas (SEMPRE locais)
-- ============================================================
--
-- Nao constam da leitura do Gemed. O sync nunca toca esta tabela; e o que
-- fecha a questao #16 pelo lado local.

CREATE TABLE public.patient_clinical_history (
  id          uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id  uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  kind        public.clinical_history_kind NOT NULL,
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  recorded_by uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- Consentimento: um PAR, nunca um booleano
-- ============================================================
--
-- O admin edita termos e politica em Configuracoes da clinica. Se o aceite
-- fosse flag, editar o texto reescreveria retroativamente o historico de quem
-- aceitou o que. O aceite aponta para a VERSAO.

CREATE TABLE public.legal_document_versions (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  kind         public.legal_document_kind NOT NULL,
  -- bigint por prefer-bigint-over-int (regra ativa no .squawk.toml): a tabela
  -- tem poucas linhas, entao 8 bytes nao custam nada, e nao se abre excecao
  -- de lint por conveniencia.
  version      bigint NOT NULL CHECK (version > 0),
  body         text NOT NULL,
  published_at timestamptz,
  is_current   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_legal_document_versions UNIQUE (kind, version)
);

CREATE UNIQUE INDEX uq_legal_document_current
  ON public.legal_document_versions (kind) WHERE is_current;

CREATE TABLE public.consent_records (
  id                  uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id          uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  document_version_id uuid NOT NULL REFERENCES public.legal_document_versions (id) ON DELETE RESTRICT,
  accepted_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_consent_records UNIQUE (account_id, document_version_id)
);

-- Sem updated_at: a linha e FATO DATADO, nao estado editavel. Revogar preenche
-- revoked_at; nao reescreve o aceite. Por isso tambem nao leva trigger.
COMMENT ON TABLE public.consent_records IS
  'Aceite versionado (Anexo III). Revogacao e exclusiva do titular — o cuidador nunca revoga.';


-- ============================================================
-- data_subject_requests — a solicitacao, NAO a execucao
-- ============================================================
--
-- ADR-005: registra-se o pedido; a execucao depende da questao #20, que e
-- decisao da CEON como controladora. O status 'executed' existe no enum e NAO
-- tem rotina — mover para ele e, por ora, ato humano auditado.

CREATE TABLE public.data_subject_requests (
  id            uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id    uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  request_type  public.data_subject_request_type   NOT NULL,
  status        public.data_subject_request_status NOT NULL DEFAULT 'requested',
  decided_by    uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  decided_at    timestamptz,
  decision_note text,
  executed_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_dsr_decided
    CHECK ((status IN ('granted', 'executed', 'refused')) = (decided_at IS NOT NULL)),
  CONSTRAINT ck_dsr_executed
    CHECK ((status = 'executed') = (executed_at IS NOT NULL))
);


-- ============================================================
-- RPCs — o unico caminho de escrita
-- ============================================================

-- Escrita clinica: admin ou profissional ativo. Larga de proposito enquanto a
-- questao #25 ("o que conta como registrar na propria area") estiver aberta —
-- estreitar depois e aditivo; comecar estreito quebraria o cadastro.
CREATE FUNCTION public.upsert_patient_diagnosis(
  p_patient_id   uuid,
  p_cid10_id     uuid,
  p_staging      text DEFAULT NULL,
  p_tnm          text DEFAULT NULL,
  p_diagnosed_on date DEFAULT NULL,
  p_is_primary   boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_is_primary THEN
    UPDATE public.patient_diagnoses
       SET is_primary = false
     WHERE patient_id = p_patient_id
       AND is_primary;
  END IF;

  INSERT INTO public.patient_diagnoses
    (patient_id, cid10_id, staging, tnm, diagnosed_on, is_primary, source, recorded_by)
  VALUES
    (p_patient_id, p_cid10_id, p_staging, p_tnm, p_diagnosed_on, p_is_primary, 'local', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.add_patient_clinical_history(
  p_patient_id  uuid,
  p_kind        public.clinical_history_kind,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.patient_clinical_history (patient_id, kind, description, recorded_by)
  VALUES (p_patient_id, p_kind, p_description, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Aceite dos termos correntes. Idempotente: reaceitar a MESMA versao nao
-- duplica nem reescreve a data do aceite original.
CREATE FUNCTION public.accept_legal_terms()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.consent_records (account_id, document_version_id)
  SELECT auth.uid(), v.id
  FROM public.legal_document_versions v
  WHERE v.is_current
  ON CONFLICT ON CONSTRAINT uq_consent_records DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- EXCLUSIVO DO TITULAR (Anexo III, Perfil e privacidade). O cuidador e barrado
-- por construcao: account_id = auth.uid() nunca casa para outra conta.
CREATE FUNCTION public.revoke_consent(p_consent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.consent_records
     SET revoked_at = pg_catalog.now()
   WHERE id = p_consent_id
     AND account_id = auth.uid()
     AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'consent_not_revocable' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- Idem: exclusivo do titular.
CREATE FUNCTION public.request_data_subject_action(
  p_request_type public.data_subject_request_type
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.data_subject_requests (account_id, request_type)
  VALUES (auth.uid(), p_request_type)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Decisao da CONTROLADORA. Aceita apenas granted/refused: 'executed' exige a
-- carencia da ADR-005 e nao tem rotina enquanto a #20 estiver aberta.
CREATE FUNCTION public.decide_data_subject_request(
  p_request_id uuid,
  p_status     public.data_subject_request_status,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('granted', 'refused') THEN
    RAISE EXCEPTION 'unsupported_status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.data_subject_requests
     SET status        = p_status,
         decided_by    = auth.uid(),
         decided_at    = pg_catalog.now(),
         decision_note = p_note
   WHERE id = p_request_id
     AND status IN ('requested', 'under_review');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- A barreira de identidade da ADR-004. Confirmar exige evidencia independente,
-- verificada por quem chama (data de nascimento conferida, ou aceite do
-- titular no onboarding) — o banco garante que a transicao seja deliberada.
CREATE FUNCTION public.confirm_external_link(p_ref_id uuid, p_confirm boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.external_refs
     -- Cast explicito obrigatorio: CASE devolve text, e a coluna e enum. O
     -- literal solto em INSERT/comparacao infere pelo contexto; dentro de CASE,
     -- nao — compila e so falha em runtime.
     SET link_status  = (CASE WHEN p_confirm THEN 'confirmed' ELSE 'rejected' END)::public.external_link_status,
         confirmed_at = CASE WHEN p_confirm THEN pg_catalog.now() ELSE NULL END,
         confirmed_by = CASE WHEN p_confirm THEN auth.uid() ELSE NULL END
   WHERE id = p_ref_id
     AND link_status = 'proposed';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_proposed' USING ERRCODE = '42501';
  END IF;
END;
$$;


-- ============================================================
-- RLS
-- ============================================================
--
-- REGRA (ADR-003): um perfil, uma politica. Nenhuma politica de escrita —
-- todo INSERT/UPDATE vem dos RPCs acima. E (select ...) para o planner avaliar
-- uma vez por query, nao por linha.

ALTER TABLE public.external_refs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cid10                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_diagnoses        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_clinical_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_versions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_subject_requests    ENABLE ROW LEVEL SECURITY;

-- external_refs: RLS ligada e NENHUMA politica. A chave de origem nao e dado
-- de tela em nivel nenhum; so a Edge Function (service_role) a enxerga.

-- DIVIDA QUITADA AQUI: create_identity_core prometeu esta politica em
-- comentario e create_caregiver_links nao a criou. Sem ela o cuidador nao
-- enxerga nem o nome de quem acompanha. A assercao de teste que existia
-- ("cuidador ve 0 pacientes") passava por VACUIDADE.
CREATE POLICY patients_select_caregiver ON public.patients
  FOR SELECT TO authenticated
  USING ( id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

-- Catalogo: o app filtra a biblioteca de orientacoes pelo CID do paciente.
CREATE POLICY cid10_select_authenticated ON public.cid10
  FOR SELECT TO authenticated USING ( true );

CREATE POLICY patient_diagnoses_select_own ON public.patient_diagnoses
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

-- Forma medida: = ANY (ARRAY(SELECT unnest(f()))). A forma = ANY (f())
-- compila e avalia por linha — 111x mais lenta.
CREATE POLICY patient_diagnoses_select_caregiver ON public.patient_diagnoses
  FOR SELECT TO authenticated
  USING ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

CREATE POLICY patient_diagnoses_select_professional ON public.patient_diagnoses
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY patient_diagnoses_select_admin ON public.patient_diagnoses
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY patient_clinical_history_select_own ON public.patient_clinical_history
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

CREATE POLICY patient_clinical_history_select_caregiver ON public.patient_clinical_history
  FOR SELECT TO authenticated
  USING ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

CREATE POLICY patient_clinical_history_select_professional ON public.patient_clinical_history
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY patient_clinical_history_select_admin ON public.patient_clinical_history
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- Termos: qualquer autenticado le a versao corrente (precisa, para aceitar);
-- o historico completo e do administrador.
CREATE POLICY legal_document_versions_select_current ON public.legal_document_versions
  FOR SELECT TO authenticated
  USING ( is_current );

CREATE POLICY legal_document_versions_select_admin ON public.legal_document_versions
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- Consentimento e solicitacao LGPD: SO o titular e a administracao.
-- Nenhuma politica de cuidador, e nenhuma de profissional — o exercicio de
-- direito do titular nao e dado clinico da equipe.
CREATE POLICY consent_records_select_own ON public.consent_records
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY consent_records_select_admin ON public.consent_records
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY data_subject_requests_select_own ON public.data_subject_requests
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY data_subject_requests_select_admin ON public.data_subject_requests
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- Indices — o Postgres nao cria os de FK sozinho
-- ============================================================

CREATE INDEX idx_patient_diagnoses_patient_id     ON public.patient_diagnoses (patient_id);
CREATE INDEX idx_patient_diagnoses_cid10_id       ON public.patient_diagnoses (cid10_id);
CREATE INDEX idx_patient_clinical_history_patient ON public.patient_clinical_history (patient_id);
CREATE INDEX idx_consent_records_account_id       ON public.consent_records (account_id);
CREATE INDEX idx_dsr_account_id                   ON public.data_subject_requests (account_id);
CREATE INDEX idx_external_refs_local_id           ON public.external_refs (local_id);

-- A fila que o administrador ve: parcial, porque decidida e a maioria das
-- linhas com o tempo.
CREATE INDEX idx_dsr_open ON public.data_subject_requests (created_at)
  WHERE status IN ('requested', 'under_review');


-- ============================================================
-- Triggers de updated_at
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.external_refs
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.cid10
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patient_diagnoses
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patient_clinical_history
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.legal_document_versions
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.data_subject_requests
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Privilegios — SEMPRE no fim (REVOKE so atinge o que ja existe)
-- ============================================================
--
-- ADR-005 §4: a proibicao de apagar e PRIVILEGIO, nao convencao. A RLS nao
-- distingue coluna nem verbo para service_role, que a ignora; o privilegio sim.

REVOKE DELETE ON
  public.patients,
  public.patient_diagnoses,
  public.patient_clinical_history,
  public.consent_records,
  public.data_subject_requests,
  public.external_refs,
  public.legal_document_versions,
  public.cid10
FROM authenticated, service_role;

-- Escrita clinica so por RPC: negar tambem no privilegio, para que um PATCH
-- direto do front falhe por permissao e nao dependa de "nao ter politica".
REVOKE INSERT, UPDATE ON
  public.patient_diagnoses,
  public.patient_clinical_history,
  public.consent_records,
  public.data_subject_requests,
  public.external_refs,
  public.legal_document_versions,
  public.cid10
FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.upsert_patient_diagnosis(uuid, uuid, text, text, date, boolean)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_patient_clinical_history(uuid, public.clinical_history_kind, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_legal_terms()                                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_consent(uuid)                                              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.request_data_subject_action(public.data_subject_request_type)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.decide_data_subject_request(uuid, public.data_subject_request_status, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_external_link(uuid, boolean)                              FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_patient_diagnosis(uuid, uuid, text, text, date, boolean)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_patient_clinical_history(uuid, public.clinical_history_kind, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_legal_terms()                                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_consent(uuid)                                               TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_data_subject_action(public.data_subject_request_type)      TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_data_subject_request(uuid, public.data_subject_request_status, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_external_link(uuid, boolean)                               TO authenticated;
