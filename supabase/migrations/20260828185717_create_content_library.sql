-- Agregado Conteudo e engajamento — FATIA 1: a biblioteca editorial e o que o
-- paciente marca nela.
-- Design e racional: supera-docs/Modelo de Dados/Conteudo e engajamento.md
-- Decisao sob teste:  ADR-010 (granularidade e corte do agregado).
--
-- O rascunho do pre-mortem tinha TREZE objetos num agregado so. Esta migration
-- traz SEIS tabelas. Cortados, e o motivo:
--
--   * content_directed_sends — "o profissional X enviou o conteudo Y ao
--     paciente Z" e ATO CLINICO, nao conteudo editorial: a linha revela
--     acompanhamento por especialidade SEM ter coluna de conteudo. E
--     exatamente o vazamento por metadado que private.specialty_flags existe
--     para evitar. Depende da #25 (o que conta como "registrar na propria
--     area") tanto quanto o alerta.
--   * adherence_status — "acompanhamento de adesao" do fisioterapeuta e
--     monitoramento estruturado por especialidade: nivel COMPLETO, mesma
--     familia da #31 (escalas PHQ-9/GAD-7/ESAS).
--   * published_version_id em content_items — o ponteiro denormalizado foi
--     substituido por INDICE UNICO PARCIAL sobre content_versions.status, a
--     mesma forma que treatment_plans usa para "uma linha vigente". Some a FK
--     circular e some a segunda fonte de verdade sobre o que esta publicado.
--
-- Adiados para a FATIA 2 (dependem de questao nova a CEON sobre anonimato do
-- NPS): notifications, notification_deliveries, notification_preferences,
-- nps_surveys, nps_responses.
--
-- PRIMEIRA TABELA DO PROJETO SEM PACIENTE E SEM ESPECIALIDADE DE ORIGEM.
-- A orientacao e conteudo editorial: nao carrega origin_specialty_id +
-- visibility (ADR-003 §3), nao paga o pedagio read_* (ADR-008) e nao entra em
-- clinical_reader. A excecao vale para o conteudo — NAO vale para
-- patient_content_states, que e dado de comportamento do paciente e por isso
-- nasce sem politica nenhuma para profissional ou administrador (secao 8).


-- ============================================================
-- 1. Vocabulario
-- ============================================================

-- Os seis estados do workflow. Quatro sao TEXTUAIS nas fontes (aguardando
-- aprovacao, aprovado/publicado, devolvido para ajustes, rejeitado; publicado
-- -> despublicado); 'draft' e 'archived' sao a leitura natural das pontas.
-- A nomenclatura oficial e a questao #21 — trocar rotulo de enum e migration
-- de uma linha (ALTER TYPE ... RENAME VALUE), nao mudanca de forma.
CREATE TYPE public.content_status AS ENUM (
  'draft',        -- o profissional produz
  'in_review',    -- submetido, aguardando aprovacao do administrador
  'returned',     -- devolvido para ajustes, com comentario
  'rejected',     -- rejeitado, com comentario — fim de linha
  'published',    -- visivel para o paciente elegivel
  'archived'      -- despublicado, ou substituido por versao mais nova
);

-- Tres naturezas diferentes no mesmo campo "tipo de conteudo": texto no corpo,
-- video por EMBED EXTERNO (URL, nunca arquivo) e PDF por upload no Storage.
CREATE TYPE public.content_media_kind AS ENUM ('text', 'video', 'pdf');

-- O que o administrador faz com a versao submetida. 'unpublish' e o
-- "despublicado" das fontes: nao e revisao de fila, mas e decisao do mesmo
-- ator sobre o mesmo objeto, e merece o mesmo registro com comentario.
CREATE TYPE public.content_review_action AS ENUM ('approve', 'return', 'reject', 'unpublish');


-- ============================================================
-- 2. content_categories — os chips da tela, que NAO sao as especialidades
-- ============================================================
--
-- As fontes listam SEIS categorias (Nutricao, Psicologia, Odontologia,
-- Fisioterapia, Enfermagem, Medicacao Oral) contra SETE especialidades: falta
-- oncologia, falta farmacia, e sobra "Medicacao Oral", que nao e especialidade
-- nenhuma. Questao #19.
--
-- Por isso tabela de dominio com specialty_id NULLABLE, e nao enum nem FK
-- direta a specialties (ADR-002): a forma acomoda os dois desfechos da #19.
-- Se a clinica disser "sao a mesma lista", preenche-se specialty_id nas seis e
-- criam-se as duas que faltam; se disser "sao listas diferentes", ja esta
-- certo. Nenhum dos dois exige mudar coluna.

