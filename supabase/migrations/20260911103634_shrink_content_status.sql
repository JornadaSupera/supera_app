-- O vocabulario de estados do conteudo encolhe de seis valores para quatro.
-- Design e racional: supera-docs/ADRs/ADR-018 — Vocabulario de estados do workflow de conteudo.md
-- Fonte: respostas da CEON em 31/08/2026 — #21 e #40
--
-- A clinica escolheu a opcao mais curta do questionario: "So: Aguardando
-- aprovacao / Aprovado / Publicado". AO PLANEJAR O SQL, A LEITURA LITERAL
-- QUEBROU EM DOIS PONTOS, e isso so apareceu ao abrir a migration aplicada:
--
--   1. a lista OMITE `draft`, que o trigger exige — toda versao nasce rascunho,
--      e sem isso a orientacao teria de ser escrita num unico INSERT;
--   2. ela traz *Aprovado* como etapa distinta de *Publicado*, e esse estado
--      NAO EXISTE aqui: aprovar ja publica, na mesma transacao.
--
-- Obedecer ao pe da letra exigiria ACRESCENTAR um estado, nao remover tres. A
-- conclusao que o esquema impoe: a resposta descreve o CAMINHO FELIZ visto pelo
-- administrador, nao a lista de estados. A #40 confirmou por ausencia de fonte
-- que aprovar e publicar sao um passo so.
--
-- ENTAO ENCOLHE-SE SO O DESVIO: saem `returned` e `rejected`.
--   * `returned` SEMPRE FOI UM RASCUNHO COM OUTRO NOME — provado pelo proprio
--     trigger de congelamento, que ja o tratava como editavel. Devolver passa a
--     levar a `draft`.
--   * `rejected` e `archived` ja eram terminais e invisiveis ao paciente, e
--     nada no esquema tratava um diferente do outro. Rejeitar leva a `archived`.
--
-- NADA SE PERDE NO REGISTRO: content_version_reviews guarda `action` +
-- revisor + comentario + timestamp, e o comentario continua OBRIGATORIO em
-- devolucao e rejeicao. O que deixa de existir e o espelho da acao na coluna de
-- estado, que era redundante com a linha de revisao (ADR-018 §2).
--
-- CUSTO DA OPERACAO: enum NAO ENCOLHE. E tipo novo, ALTER COLUMN ... TYPE ...
-- USING, e a derrubada e recriacao de tudo que depende da coluna — os dois
-- indices unicos parciais, seis politicas em duas tabelas de `public`, tres
-- politicas em `storage.objects` e a RPC de revisao, cujo TIPO DE RETORNO e o
-- proprio enum. E por isso que a #40 tinha de fechar ANTES: refazer isto duas
-- vezes custaria duas migrations sobre tabela com conteudo editorial dentro.


-- ============================================================
-- 1. Derrubar o que depende da coluna
-- ============================================================
--
-- Postgres recusa alterar o tipo de coluna usada em DEFINICAO DE POLITICA —
-- inclusive politica de OUTRA tabela que a consulta por subconsulta. Nao ha
-- caminho tolerante aqui: e derrubar, alterar e recriar, tudo na mesma
-- transacao, que e como o Supabase aplica cada migration.

DROP POLICY content_versions_select_audience   ON public.content_versions;
DROP POLICY content_versions_update_author     ON public.content_versions;
DROP POLICY content_attachments_select_audience ON public.content_attachments;
DROP POLICY content_attachments_write_author    ON public.content_attachments;

DROP POLICY content_attachment_objects_insert ON storage.objects;
DROP POLICY content_attachment_objects_update ON storage.objects;
DROP POLICY content_attachment_objects_delete ON storage.objects;

-- Tipo de RETORNO e dependencia dura: sem este DROP, o ALTER TYPE falha.
DROP FUNCTION public.review_content_version(uuid, public.content_review_action, text);

-- Indices com PREDICADO sobre a coluna. O predicado carrega um literal do tipo
-- antigo; recria-se depois, identico em intencao.
DROP INDEX public.uq_content_versions_published;
DROP INDEX public.uq_content_versions_in_review;
DROP INDEX public.idx_content_versions_status;


