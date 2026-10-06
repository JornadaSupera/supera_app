-- Quem escreve nao aprova: review_content_version recusa aprovar a versao que
-- a propria conta criou.
-- Plano das pendencias do painel de 30/09/2026, Fase G, item G.1b, decisao
-- D1b. PROVISORIO: a pergunta foi enviada a CEON em 30/09/2026 (pergunta 2) e
-- ainda nao tem resposta. Ate la vale o comportamento RESTRITIVO, que e a
-- nossa recomendacao.
--
-- POR QUE SOBE ANTES DA RESPOSTA. So o administrador revisa conteudo, e
-- allow_admin_content_authoring acabou de deixa-lo escrever. Sem esta trava,
-- ele cria, submete e aprova o proprio texto na mesma sessao: o workflow de
-- publicacao, criterio de aceite do painel administrativo, deixaria de
-- existir para o conteudo dele. As duas migrations sobem juntas; a
-- anterior nunca vai sozinha para homologacao.
--
-- A COMPARACAO E PELA CONTA (content_versions.created_by), e nao pelo perfil:
-- a mesma pessoa com papel de profissional e de administrador continua sendo
-- quem escreveu.
--
-- SO A APROVACAO E RECUSADA. Devolver, rejeitar e despublicar a propria
-- versao nao publicam nada: sao o autor retirando o proprio texto. E devolver
-- e o unico jeito de o administrador tirar da fila a versao que submeteu por
-- engano, ja que a politica de UPDATE do autor so parte de draft.
--
-- CONSEQUENCIA OPERACIONAL, a comunicar a CEON junto com a resposta: com um
-- unico administrador ativo, a orientacao que ele escreve espera um segundo
-- administrador para ser publicada.
--
-- SE A CEON RESPONDER QUE O ADMINISTRADOR PODE APROVAR O PROPRIO TEXTO: uma
-- migration nova recria a funcao sem o bloco da secao 1, e o guia registra
-- que o workflow nao vale para o conteudo dele. Nenhuma coluna muda.


-- ============================================================
-- 1. A funcao, com a trava
-- ============================================================
--
-- CREATE OR REPLACE, mesma assinatura: dono e privilegios sobrevivem. O resto
-- do corpo e o de shrink_content_status, sem mudanca.

CREATE OR REPLACE FUNCTION public.review_content_version(
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

  -- PROVISORIO (D1b, aguardando a CEON): quem escreveu nao aprova.
  IF p_action = 'approve' AND v_version.created_by = auth.uid() THEN
    RAISE EXCEPTION 'self_approval_not_allowed'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'A versao precisa ser aprovada por outro administrador.';
  END IF;

  IF p_action IN ('return', 'reject') AND btrim(coalesce(p_comment, '')) = '' THEN
    RAISE EXCEPTION 'devolucao e rejeicao exigem comentario explicativo'
      USING ERRCODE = 'check_violation';
  END IF;

  v_new := CASE p_action
             WHEN 'approve'   THEN 'published'
             WHEN 'return'    THEN 'draft'
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
  'A decisao do administrador sobre a versao submetida. Devolver leva a draft e rejeitar leva a archived (ADR-018 §3). Desde 30/09/2026, PROVISORIAMENTE (D1b, aguardando a CEON), recusa aprovar a versao criada pela propria conta: self_approval_not_allowed.';


-- ============================================================
-- 2. A verificacao — o efeito, nao a execucao
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL, mas a verificacao e barata e protege
-- contra a migration futura que troque isto por DROP + CREATE sem refazer os
-- privilegios.

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon',
       'public.review_content_version(uuid, public.content_review_action, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa review_content_version';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated',
       'public.review_content_version(uuid, public.content_review_action, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em review_content_version: o administrador nao revisaria nada';
  END IF;
END;
$$;