CREATE TABLE public.content_categories (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code         text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z_]*$'),
  label        text NOT NULL CHECK (length(btrim(label)) > 0),
  -- NULL = categoria que nao corresponde a especialidade alguma.
  specialty_id uuid REFERENCES public.specialties (id) ON DELETE RESTRICT,
  sort_order   smallint NOT NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_categories IS
  'Os chips de filtro da tela de Orientacoes. Vive na MIGRATION e nao em seed, pela mesma razao de specialties: seed nao roda em `db push`, e a categoria participa da regra de escrita por area.';
COMMENT ON COLUMN public.content_categories.specialty_id IS
  'NULL quando a categoria nao e especialidade (Medicacao Oral). Fecha a #19 nos dois sentidos sem mudar coluna.';

INSERT INTO public.content_categories (code, label, specialty_id, sort_order)
SELECT v.code, v.label, s.id, v.sort_order
  FROM (VALUES
          ('nutrition',       'Nutrição',       'nutrition',     1::smallint),
          ('psychology',      'Psicologia',     'psychology',    2),
          ('dentistry',       'Odontologia',    'dentistry',     3),
          ('physiotherapy',   'Fisioterapia',   'physiotherapy', 4),
          ('nursing',         'Enfermagem',     'nursing',       5),
          ('oral_medication', 'Medicação Oral', NULL,            6)
       ) AS v (code, label, specialty_code, sort_order)
  LEFT JOIN public.specialties s ON s.code = v.specialty_code
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 3. content_items — a identidade estavel da orientacao
-- ============================================================
--
-- Deliberadamente magra: titulo, corpo, midia e estado moram na VERSAO. O que
-- fica aqui e o que nao muda de versao para versao — quem produziu, em que
-- categoria, e o alvo estavel para content_cid10 e patient_content_states.
-- Favoritar a versao 2 e perder o favorito na versao 3 seria absurdo.