-- ============================================================
-- 2. O tipo novo, e o mapeamento sem perda
-- ============================================================
--
-- Renomear o antigo em vez de dropa-lo primeiro: o nome `public.content_status`
-- fica livre para o tipo novo, e toda funcao de corpo textual que o referencia
-- por nome (o trigger de transicao, private.is_content_visible_to_me) continua
-- valendo sem ser tocada.

ALTER TYPE public.content_status RENAME TO content_status_v1;

CREATE TYPE public.content_status AS ENUM (
  'draft',      -- o profissional produz e EDITA. Estrutural: unico estado em que o corpo muda
  'in_review',  -- "Aguardando aprovacao" — o nome da clinica. A fila do administrador
  'published',  -- "Aprovado / Publicado". Uma por item, por indice unico parcial
  'archived'    -- fim de linha: despublicada, substituida OU REJEITADA
);

COMMENT ON TYPE public.content_status IS
  'Quatro estados (ADR-018 §1). `returned` virou `draft` porque sempre foi um rascunho com outro nome; `rejected` virou `archived` porque os dois ja eram terminais. A devolucao e a rejeicao continuam registradas em content_version_reviews.action.';

ALTER TABLE public.content_versions
  ALTER COLUMN status DROP DEFAULT;

-- O aviso do Squawk esta CERTO e nao e falso positivo: a troca de tipo pede
-- ACCESS EXCLUSIVE e reescreve a tabela. E o preco nomeado pela ADR-018 §P1, e
-- nao ha formulacao alternativa — enum nao encolhe. Suprimido AQUI, na linha, e
-- nao no .squawk.toml: a regra continua valendo para toda migration futura, e o
-- dia em que houver conteudo editorial em producao ela deve voltar a doer.
ALTER TABLE public.content_versions
  -- squawk-ignore changing-column-type
  ALTER COLUMN status TYPE public.content_status
  USING (CASE status::text
           WHEN 'returned' THEN 'draft'
           WHEN 'rejected' THEN 'archived'
           ELSE status::text
         END::public.content_status);

ALTER TABLE public.content_versions
  ALTER COLUMN status SET DEFAULT 'draft';

DROP TYPE public.content_status_v1;

COMMENT ON COLUMN public.content_versions.status IS
  'O estado do workflow mora na VERSAO. Quatro valores desde 11/09/2026 (#21/#40): devolver leva a draft, rejeitar leva a archived.';


-- ============================================================
-- 3. Os indices, identicos em intencao
-- ============================================================

CREATE UNIQUE INDEX uq_content_versions_published
  ON public.content_versions (content_item_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX uq_content_versions_in_review
  ON public.content_versions (content_item_id)
  WHERE status = 'in_review';

-- A fila do administrador (status = 'in_review') e a leitura QUENTE, e continua
-- servida. As duas distincoes que a coluna deixa de fazer — "nunca submetida"
-- x "devolvida" e "rejeitada" x "despublicada" — passam a derivar de
-- content_version_reviews, em telas de baixo volume (ADR-018 §3).
CREATE INDEX idx_content_versions_status
  ON public.content_versions (status, created_at DESC);


-- ============================================================
-- 4. O trigger de transicao SIMPLIFICA
-- ============================================================
--
-- A regra de congelamento sai de NOT IN ('draft','returned') para <> 'draft'.
-- Menos superficie, MESMA garantia — e a prova de que `returned` era redundante
-- esta justamente aqui: ele ja estava do lado editavel.

CREATE OR REPLACE FUNCTION private.enforce_content_version_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'draft' THEN
      RAISE EXCEPTION 'versao de conteudo nasce em draft (recebido: %)', NEW.status
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  -- Conteudo so se edita antes da revisao. Depois de submetido, mudar o corpo
  -- faria o administrador aprovar um texto e publicar outro.
  IF OLD.status <> 'draft'
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

  -- A matriz inteira, explicita. Perde duas linhas e ganha duas.
  IF NOT (
       (OLD.status = 'draft'     AND NEW.status = 'in_review')   -- submete (ou resubmete apos devolucao)
    OR (OLD.status = 'in_review' AND NEW.status = 'published')   -- aprova
    OR (OLD.status = 'in_review' AND NEW.status = 'draft')       -- devolve para ajustes
    OR (OLD.status = 'in_review' AND NEW.status = 'archived')    -- rejeita
    OR (OLD.status = 'published' AND NEW.status = 'archived')    -- despublica ou e substituida
  ) THEN
    RAISE EXCEPTION 'transicao invalida em content_versions: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.enforce_content_version_transition() IS
  'Maquina de estados do workflow de publicacao, em trigger porque service_role ignora RLS. Quatro estados desde 11/09/2026: devolver leva a draft, rejeitar leva a archived (ADR-018 §1).';


-- ============================================================
-- 5. As politicas, com `returned` trocado por `draft`
-- ============================================================

CREATE POLICY content_versions_select_audience ON public.content_versions
  FOR SELECT TO authenticated
  USING ( status = 'published'
          AND (SELECT private.is_library_audience())
          AND private.is_content_visible_to_me(content_item_id) );

CREATE POLICY content_versions_update_author ON public.content_versions
  FOR UPDATE TO authenticated
  USING (
    created_by_professional_id = (SELECT private.my_professional_id())
    AND status = 'draft'
  )
  WITH CHECK (
    created_by_professional_id = (SELECT private.my_professional_id())
    AND status IN ('draft', 'in_review')
  );

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
               AND v.status = 'draft')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.content_versions v
             WHERE v.id = content_version_id
               AND v.created_by_professional_id = (SELECT private.my_professional_id())
               AND v.status = 'draft')
  );


