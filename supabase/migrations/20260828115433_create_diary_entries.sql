-- Agregado Diario e alertas — FATIA 1: o registro do paciente.
-- Design e racional: supera-docs/Modelo de Dados/Diario e alertas.md
-- Decisao sob teste:  ADR-007 (granularidade e gatilho do agregado)
--
-- O rascunho tinha oito tabelas. Esta migration traz TRES; o alerta, a regra
-- de criticidade e o outbox vem na fatia 2, porque nada aqui depende das
-- questoes #7 (estados do alerta), #25 (escrita na propria area) e #28 (badge
-- IA / risco de escopo COMPLETO) — e tudo la depende.
--
-- Cortada pelo pre-mortem: diary_summaries. O Resumo do Diario e DERIVACAO
-- da janela, nao registro: nenhuma tela o le, a janela (diaria ou semanal)
-- nao esta decidida, e com o Gemed desligado (#15) nasceria vazia por meses.
--
-- EXCECAO DECLARADA ao contrato transversal da ADR-003: estas tabelas NAO tem
-- origin_specialty_id nem visibility. Quem escreve e o paciente (ou o cuidador),
-- nao uma especialidade, e o conteudo e o insumo da visao multidisciplinar.
-- Ver ADR-007 §4 — a omissao e decisao, nao esquecimento.


-- ============================================================
-- Enums — vocabulario fechado pela fonte textual
-- ============================================================

-- "Rascunho salvo automaticamente" e estado explicito, nao ausencia de dado:
-- rascunho NAO dispara alerta e NAO entra em estatistica (requisito literal).
CREATE TYPE public.diary_entry_status AS ENUM ('draft', 'saved');

-- Titularidade x autoria. O cuidador pode "ver e AJUDAR A REGISTRAR", e a #22
-- (respondida pela CEON em 28/08/2026) exige que a origem apareca na TELA do
-- profissional — nao basta estar no log. Na fatia 2 este valor e copiado para
-- o alerta e entra no payload do Gemed.
CREATE TYPE public.diary_actor_kind AS ENUM ('patient', 'caregiver');


-- ============================================================
-- symptoms — os 12, catalogo e nao enum
-- ============================================================
--
-- Tabela porque o sintoma e REFERENCIAVEL em tres lugares (Dominio/Sintoma):
-- gatilho configuravel (sintoma, grau), seletor de metrica do grafico e eixo
-- de cruzamento "protocolo x efeito adverso x grau" dos relatorios.
-- Na migration e nao em seed, mesma razao das sete especialidades: seed NAO
-- roda em db push, e diary_symptom_reports referencia por FK RESTRICT.

CREATE TABLE public.symptoms (
  id    uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code  text NOT NULL CHECK (code ~ '^[a-z_]+$'),
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  sort_order smallint NOT NULL,
  -- Marca descritiva, NAO regra de sigilo — ver COMMENT abaixo.
  is_psychological boolean NOT NULL DEFAULT false,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_symptoms_code UNIQUE (code)
);

COMMENT ON TABLE public.symptoms IS
  'Os 12 sintomas marcaveis do diario. Tabela e nao enum: e gatilho configuravel, seletor de metrica e eixo de relatorio (ADR-002, Dominio/Sintoma).';
COMMENT ON COLUMN public.symptoms.is_psychological IS
  'DESCRITIVO, nunca predicado de RLS. Ansiedade e tristeza estao na lista ABERTA ao paciente e visivel a equipe inteira — nao sao conteudo do espaco de psicologia (ADR-007 §4). O que e sigiloso sao as escalas validadas (PHQ-9, GAD-7, ESAS) e as sessoes, que sao outra tabela e outro agregado.';
COMMENT ON COLUMN public.symptoms.is_active IS
  'Vocabulario se aposenta, nao se apaga: a FK e RESTRICT e o historico precisa continuar interpretavel.';

INSERT INTO public.symptoms (code, label, sort_order, is_psychological) VALUES
  ('nausea',        'Nausea',                 1, false),
  ('vomiting',      'Vomito',                 2, false),
  ('pain',          'Dor',                    3, false),
  ('fatigue',       'Fadiga',                 4, false),
  ('diarrhea',      'Diarreia',               5, false),
  ('constipation',  'Constipacao',            6, false),
  ('fever',         'Febre',                  7, false),
  ('appetite_loss', 'Falta de apetite',       8, false),
  ('mouth_changes', 'Alteracoes na boca',     9, false),
  ('skin_changes',  'Alteracoes na pele',    10, false),
  ('anxiety',       'Ansiedade',             11, true),
  ('sadness',       'Tristeza',              12, true);


-- ============================================================
-- diary_entries — o registro
-- ============================================================

CREATE TABLE public.diary_entries (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- Data do registro, nao do insert: o app pode sincronizar offline mais tarde.
  -- Default no fuso da clinica — 'now()::date' em UTC viraria o dia seguinte
  -- as 21h em Chapeco, e o "diario de ontem" apareceria como o de hoje.
  entry_date date NOT NULL
    DEFAULT ((pg_catalog.now() AT TIME ZONE 'America/Sao_Paulo')::date),
  -- "Como me senti hoje?" — opcional: registro so com sintomas marcados e valido.
  free_text  text CHECK (free_text IS NULL OR length(btrim(free_text)) > 0),
  status     public.diary_entry_status NOT NULL DEFAULT 'draft',
  -- QUEM ESCREVEU, separado de a quem o dado pertence (patient_id).
  authored_by uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  acting_as   public.diary_actor_kind NOT NULL,
  submitted_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Estado e timestamp nao podem divergir: 'saved' <=> submitted_at preenchido.
  -- E o que a fatia 2 vai usar como gatilho; um dos dois mentindo produz
  -- alerta fantasma ou alerta que nunca nasce.
  CONSTRAINT ck_diary_entries_submitted
    CHECK ((status = 'saved') = (submitted_at IS NOT NULL))
);

COMMENT ON TABLE public.diary_entries IS
  'Registro do diario de sintomas. SEM origin_specialty_id/visibility: excecao declarada ao contrato da ADR-003 — quem escreve e o paciente, e o conteudo e do time inteiro (ADR-007 §4).';
COMMENT ON COLUMN public.diary_entries.entry_date IS
  'Sem UNIQUE (patient_id, entry_date) DE PROPOSITO: fonte nenhuma limita a um registro por dia, e o limite impediria registrar uma piora no fim do dia (ADR-007 §6).';
COMMENT ON COLUMN public.diary_entries.status IS
  'Rascunho NAO dispara alerta e NAO entra em estatistica. A transicao draft->saved e o gatilho da fatia 2 — nao o INSERT do sintoma.';
COMMENT ON COLUMN public.diary_entries.acting_as IS
  'Origem do registro (#22): paciente ou acompanhante. Copiado para o alerta e exibido na fila do profissional — e campo de tela, nao so de log.';
COMMENT ON COLUMN public.diary_entries.authored_by IS
  'Conta que efetivamente criou. Congelado por trigger: quem escreveu nao se reescreve.';


-- ============================================================
-- diary_symptom_reports — a graduacao 0..5 por sintoma marcado
-- ============================================================

CREATE TABLE public.diary_symptom_reports (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- RESTRICT e nao CASCADE: DELETE de registro salvo e proibido no projeto
  -- (ADR-005). O que se apaga aqui e linha de RASCUNHO, uma a uma.
  diary_entry_id uuid NOT NULL REFERENCES public.diary_entries (id) ON DELETE RESTRICT,
  symptom_id     uuid NOT NULL REFERENCES public.symptoms (id)      ON DELETE RESTRICT,
  -- CHECK e nao enum: dominio numerico local e fechado (ADR-002).
  -- Seis carinhas, 0 a 5.
  grade      smallint NOT NULL CHECK (grade BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Um sintoma marcado uma vez por registro; ajustar a carinha e UPDATE.
  CONSTRAINT uq_diary_symptom_reports UNIQUE (diary_entry_id, symptom_id)
);

COMMENT ON TABLE public.diary_symptom_reports IS
  'Um sintoma marcado com sua graduacao 0-5. A visibilidade DERIVA do registro pai — ver as politicas abaixo.';
COMMENT ON COLUMN public.diary_symptom_reports.grade IS
  'Escala de intensidade 0..5. O corte que torna o grau critico e configuravel pelo administrador e NAO mora aqui (ADR-007 §1).';


-- ============================================================
-- Imutabilidade — a regra vale tambem para service_role
-- ============================================================
--
-- RLS nao protege contra service_role, e o calculo de criticidade e a
-- sincronizacao rodam com ele (CLAUDE.md). Logo, a maquina de estados vive em
-- TRIGGER, nao so em politica.

CREATE FUNCTION private.enforce_diary_entry_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Registro salvo e imutavel. Nenhuma fonte descreve edicao de registro
  -- finalizado; correcao se faz com registro novo. Sem isto, um grau 5
  -- corrigido para 2 deixaria para tras um alerta ja disparado, sem origem.
  IF OLD.status = 'saved' THEN
    RAISE EXCEPTION 'registro do diario ja finalizado e imutavel (id=%)', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Titularidade e autoria sao congeladas: RLS nao compara OLD com NEW, entao
  -- sem isto um UPDATE poderia mudar patient_id para outro paciente.
  IF NEW.patient_id  IS DISTINCT FROM OLD.patient_id
  OR NEW.authored_by IS DISTINCT FROM OLD.authored_by
  OR NEW.acting_as   IS DISTINCT FROM OLD.acting_as THEN
    RAISE EXCEPTION 'patient_id, authored_by e acting_as sao imutaveis'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_transition
BEFORE UPDATE ON public.diary_entries
FOR EACH ROW EXECUTE FUNCTION private.enforce_diary_entry_transition();

-- Filho de registro salvo tambem nao se mexe. A politica ja nega ao usuario
-- autenticado; o trigger nega tambem ao service_role.
CREATE FUNCTION private.enforce_diary_report_parent_draft()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  -- Nao usar coalesce(NEW, OLD): em BEFORE DELETE, NEW nao existe como record.
  v_entry_id uuid := CASE WHEN TG_OP = 'DELETE'
                          THEN OLD.diary_entry_id ELSE NEW.diary_entry_id END;
  v_status   public.diary_entry_status;
BEGIN
  -- SECURITY INVOKER de proposito: se quem chama nao enxerga o pai, a leitura
  -- volta NULL e a escrita e negada — fail-closed, sem furar RLS.
  SELECT e.status INTO v_status
  FROM public.diary_entries e WHERE e.id = v_entry_id;

  IF v_status IS DISTINCT FROM 'draft'::public.diary_entry_status THEN
    RAISE EXCEPTION 'sintomas so podem ser alterados enquanto o registro e rascunho'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_parent_draft
BEFORE INSERT OR UPDATE OR DELETE ON public.diary_symptom_reports
FOR EACH ROW EXECUTE FUNCTION private.enforce_diary_report_parent_draft();


-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.symptoms              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_entries         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diary_symptom_reports ENABLE ROW LEVEL SECURITY;

-- Catalogo, como cid10 e treatment_phases: a tela do paciente precisa dos 12.
CREATE POLICY symptoms_select_authenticated ON public.symptoms
  FOR SELECT TO authenticated USING ( true );

-- --- diary_entries: leitura -------------------------------------------------

CREATE POLICY diary_entries_select_own ON public.diary_entries
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

-- Forma medida: = ANY (ARRAY(SELECT unnest(f()))) — a forma = ANY (f()) e 111x
-- mais lenta (Pesquisas/Verificacoes empiricas da ADR-003).
CREATE POLICY diary_entries_select_caregiver ON public.diary_entries
  FOR SELECT TO authenticated
  USING ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

-- Profissional e administrador NAO veem rascunho: "nao entra em estatistica"
-- comeca por nao ser legivel pela equipe.
CREATE POLICY diary_entries_select_professional ON public.diary_entries
  FOR SELECT TO authenticated
  USING ( status = 'saved' AND (SELECT private.is_active_professional()) );

-- #11: administracao ve conteudo clinico. Sem recorte por especialidade aqui —
-- o diario nao tem origem de especialidade (ADR-007 §4), e por isso a excecao
-- da psicologia (#23) nao se aplica a esta tabela.
CREATE POLICY diary_entries_select_admin ON public.diary_entries
  FOR SELECT TO authenticated
  USING ( status = 'saved' AND (SELECT private.is_active_admin()) );

-- --- diary_entries: escrita -------------------------------------------------
--
-- PRIMEIRA TABELA DO PROJETO COM ESCRITA DIRETA DO USUARIO. Ate aqui toda
-- escrita era RPC. Aqui e o proprio paciente que escreve, e a checagem cabe
-- inteira no WITH CHECK — nao ha regra de negocio a esconder atras de DEFINER.

CREATE POLICY diary_entries_insert_own ON public.diary_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id  = (SELECT private.my_own_patient_id())
    AND authored_by = (SELECT public.get_my_uid())
    AND acting_as   = 'patient'
  );

CREATE POLICY diary_entries_insert_caregiver ON public.diary_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
    AND authored_by = (SELECT public.get_my_uid())
    AND acting_as   = 'caregiver'
  );

-- USING recorta o que se pode tocar; WITH CHECK, o resultado. O trigger e que
-- garante draft->saved sem volta — RLS nao compara OLD com NEW.
CREATE POLICY diary_entries_update_own ON public.diary_entries
  FOR UPDATE TO authenticated
  USING      ( patient_id = (SELECT private.my_own_patient_id()) AND status = 'draft' )
  WITH CHECK ( patient_id = (SELECT private.my_own_patient_id()) );

CREATE POLICY diary_entries_update_caregiver ON public.diary_entries
  FOR UPDATE TO authenticated
  USING      ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
               AND status = 'draft' )
  WITH CHECK ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