CREATE TABLE public.content_items (
  id          uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  category_id uuid NOT NULL REFERENCES public.content_categories (id) ON DELETE RESTRICT,
  -- Autoria em duas colunas, como em specialty_notes: o PERFIL (para a regra
  -- de escrita por area) e a CONTA (para a trilha). O perfil pode acabar; a
  -- conta que escreveu nao muda.
  author_professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE RESTRICT,
  authored_by            uuid NOT NULL REFERENCES public.accounts (id)      ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_items IS
  'A orientacao como identidade estavel. SEM published_version_id: a versao publicada e a linha de content_versions com status = published, garantida unica por indice parcial — a mesma forma de "uma linha vigente" de treatment_plans.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.content_items
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 4. content_versions — versoes sao LINHAS, e o estado mora aqui
-- ============================================================
--
-- "Versionamento simples", "comparativo de versoes" e "historico de cada
-- orientacao" sao requisitos textuais do Anexo II.
--
-- O ESTADO MORA NA VERSAO, e nao no item, por uma razao de tela: a maquina de
-- estados tem a transicao Publicado -> EmRevisao ("edicao de conteudo ja
-- publicado"). Se o estado morasse no item, submeter a v3 tiraria a v2 do ar
-- e a orientacao sumiria da biblioteca de todos os pacientes ate o
-- administrador aprovar. Com o estado na versao, a v2 continua publicada
-- enquanto a v3 espera revisao.

CREATE TABLE public.content_versions (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  content_item_id uuid NOT NULL REFERENCES public.content_items (id) ON DELETE RESTRICT,
  -- bigint e nao integer: prefer-bigint-over-int segue ativa no .squawk.toml,
  -- e coluna de versao ja foi o caso que a regra mordeu em
  -- create_patient_clinical. Preenchido pelo trigger da secao 5.
  version_no      bigint NOT NULL,
  title           text NOT NULL CHECK (length(btrim(title)) > 0),
  body            text NOT NULL CHECK (length(btrim(body)) > 0),
  media_kind      public.content_media_kind NOT NULL DEFAULT 'text',
  -- Video e EMBED, nunca arquivo. O CHECK limita aos dois provedores que as
  -- fontes nomeiam e exige https — a URL vai para um iframe no app.
  video_url       text CHECK (
                    video_url IS NULL
                    OR video_url ~ '^https://([a-z0-9-]+\.)?(youtube\.com|youtu\.be|vimeo\.com)/'
                  ),
  -- smallint: "tempo estimado de leitura" em minutos nunca e identificador,
  -- e prefer-bigint-over-smallint esta excluida com justificativa.
  estimated_reading_minutes smallint CHECK (estimated_reading_minutes > 0),
  status          public.content_status NOT NULL DEFAULT 'draft',
  created_by_professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE RESTRICT,
  created_by                 uuid NOT NULL REFERENCES public.accounts (id)      ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_content_versions_no UNIQUE (content_item_id, version_no),
  -- Video sem URL seria um card que nao abre.
  CONSTRAINT ck_content_versions_video_url
    CHECK (media_kind <> 'video' OR video_url IS NOT NULL)
);

COMMENT ON COLUMN public.content_versions.status IS
  'O estado do workflow mora na VERSAO. No item, submeter uma correcao tiraria do ar a versao publicada — o paciente perderia a orientacao durante a revisao.';

-- A "versao publicada" e um indice, nao um ponteiro: nao ha como divergir do
-- que a coluna status diz, porque nao ha segunda copia.
CREATE UNIQUE INDEX uq_content_versions_published
  ON public.content_versions (content_item_id)
  WHERE status = 'published';

-- Uma versao em revisao por vez: duas filas para a mesma orientacao dariam ao
-- administrador duas verdades para aprovar.
CREATE UNIQUE INDEX uq_content_versions_in_review
  ON public.content_versions (content_item_id)
  WHERE status = 'in_review';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.content_versions
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. Numeracao e maquina de estados — em TRIGGER
-- ============================================================
--
-- Em trigger, e nao so em politica, porque service_role ignora RLS: a regra de
-- negocio precisa valer tambem para a Edge Function e para a rotina agendada.

CREATE FUNCTION private.assign_content_version_no()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- le versoes de outrem sem depender da RLS de quem escreve
SET search_path = ''
AS $$
BEGIN
  IF NEW.version_no IS NULL OR NEW.version_no = 0 THEN
    SELECT coalesce(pg_catalog.max(v.version_no), 0) + 1
      INTO NEW.version_no
      FROM public.content_versions v
     WHERE v.content_item_id = NEW.content_item_id;
  END IF;
  RETURN NEW;
END;
$$;

-- version_no NOT NULL com o trigger preenchendo: o cliente manda 0 e recebe o
-- numero certo. A corrida de dois autores simultaneos e resolvida pela
-- UNIQUE (content_item_id, version_no), nao por lock.
ALTER TABLE public.content_versions ALTER COLUMN version_no SET DEFAULT 0;

CREATE TRIGGER trg_assign_version_no
BEFORE INSERT ON public.content_versions
FOR EACH ROW EXECUTE FUNCTION private.assign_content_version_no();

CREATE FUNCTION private.enforce_content_version_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- Toda versao nasce rascunho. Nascer 'published' driblaria a revisao inteira
  -- — e o workflow de aprovacao e criterio de aceite do painel administrativo.
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'versao de conteudo nasce em draft (recebido: %)', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Conteudo so se edita antes da revisao. Depois de submetido, mudar o corpo
  -- faria o administrador aprovar um texto e publicar outro; depois de
  -- publicado, faria o "comparativo de versoes" comparar com o que ja mudou.
  IF OLD.status NOT IN ('draft', 'returned')
     AND ( NEW.title      IS DISTINCT FROM OLD.title
        OR NEW.body       IS DISTINCT FROM OLD.body
        OR NEW.media_kind IS DISTINCT FROM OLD.media_kind
        OR NEW.video_url  IS DISTINCT FROM OLD.video_url
        OR NEW.estimated_reading_minutes IS DISTINCT FROM OLD.estimated_reading_minutes ) THEN
    RAISE EXCEPTION 'conteudo da versao % e imutavel a partir de %', OLD.id, OLD.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- A matriz inteira, explicita. O que nao esta aqui nao acontece.
  IF NOT (
       (OLD.status = 'draft'     AND NEW.status = 'in_review')   -- submete
    OR (OLD.status = 'returned'  AND NEW.status = 'in_review')   -- resubmete apos ajuste
    OR (OLD.status = 'in_review' AND NEW.status = 'published')   -- aprova
    OR (OLD.status = 'in_review' AND NEW.status = 'returned')    -- devolve para ajustes
    OR (OLD.status = 'in_review' AND NEW.status = 'rejected')    -- rejeita
    OR (OLD.status = 'published' AND NEW.status = 'archived')    -- despublica ou e substituida
  ) THEN
    RAISE EXCEPTION 'transicao invalida em content_versions: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_version_transition
BEFORE INSERT OR UPDATE ON public.content_versions
FOR EACH ROW EXECUTE FUNCTION private.enforce_content_version_transition();

COMMENT ON FUNCTION private.enforce_content_version_transition() IS
  'Maquina de estados do workflow de publicacao, em trigger porque service_role ignora RLS. Rascunho -> revisao -> publicado/devolvido/rejeitado, e publicado -> arquivado.';


-- ============================================================
-- 6. content_version_reviews — a transicao, com o comentario do revisor
-- ============================================================
--
-- O comentario pertence a TRANSICAO, nao a orientacao: "devolvido porque falta
-- a dose" e verdade sobre a v2 em 12/09, nao sobre a orientacao.
-- Tabela append-only: e o historico do workflow, criterio de aceite do painel.

CREATE TABLE public.content_version_reviews (
  id                 uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  content_version_id uuid NOT NULL REFERENCES public.content_versions (id) ON DELETE RESTRICT,
  action             public.content_review_action NOT NULL,
  reviewer_account_id uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  -- Devolver e rejeitar EXIGEM comentario ("com comentario explicativo", Anexo
  -- II). Aprovar e despublicar nao.
  comment            text CHECK (comment IS NULL OR length(btrim(comment)) > 0),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_content_reviews_comment_required
    CHECK (action NOT IN ('return', 'reject') OR comment IS NOT NULL)
);

COMMENT ON TABLE public.content_version_reviews IS
  'Historico do workflow de aprovacao: quem decidiu o que, quando e por que. Append-only por REVOKE (secao 11).';


-- ============================================================
-- 7. Marcacao: CID e anexos
-- ============================================================
--
-- A elegibilidade e DERIVADA da marcacao por CID cruzada com o diagnostico do
-- paciente — nao ha lista manual paciente x conteudo (Publicacao dirigida).

CREATE TABLE public.content_cid10 (
  content_item_id uuid NOT NULL REFERENCES public.content_items (id) ON DELETE CASCADE,
  cid10_id        uuid NOT NULL REFERENCES public.cid10 (id)         ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (content_item_id, cid10_id)
);

COMMENT ON TABLE public.content_cid10 IS
  'Marcacao por CID. AUSENCIA DE LINHA = conteudo UNIVERSAL, visivel a todo paciente — decisao declarada, nao efeito colateral: o Gemed e quem popula patient_diagnoses e ele esta desligado (#15). Sem esta regra, a biblioteca inteira chegaria vazia na homologacao e alguem inventaria um fallback na vespera.';

-- ON DELETE CASCADE aqui e nas duas unicas tabelas do agregado onde ele
-- aparece: desmarcar um CID e edicao editorial, nao perda de dado clinico.
-- O REVOKE DELETE da ADR-005 protege dado de paciente; marcacao nao e.

CREATE TABLE public.content_attachments (
  id                 uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  content_version_id uuid NOT NULL REFERENCES public.content_versions (id) ON DELETE CASCADE,
  -- Caminho no Storage. UNIQUE porque dois registros para o mesmo objeto
  -- fariam a limpeza apagar arquivo ainda referenciado.
  storage_path text NOT NULL UNIQUE CHECK (length(btrim(storage_path)) > 0),
  mime_type    text NOT NULL CHECK (mime_type ~ '^[a-z]+/[a-z0-9.+-]+$'),
  byte_size    bigint NOT NULL CHECK (byte_size > 0),
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.content_attachments IS
  'PDF e imagem da orientacao. LACUNA CONHECIDA: a politica do bucket no Storage NAO existe ainda — enquanto ela nao for escrita, o anexo so esta protegido pela obscuridade do caminho. Registrado em Questoes em aberto; a politica do bucket precisa espelhar a elegibilidade desta migration.';


-- ============================================================
-- 8. patient_content_states — favorito e lido
-- ============================================================
--
-- A UNICA tabela do agregado com dado de paciente. Nao e conteudo: e
-- comportamento ("o que voce leu, o que voce guardou").
--
-- NENHUMA politica para profissional ou administrador, e isso e a decisao —
-- nao esquecimento. E a premissa mais fragil do pre-mortem ("conteudo
-- educativo nao e dado clinico") posta sob teste: enquanto ninguem da equipe
-- alcanca esta tabela, ela nao precisa de pedagio read_* nem de trilha de
-- leitura. No dia em que uma tela pedir "quem leu a orientacao", isso e
-- politica aditiva SOB auditoria — nao um retrofit como o da ADR-008.

CREATE TABLE public.patient_content_states (
  patient_id      uuid NOT NULL REFERENCES public.patients (id)      ON DELETE RESTRICT,
  content_item_id uuid NOT NULL REFERENCES public.content_items (id) ON DELETE RESTRICT,
  is_favorite     boolean NOT NULL DEFAULT false,
  -- NULL = nao lida. Timestamp e nao booleano: "indicacao visual de nao
  -- lidas" precisa do booleano, mas QUANDO leu e gratis e nao volta depois.
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (patient_id, content_item_id)
);

COMMENT ON TABLE public.patient_content_states IS
  'Favorito e lido/nao lido, do par paciente x orientacao. So o titular le e escreve: equipe e administracao NAO tem politica aqui (ADR-010 §5).';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.patient_content_states
FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 9. Elegibilidade — em funcao SECURITY DEFINER, e nao em subquery de politica
-- ============================================================
--
-- Nao e preferencia de estilo: a politica de content_items precisa consultar
-- content_versions, e a de content_versions precisa saber se o item e
-- elegivel. Duas politicas que se consultam entram em RECURSAO INFINITA. A
-- funcao DEFINER corta o ciclo — dentro dela a RLS nao se aplica.

CREATE FUNCTION private.my_library_cid10_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(pg_catalog.array_agg(DISTINCT pd.cid10_id), '{}'::uuid[])
    FROM public.patient_diagnoses pd
   WHERE pd.patient_id = private.my_own_patient_id()
      OR pd.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())));
$$;

COMMENT ON FUNCTION private.my_library_cid10_ids() IS
  'CIDs que recortam a biblioteca de quem esta na sessao: os proprios (titular) e os do tutelado (cuidador). Devolve {} para quem nao e nem um nem outro — e {} nao ve conteudo marcado, so o universal.';

CREATE FUNCTION private.is_library_audience()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.my_own_patient_id() IS NOT NULL
      OR pg_catalog.cardinality(private.my_ward_patient_ids()) > 0;
$$;

COMMENT ON FUNCTION private.is_library_audience() IS
  'Titular ou cuidador ativo. Existe para que conta sem perfil (e conta desativada) NAO caiam na regra do conteudo universal — sem isto, {} de CIDs veria toda a biblioteca sem marcacao.';

CREATE FUNCTION private.is_content_visible_to_me(p_content_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.content_versions v
            WHERE v.content_item_id = p_content_item_id
              AND v.status = 'published'
         )
     AND (
           -- Sem marcacao de CID = universal.
           NOT EXISTS (SELECT 1 FROM public.content_cid10 c
                        WHERE c.content_item_id = p_content_item_id)
           OR EXISTS (SELECT 1 FROM public.content_cid10 c
                       WHERE c.content_item_id = p_content_item_id
                         AND c.cid10_id = ANY (ARRAY(SELECT unnest(private.my_library_cid10_ids()))))
         );
$$;

COMMENT ON FUNCTION private.is_content_visible_to_me(uuid) IS
  'Elegibilidade do paciente/cuidador a uma orientacao: existe versao publicada E (nao ha marcacao de CID OU ela cruza com o diagnostico). A regra mora AQUI, no banco — nao na query do front-end, onde viraria tres verdades.';


-- ============================================================
-- 10. RLS
-- ============================================================

ALTER TABLE public.content_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_versions         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_version_reviews  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_cid10            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_content_states   ENABLE ROW LEVEL SECURITY;

-- --- vocabulario: todo mundo autenticado le -------------------------------
CREATE POLICY content_categories_select_authenticated ON public.content_categories
  FOR SELECT TO authenticated USING (true);

-- --- content_items --------------------------------------------------------
--
-- Equipe e administracao leem a biblioteca inteira, em qualquer estado: quem
-- produz precisa achar o proprio rascunho, e quem revisa precisa ver a fila.
-- SEM pedagio read_*: conteudo educativo nao e dado de paciente.
CREATE POLICY content_items_select_staff ON public.content_items
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) OR (SELECT private.is_active_admin()) );

