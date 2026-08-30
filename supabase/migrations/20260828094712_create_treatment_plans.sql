-- Agregado Tratamento — o protocolo ativo e a fase do tratamento.
-- Design e racional: supera-docs/Modelo de Dados/Tratamento.md
-- Decisao sob teste:  ADR-006 (granularidade do agregado Tratamento)
--
-- O rascunho tinha cinco tabelas. O pre-mortem cortou tres, todas da mesma
-- familia — TABELA SEM ESCREVENTE IDENTIFICADO:
--   treatment_cycles   -> ciclo e ordinal; o Gemed da o NUMERO de ciclos, e o
--                         registro de dispensacao e do nivel COMPLETO
--   treatment_journeys -> nenhuma tela cria/encerra jornada; seria coluna
--                         disfarcada e um join a mais na timeline
--   infusion_sessions  -> a #6 nao tem dono; a barra de progresso exige dado
--                         de registro de enfermagem (COMPLETO)
--
-- Onde uma questao segue aberta, a forma escolhida ACOMODA OS DOIS DESFECHOS,
-- e o COMMENT ON diz qual pergunta a fecha.


-- ============================================================
-- treatment_phases — vocabulario da fase (tabela, nao enum)
-- ============================================================
--
-- Tabela e nao enum porque o rotulo AINDA SE MEXE: a carteira escreve
-- "Tratamento ativo", a ficha escreve "ativo" (esbocos de 28/08/2026), e a #1
-- nao fechou a lista. Rotulo instavel + ALTER TYPE em tabela com dado de saude
-- e a combinacao que a ADR-002 manda evitar.

CREATE TABLE public.treatment_phases (
  id    uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- MITIGACAO DA #1: as fontes dao DUAS listas que podem ou nao ser o mesmo
  -- eixo — carteira (ativo/remissao/seguimento/finalizacao) e marcos do NPS
  -- (inicio/meio/conclusao). Um discriminador custa uma coluna hoje; descobrir
  -- depois que sao dois eixos custaria tabela nova + migration de dados.
  axis  text NOT NULL DEFAULT 'clinical' CHECK (axis ~ '^[a-z_]+$'),
  code  text NOT NULL CHECK (code ~ '^[a-z_]+$'),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  sort_order smallint NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_treatment_phases_code UNIQUE (axis, code)
);

COMMENT ON TABLE public.treatment_phases IS
  'Vocabulario da fase do tratamento. Tabela e nao enum: a #1 nao fechou a lista e o rotulo diverge entre telas (ADR-006 §3).';
COMMENT ON COLUMN public.treatment_phases.axis IS
  'Discriminador de eixo. Fecha com a #1: as fases da carteira e os marcos do NPS sao o MESMO eixo? Se sim, esta coluna fica com um valor so e nao custa nada; se nao, os marcos entram como axis=''nps'' sem migration estrutural.';
COMMENT ON COLUMN public.treatment_phases.is_active IS
  'Vocabulario se aposenta, nao se apaga: a FK e RESTRICT e a fase pode ja estar em uso.';

-- Na migration e nao em seed: seed NAO roda em db push, e patients.treatment_phase_id
-- referencia esta tabela por FK RESTRICT — vazia, nenhum paciente se classifica.
-- Os quatro valores sao os da carteira do profissional. Os esbocos confirmaram
-- dois em uso ("Tratamento ativo", "Seguimento"); os outros dois vem do Anexo.
INSERT INTO public.treatment_phases (axis, code, label, sort_order) VALUES
  ('clinical', 'ativo',       'Tratamento ativo', 1),
  ('clinical', 'remissao',    'Em remissao',      2),
  ('clinical', 'seguimento',  'Seguimento',       3),
  ('clinical', 'finalizacao', 'Em finalizacao',   4);