-- --- diary_symptom_reports: visibilidade DERIVADA do pai --------------------
--
-- Uma politica no lugar de quatro. O EXISTS le diary_entries SOB A RLS DELE:
-- "vejo o filho se vejo o pai", sem repetir os quatro predicados de perfil —
-- e sem o OR de quatro politicas que a pesquisa mostrou derrotar o indice.
-- Se a regra do pai mudar, o filho acompanha sozinho.

CREATE POLICY diary_symptom_reports_select_via_entry ON public.diary_symptom_reports
  FOR SELECT TO authenticated
  USING ( EXISTS (SELECT 1 FROM public.diary_entries e WHERE e.id = diary_entry_id) );

-- Escrita: so em rascunho que EU enxergo. O status no predicado tambem fecha
-- uma porta lateral — o profissional enxerga o pai salvo, e sem 'draft' aqui
-- poderia inserir sintoma no registro do paciente.
CREATE POLICY diary_symptom_reports_insert_via_entry ON public.diary_symptom_reports
  FOR INSERT TO authenticated
  WITH CHECK ( EXISTS (SELECT 1 FROM public.diary_entries e
                       WHERE e.id = diary_entry_id AND e.status = 'draft') );

CREATE POLICY diary_symptom_reports_update_via_entry ON public.diary_symptom_reports
  FOR UPDATE TO authenticated
  USING      ( EXISTS (SELECT 1 FROM public.diary_entries e
                       WHERE e.id = diary_entry_id AND e.status = 'draft') )
  WITH CHECK ( EXISTS (SELECT 1 FROM public.diary_entries e
                       WHERE e.id = diary_entry_id AND e.status = 'draft') );