CREATE POLICY content_items_select_audience ON public.content_items
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_library_audience())
          AND private.is_content_visible_to_me(id) );

-- Escrita na propria area (#9): o profissional produz na categoria da propria
-- especialidade. Categoria sem especialidade (Medicacao Oral) fica aberta a
-- qualquer profissional ativo — nao ha area a que ela pertenca, e negar a
-- todos deixaria a categoria inutilizavel. Reavaliar quando a #19 fechar.
CREATE POLICY content_items_insert_professional ON public.content_items
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_active_professional())
    AND author_professional_id = (SELECT private.my_professional_id())
    AND authored_by = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.content_categories c
       WHERE c.id = category_id
         AND c.is_active
         AND ( c.specialty_id IS NULL
               OR c.specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) )
    )
  );

CREATE POLICY content_items_update_author ON public.content_items
  FOR UPDATE TO authenticated
  USING ( author_professional_id = (SELECT private.my_professional_id()) )
  WITH CHECK ( author_professional_id = (SELECT private.my_professional_id()) );

-- --- content_versions -----------------------------------------------------
CREATE POLICY content_versions_select_staff ON public.content_versions
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) OR (SELECT private.is_active_admin()) );

-- O paciente le APENAS a versao publicada — nunca o rascunho, nunca a
-- rejeitada, nunca a arquivada. O historico de versoes e do painel.
CREATE POLICY content_versions_select_audience ON public.content_versions
  FOR SELECT TO authenticated
  USING ( status = 'published'
          AND (SELECT private.is_library_audience())
          AND private.is_content_visible_to_me(content_item_id) );