-- ============================================================
-- treatment_plans — o protocolo
-- ============================================================
--
-- Tabela e nao colunas em patients por causa dos relatorios: o cruzamento
-- "protocolo x efeito adverso x grau" pode precisar do protocolo VIGENTE A
-- EPOCA do evento, nao do atual (#29). Se a resposta for "o atual", colapsar
-- em colunas e migration barata — a tabela tera uma linha por paciente.

CREATE TABLE public.treatment_plans (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- text livre DE PROPOSITO: o vocabulario de protocolos (FOLFOX, CAPOX, ABVD,
  -- TCH…) vem do Gemed e nao esta enumerado em fonte nenhuma. Tabela de dominio
  -- aqui rejeitaria sincronizacao legitima — mesma razao de staging/tnm.
  protocol_name  text NOT NULL CHECK (length(btrim(protocol_name)) > 0),
  cycles_planned smallint CHECK (cycles_planned > 0),
  intent         text,
  started_on     date,
  ended_on       date,
  -- Ciclo corrente: ordinal + inicio. E o que produz o "FOLFOX ciclo 3, D+7"
  -- da tela do alerta SEM inventar linha de ciclo (ADR-006 §1). Nulos enquanto
  -- o Gemed estiver desligado; a tela degrada para o nome do protocolo.
  current_cycle_number     smallint CHECK (current_cycle_number > 0),
  current_cycle_started_on date,
  -- Proveniencia do grupo `plan` (ADR-004 §3), MIGRADA de patients: duas copias
  -- da mesma verdade nao sao pegas por teste, porque cada uma e internamente
  -- consistente. O upsert do Gemed sobrescreve so com valor nao-nulo.
  source      public.field_source NOT NULL DEFAULT 'local',
  synced_at   timestamptz,
  recorded_by uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_treatment_plans_period
    CHECK (ended_on IS NULL OR started_on IS NULL OR ended_on >= started_on),
  CONSTRAINT ck_treatment_plans_cycle_window
    CHECK (current_cycle_started_on IS NULL OR started_on IS NULL
           OR current_cycle_started_on >= started_on)
);

COMMENT ON TABLE public.treatment_plans IS
  'Plano terapeutico espelhado do Gemed (ADR-004) ou cadastrado no painel administrativo. Uma linha vigente por paciente; as encerradas sao historico.';
COMMENT ON COLUMN public.treatment_plans.protocol_name IS
  'Texto livre ate existir catalogo. Se o anexo tecnico do Gemed (#15) trouxer codigo de protocolo, entra protocol_id nullable ao lado — aditivo.';
COMMENT ON COLUMN public.treatment_plans.current_cycle_number IS
  'Ordinal, nao FK: ciclo nao e entidade no MEDIO (ADR-006 §1). Sem CHECK contra cycles_planned de proposito — os dois valores vem do Gemed e podem chegar em ordens diferentes num mesmo sync.';
COMMENT ON COLUMN public.treatment_plans.ended_on IS
  'NULL = vigente. O indice unico parcial abaixo e que garante "um plano ativo"; boolean is_active permitiria dois.';

-- No maximo um plano vigente por paciente. Indice parcial, mesmo padrao de
-- uq_patient_diagnoses_primary.
CREATE UNIQUE INDEX uq_treatment_plans_active
  ON public.treatment_plans (patient_id) WHERE ended_on IS NULL;


-- ============================================================
-- patients — o que muda
-- ============================================================

ALTER TABLE public.patients
  -- Fase e ATRIBUTO do paciente, nao tabela treatment_journeys (ADR-006 §2).
  -- Nullable: paciente entra no sistema antes de ser classificado.
  ADD COLUMN treatment_phase_id uuid,
  -- Migram para treatment_plans (ADR-006 §5). Banco so existe localmente: nao
  -- ha dado a preservar, e manter as duas casas e o pior desfecho possivel.
  DROP COLUMN plan_source,
  DROP COLUMN plan_synced_at;

-- FK em DUAS ETAPAS, mesmo com a tabela vazia. Criar a constraint junto da
-- coluna exige SHARE ROW EXCLUSIVE nas duas tabelas e varredura completa;
-- NOT VALID pega so um ACCESS EXCLUSIVE breve, e o VALIDATE roda sob SHARE
-- UPDATE EXCLUSIVE, sem bloquear escrita. Hoje custa o mesmo (zero linhas) —
-- e patients e exatamente a tabela que NAO estara vazia quando isto se repetir.
ALTER TABLE public.patients
  ADD CONSTRAINT fk_patients_treatment_phase
  FOREIGN KEY (treatment_phase_id)
  REFERENCES public.treatment_phases (id) ON DELETE RESTRICT
  NOT VALID;

-- O VALIDATE vive na migration SEGUINTE de proposito: o Supabase aplica cada
-- migration numa transacao, e NOT VALID + VALIDATE na MESMA transacao bloqueia
-- leitura durante a validacao — anularia o beneficio de ter separado.

COMMENT ON COLUMN public.patients.treatment_phase_id IS
  'Fase do tratamento — coluna "Fase" da carteira e campo da ficha. A FK nao restringe o eixo: enquanto a #1 nao responder, so existe axis=''clinical'' e a RPC set_treatment_phase e quem filtra.';


-- ============================================================
-- patient_clinical_history — o que muda
-- ============================================================

ALTER TABLE public.patient_clinical_history
  -- "Nausea grau 2 — ciclo 1", "Neuropatia leve em MMII — ciclo 3": o ciclo e
  -- ordinal DO REGISTRO. Nullable porque alergia nao tem ciclo.
  ADD COLUMN cycle_number smallint CHECK (cycle_number > 0);

COMMENT ON COLUMN public.patient_clinical_history.cycle_number IS
  'Ordinal do ciclo em que a reacao ocorreu, como a ficha exibe. Vira FK se o anexo #15 revelar ciclos com identidade propria no Gemed.';


-- ============================================================
-- Escrita — RPC, como nos agregados anteriores
-- ============================================================
--
-- Plano e fase nao sao registro de especialidade: nao carregam
-- origin_specialty_id nem visibility, e a regra de escrita por especialidade
-- da #9 nao incide. Admin ou profissional ativo escreve — a #25 pode estreitar
-- depois, e estreitar e aditivo.

-- Encerra o plano vigente e abre o novo, na mesma transacao: e o que impede
-- dois planos ativos por corrida entre o sync e o cadastro manual.
CREATE FUNCTION public.set_treatment_plan(
  p_patient_id     uuid,
  p_protocol_name  text,
  p_cycles_planned smallint DEFAULT NULL,
  p_intent         text     DEFAULT NULL,
  p_started_on     date     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_start date := COALESCE(p_started_on, (pg_catalog.now())::date);
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.treatment_plans
     SET ended_on = GREATEST(v_start, COALESCE(started_on, v_start))
   WHERE patient_id = p_patient_id
     AND ended_on IS NULL;

  INSERT INTO public.treatment_plans
    (patient_id, protocol_name, cycles_planned, intent, started_on, source, recorded_by)
  VALUES
    (p_patient_id, p_protocol_name, p_cycles_planned, p_intent, v_start, 'local', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.set_treatment_plan(uuid, text, smallint, text, date) IS
  'Troca de protocolo: encerra o vigente e abre o novo atomicamente. O caminho do Gemed e outro — Edge Function com service_role.';

-- Classifica o paciente na fase. Recebe CODE, nao uuid: o front nao precisa
-- conhecer a PK do vocabulario, e o filtro por axis mora aqui.
CREATE FUNCTION public.set_treatment_phase(
  p_patient_id uuid,
  p_phase_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phase_id uuid;
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_phase_id
  FROM public.treatment_phases
  WHERE code = p_phase_code
    AND axis = 'clinical'
    AND is_active;

  IF v_phase_id IS NULL THEN
    RAISE EXCEPTION 'unknown_treatment_phase' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patients SET treatment_phase_id = v_phase_id WHERE id = p_patient_id;
END;
$$;

COMMENT ON FUNCTION public.set_treatment_phase(uuid, text) IS
  'O AND axis = ''clinical'' e o guarda-corpo da mitigacao da #1: enquanto houver um eixo so, nada muda; havendo dois, um marco de NPS nunca entra como fase clinica por engano.';


-- ============================================================
-- RLS — nenhum helper novo (quarto agregado seguido)
-- ============================================================

ALTER TABLE public.treatment_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_plans  ENABLE ROW LEVEL SECURITY;

-- Catalogo, como cid10: o chip de filtro "Fase" da carteira precisa dos rotulos.
CREATE POLICY treatment_phases_select_authenticated ON public.treatment_phases
  FOR SELECT TO authenticated USING ( true );

CREATE POLICY treatment_plans_select_own ON public.treatment_plans
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

-- Forma medida: = ANY (ARRAY(SELECT unnest(f()))). A forma = ANY (f()) e 111x
-- mais lenta (Verificacoes empiricas da ADR-003).
CREATE POLICY treatment_plans_select_caregiver ON public.treatment_plans
  FOR SELECT TO authenticated
  USING ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

CREATE POLICY treatment_plans_select_professional ON public.treatment_plans
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY treatment_plans_select_admin ON public.treatment_plans
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- Indices — o Postgres nao cria os de FK sozinho
-- ============================================================

CREATE INDEX idx_treatment_plans_patient_id ON public.treatment_plans (patient_id);
CREATE INDEX idx_patients_treatment_phase   ON public.patients (treatment_phase_id);

-- Chip de filtro da carteira ("FOLFOX", "CAPOX"): varredura por protocolo
-- vigente. Parcial porque planos encerrados nao aparecem no filtro.
CREATE INDEX idx_treatment_plans_protocol_active
  ON public.treatment_plans (protocol_name) WHERE ended_on IS NULL;


-- ============================================================
-- Triggers de updated_at
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.treatment_phases
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.treatment_plans
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Privilegios — SEMPRE no fim (REVOKE so atinge o que ja existe)
-- ============================================================

REVOKE DELETE ON public.treatment_plans, public.treatment_phases
  FROM authenticated, service_role;

-- Escrita so por RPC ou service_role: negar tambem no privilegio, para que um
-- PATCH direto do front falhe por permissao, e nao por ausencia de politica.
REVOKE INSERT, UPDATE ON public.treatment_plans, public.treatment_phases
  FROM authenticated;

REVOKE EXECUTE ON FUNCTION public.set_treatment_plan(uuid, text, smallint, text, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_treatment_phase(uuid, text)                      FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_treatment_plan(uuid, text, smallint, text, date)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_treatment_phase(uuid, text)                       TO authenticated;