-- UNICO DELETE permitido a authenticated no projeto inteiro, e a excecao e
-- deliberada: desmarcar um sintoma em RASCUNHO e digitacao, nao eliminacao de
-- dado clinico. A ADR-005 proibe DELETE de registro salvo — e o predicado
-- 'draft' e exatamente essa fronteira.
CREATE POLICY diary_symptom_reports_delete_draft ON public.diary_symptom_reports
  FOR DELETE TO authenticated
  USING ( EXISTS (SELECT 1 FROM public.diary_entries e
                  WHERE e.id = diary_entry_id AND e.status = 'draft') );


-- ============================================================
-- Indices — o Postgres nao cria os de FK sozinho
-- ============================================================

-- Historico de 30 dias e grafico de evolucao: sempre por paciente, do mais
-- recente para tras. Os front-ends DEVEM filtrar patient_id (contrato ja
-- registrado em Verificacoes empiricas da ADR-003).
CREATE INDEX idx_diary_entries_patient_date
  ON public.diary_entries (patient_id, entry_date DESC);

-- Timeline do painel clinico: so registro finalizado aparece.
CREATE INDEX idx_diary_entries_saved
  ON public.diary_entries (patient_id, submitted_at DESC) WHERE status = 'saved';

CREATE INDEX idx_diary_entries_authored_by ON public.diary_entries (authored_by);

CREATE INDEX idx_diary_symptom_reports_entry   ON public.diary_symptom_reports (diary_entry_id);
-- Seletor de metrica do grafico e cruzamento "efeito adverso x grau".
CREATE INDEX idx_diary_symptom_reports_symptom ON public.diary_symptom_reports (symptom_id, grade);


-- ============================================================
-- Triggers de updated_at
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.symptoms
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.diary_symptom_reports
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Privilegios — SEMPRE no fim (REVOKE so atinge o que ja existe)
-- ============================================================

-- Catalogo: so leitura para quem nao e service_role.
REVOKE INSERT, UPDATE, DELETE ON public.symptoms FROM authenticated;

-- Registro salvo nao se apaga (ADR-005). O DELETE de rascunho vive so no filho.
REVOKE DELETE ON public.diary_entries FROM authenticated, service_role;

REVOKE EXECUTE ON FUNCTION private.enforce_diary_entry_transition()    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.enforce_diary_report_parent_draft() FROM PUBLIC;