CREATE POLICY content_versions_insert_author ON public.content_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_active_professional())
    AND created_by_professional_id = (SELECT private.my_professional_id())
    AND created_by = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.content_items i
       WHERE i.id = content_item_id
         AND i.author_professional_id = (SELECT private.my_professional_id())
    )
  );

-- O autor edita e SUBMETE (draft/returned -> in_review) direto na tabela. A
-- transicao e guardada pelo trigger; a politica so diz de quem e a versao.
-- A decisao do administrador NAO passa por aqui: ela e multi-tabela (revisao +
-- versao + arquivamento da anterior) e por isso e RPC (secao 11).
CREATE POLICY content_versions_update_author ON public.content_versions
  FOR UPDATE TO authenticated
  USING (
    created_by_professional_id = (SELECT private.my_professional_id())
    AND status IN ('draft', 'returned')
  )
  WITH CHECK (
    created_by_professional_id = (SELECT private.my_professional_id())
    AND status IN ('draft', 'in_review')
  );

-- --- revisoes: le quem produz e quem revisa; escreve so a RPC -------------
CREATE POLICY content_version_reviews_select_staff ON public.content_version_reviews
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) OR (SELECT private.is_active_admin()) );

-- --- marcacao por CID -----------------------------------------------------
--
-- Legivel por todo autenticado: a marcacao de um CONTEUDO nao diz nada sobre
-- paciente nenhum. O que e sensivel e o diagnostico, e ele esta em
-- patient_diagnoses, sob a RLS do agregado Paciente.
CREATE POLICY content_cid10_select_authenticated ON public.content_cid10
  FOR SELECT TO authenticated USING (true);