-- ============================================================
-- 6. As politicas do bucket — o espelho continua exato
-- ============================================================
--
-- `postgres` NAO e dono de storage.objects (o dono e supabase_storage_admin),
-- mas CREATE/DROP POLICY passa — e assim que o painel do Supabase cria politica
-- de bucket. A RLS ja vem ligada; nao ha o que ligar (ADR-013).

CREATE POLICY content_attachment_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status = 'draft'
    )
  );

CREATE POLICY content_attachment_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status = 'draft'
    )
  )
  WITH CHECK (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status = 'draft'
    )
  );

CREATE POLICY content_attachment_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status = 'draft'
    )
  );


-- ============================================================
-- 7. A RPC de revisao, recriada com o mapeamento novo
-- ============================================================
--
-- O enum de ACAO nao muda: ('approve','return','reject','unpublish') segue
-- intacto. E ele que carrega o que a resposta omitiu — e a metade que faz esta
-- decisao ser barata em vez de destrutiva (ADR-018 §2).

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

  -- Requisito literal de Conteudo educativo e workflow de publicacao, NAO
  -- revogado por ninguem: devolver e rejeitar exigem comentario. A acao
  -- sobrevive ao encolhimento do vocabulario de ESTADO justamente aqui.
  IF p_action IN ('return', 'reject') AND btrim(coalesce(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'devolucao e rejeicao exigem comentario explicativo'
      USING ERRCODE = 'check_violation';
  END IF;

  v_new := CASE p_action
             WHEN 'approve'   THEN 'published'
             -- Devolver leva a draft: a versao volta a ser EDITAVEL, que e a
             -- propriedade pela qual `returned` existia.
             WHEN 'return'    THEN 'draft'
             -- Rejeitar leva a archived: os dois sempre foram terminais.
             WHEN 'reject'    THEN 'archived'
             WHEN 'unpublish' THEN 'archived'
           END::public.content_status;   -- CASE devolve text: o cast e obrigatorio

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
  'A decisao do administrador sobre a versao submetida. Desde 11/09/2026 devolver leva a draft e rejeitar leva a archived — a distincao continua legivel em content_version_reviews.action (ADR-018 §3).';


-- ============================================================
-- 8. Privilegios — SEMPRE no fim
-- ============================================================
--
-- A funcao foi DROPADA e recriada: os privilegios dela NAO sobreviveram, e o
-- default privilege do Supabase reabre a nova para `anon`. Sem estas tres
-- linhas, o administrador perde a revisao e `anon` ganha uma RPC.

REVOKE EXECUTE ON FUNCTION public.review_content_version(uuid, public.content_review_action, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.review_content_version(uuid, public.content_review_action, text) TO authenticated;