CREATE POLICY content_cid10_write_author ON public.content_cid10
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.content_items i
             WHERE i.id = content_item_id
               AND i.author_professional_id = (SELECT private.my_professional_id()))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.content_items i
             WHERE i.id = content_item_id
               AND i.author_professional_id = (SELECT private.my_professional_id()))
  );

-- --- anexos ---------------------------------------------------------------
CREATE POLICY content_attachments_select_staff ON public.content_attachments
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) OR (SELECT private.is_active_admin()) );

CREATE POLICY content_attachments_select_audience ON public.content_attachments
  FOR SELECT TO authenticated
  USING (
    (SELECT private.is_library_audience())
    AND EXISTS (
      SELECT 1 FROM public.content_versions v
       WHERE v.id = content_version_id
         AND v.status = 'published'
         AND private.is_content_visible_to_me(v.content_item_id)
    )
  );

CREATE POLICY content_attachments_write_author ON public.content_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.content_versions v
             WHERE v.id = content_version_id
               AND v.created_by_professional_id = (SELECT private.my_professional_id())
               AND v.status IN ('draft', 'returned'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.content_versions v
             WHERE v.id = content_version_id
               AND v.created_by_professional_id = (SELECT private.my_professional_id())
               AND v.status IN ('draft', 'returned'))
  );

-- --- estados do paciente: so o titular ------------------------------------
CREATE POLICY patient_content_states_all_own ON public.patient_content_states
  FOR ALL TO authenticated
  USING      ( patient_id = (SELECT private.my_own_patient_id()) )
  WITH CHECK ( patient_id = (SELECT private.my_own_patient_id()) );

-- NENHUMA politica para cuidador: favoritar e marcar como lido sao atos do
-- titular. O cuidador LE a biblioteca (secao acima) — nao gerencia os
-- marcadores de quem acompanha.
-- NENHUMA politica para profissional ou administrador: ver comentario da
-- secao 8.


-- ============================================================
-- 11. RPC — a decisao do administrador
-- ============================================================
--
-- Multi-tabela por natureza: registra a revisao, move a versao e arquiva a
-- que estava publicada. Em politica, seriam tres escritas independentes que o
-- front-end poderia fazer pela metade.

CREATE FUNCTION public.review_content_version(
  p_content_version_id uuid,
  p_action             public.content_review_action,
  p_comment            text DEFAULT NULL
)
RETURNS public.content_status
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version public.content_versions;
  v_new     public.content_status;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador ativo revisa conteudo'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT v.* INTO v_version
    FROM public.content_versions v
   WHERE v.id = p_content_version_id
     FOR UPDATE;

  IF v_version.id IS NULL THEN
    RAISE EXCEPTION 'versao inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  IF p_action IN ('return', 'reject') AND btrim(coalesce(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'devolucao e rejeicao exigem comentario explicativo'
      USING ERRCODE = 'check_violation';
  END IF;

  v_new := CASE p_action
             WHEN 'approve'   THEN 'published'
             WHEN 'return'    THEN 'returned'
             WHEN 'reject'    THEN 'rejected'
             WHEN 'unpublish' THEN 'archived'
           END::public.content_status;   -- CASE devolve text: o cast e obrigatorio

  -- Aprovar arquiva a versao que estava no ar. Sem isto, o indice unico
  -- parcial recusaria a publicacao — e a mensagem de erro nao explicaria nada
  -- ao administrador.
  IF p_action = 'approve' THEN
    UPDATE public.content_versions
       SET status = 'archived'
     WHERE content_item_id = v_version.content_item_id
       AND status = 'published';
  END IF;

  UPDATE public.content_versions
     SET status = v_new
   WHERE id = p_content_version_id;

  INSERT INTO public.content_version_reviews
    (content_version_id, action, reviewer_account_id, comment)
  VALUES
    (p_content_version_id, p_action, auth.uid(), nullif(btrim(coalesce(p_comment, '')), ''));

  RETURN v_new;
END;
$$;

COMMENT ON FUNCTION public.review_content_version(uuid, public.content_review_action, text) IS
  'A decisao do administrador sobre a versao submetida: aprova, devolve, rejeita ou despublica. Unico caminho — a politica de UPDATE de content_versions e do AUTOR, nao do revisor.';


-- ============================================================
-- 12. Trilha de escrita e indices
-- ============================================================
--
-- audit_write com '-': o agregado nao tem coluna de paciente a extrair, exceto
-- patient_content_states — que fica DE FORA da trilha de proposito. Registrar
-- "o titular abriu a orientacao sobre nausea" criaria, no log de auditoria, um
-- rastro de leitura sobre a propria doenca que nenhuma fonte pede.
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.content_items
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.content_versions
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.content_version_reviews
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');

-- A biblioteca do paciente: itens publicados, filtrados por categoria (o chip
-- da tela) e cruzados por CID.
CREATE INDEX idx_content_items_category
  ON public.content_items (category_id);
CREATE INDEX idx_content_items_author
  ON public.content_items (author_professional_id);
-- A fila do revisor e o historico do item.
CREATE INDEX idx_content_versions_item
  ON public.content_versions (content_item_id, version_no DESC);
CREATE INDEX idx_content_versions_status
  ON public.content_versions (status, created_at DESC);
CREATE INDEX idx_content_versions_author
  ON public.content_versions (created_by_professional_id);
CREATE INDEX idx_content_version_reviews_version
  ON public.content_version_reviews (content_version_id, created_at DESC);
-- O cruzamento da elegibilidade parte do CID do paciente.
CREATE INDEX idx_content_cid10_cid
  ON public.content_cid10 (cid10_id);
CREATE INDEX idx_content_attachments_version
  ON public.content_attachments (content_version_id);
-- "Minhas favoritas" e "nao lidas": a PK ja cobre (patient_id, item), este
-- indice cobre o filtro por favorito.
CREATE INDEX idx_patient_content_states_favorite
  ON public.patient_content_states (patient_id)
  WHERE is_favorite;


-- ============================================================
-- 13. Privilegios — SEMPRE no fim
-- ============================================================

-- O vocabulario nao se edita pelo cliente: categoria nova e migration, como
-- specialties.
REVOKE INSERT, UPDATE, DELETE ON public.content_categories FROM authenticated, service_role;

-- A revisao so nasce pela RPC, e nao se corrige nem se apaga: e o historico do
-- workflow, criterio de aceite do painel administrativo.
REVOKE INSERT, UPDATE, DELETE ON public.content_version_reviews FROM authenticated, service_role;

-- Orientacao publicada nao se apaga — despublica-se (published -> archived).
-- Mesma logica do REVOKE DELETE da ADR-005, aplicada ao editorial: apagar
-- destruiria o historico de versoes que o Anexo II exige.
REVOKE DELETE ON public.content_items    FROM authenticated, service_role;
REVOKE DELETE ON public.content_versions FROM authenticated, service_role;

-- O autor muda a categoria; nunca a autoria. RLS e por LINHA e nao distingue
-- coluna — a defesa e privilegio de coluna, o mesmo truque de accounts.is_active.
REVOKE UPDATE ON public.content_items FROM authenticated;
GRANT  UPDATE (category_id, updated_at) ON public.content_items TO authenticated;

-- O autor edita conteudo e submete; nao carimba a propria versao como
-- publicada por UPDATE direto de status... exceto para 'in_review', que a
-- politica ja restringe no WITH CHECK e o trigger confirma na matriz.
REVOKE UPDATE ON public.content_versions FROM authenticated;
GRANT  UPDATE (title, body, media_kind, video_url, estimated_reading_minutes, status, updated_at)
  ON public.content_versions TO authenticated;

REVOKE EXECUTE ON FUNCTION private.assign_content_version_no()            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.enforce_content_version_transition()   FROM PUBLIC;

-- EXECUTE e exigido EM RUNTIME por quem consulta, quando a funcao entra em
-- politica RLS. Sem estes tres GRANTs, toda leitura da biblioteca pelo app do
-- paciente morre com "permission denied for function". Armadilha ja anotada
-- para get_my_uid, uuid_generate_v7 e my_professional_id — quarta ocorrencia.
REVOKE EXECUTE ON FUNCTION private.my_library_cid10_ids()          FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION private.my_library_cid10_ids()          TO authenticated;
REVOKE EXECUTE ON FUNCTION private.is_library_audience()           FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION private.is_library_audience()           TO authenticated;
REVOKE EXECUTE ON FUNCTION private.is_content_visible_to_me(uuid)  FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION private.is_content_visible_to_me(uuid)  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.review_content_version(uuid, public.content_review_action, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.review_content_version(uuid, public.content_review_action, text) TO authenticated;
