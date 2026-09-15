-- O caminho de escrita dos termos de uso e da politica de privacidade.
-- Design e racional: supera-docs/ADRs/ADR-022 — O que ainda dependia so de nos.md
-- Requisito: supera-docs/Requisitos/Segurança e Dados/Tratamento de dados pessoais — LGPD.md
--
-- O QUE ESTAVA PELA METADE: `legal_document_versions` nasceu com as duas
-- politicas de LEITURA (a vigente para todo autenticado, o historico para o
-- administrador) e NENHUM caminho de escrita. O painel le e nao publica. Como a
-- tabela esta vazia, o efeito e que **nao existe texto para exibir antes do
-- aceite** — e o aceite (`accept_legal_terms`) ja existe desde entao, apontando
-- para uma versao vigente que nunca pode ser criada.
--
-- ISTO E LACUNA DE CONFORMIDADE, NAO DE TELA. Nenhum paciente real deveria
-- entrar no app antes de haver versao vigente dos dois documentos. A ativacao
-- da conta passou a funcionar na leva anterior, o que torna a lacuna alcancavel
-- em vez de teorica.
--
-- O TEXTO NAO E NOSSO PARA ESCREVER. Esta migration entrega o MECANISMO de
-- publicacao; o conteudo dos documentos vem da clinica, e entra por esta RPC
-- quando chegar. Semear texto juridico inventado seria pior que a tabela vazia:
-- a tabela vazia se ve, o texto inventado vira consentimento aparente.
--
-- PUBLICAR E CRIAR VERSAO, NUNCA EDITAR A VIGENTE. O aceite aponta para a
-- VERSAO (decisao registrada em create_patient_clinical): se o texto vigente
-- fosse editado no lugar, quem aceitou a v1 passaria a constar como tendo
-- aceitado a v2 sem nunca a ter lido. Por isso nao existe `update_legal_document`
-- nesta migration, e nao e esquecimento.


-- ============================================================
-- 1. publish_legal_document — a unica escrita
-- ============================================================

CREATE FUNCTION public.publish_legal_document(
  p_kind public.legal_document_kind,
  p_body text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_version bigint;
  v_id      uuid;
BEGIN
  -- So o administrador. A RPC e SECURITY DEFINER e nao ha politica de INSERT na
  -- tabela, entao a checagem no corpo e a unica barreira — e ela vem antes de
  -- qualquer escrita.
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador publica documento legal'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_body IS NULL OR length(btrim(p_body)) = 0 THEN
    RAISE EXCEPTION 'o texto do documento nao pode ser vazio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Numero da versao por ESPECIE: termos e politica evoluem em ritmos
  -- diferentes, e uma sequencia unica faria a v3 dos termos conviver com a v1
  -- da politica sem que o numero dissesse nada.
  SELECT COALESCE(pg_catalog.max(v.version), 0) + 1 INTO v_version
    FROM public.legal_document_versions v
   WHERE v.kind = p_kind;

  -- Aposenta a anterior ANTES de inserir a nova: `uq_legal_document_current` e
  -- indice unico parcial sobre (kind) WHERE is_current, e a ordem inversa
  -- violaria a restricao no meio da transacao.
  UPDATE public.legal_document_versions
     SET is_current = false
   WHERE kind = p_kind AND is_current;

  INSERT INTO public.legal_document_versions (kind, version, body, published_at, is_current)
  VALUES (p_kind, v_version, btrim(p_body), pg_catalog.now(), true)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.publish_legal_document(public.legal_document_kind, text) IS
  'Publica nova versao e aposenta a anterior, na mesma transacao. NAO existe edicao da vigente: o aceite aponta para a versao, e editar no lugar reescreveria retroativamente quem aceitou o que.';


-- ============================================================
-- 2. Trilha — publicar e ato de governanca, nao de conteudo
-- ============================================================
--
-- Sem `patient_id`: o documento nao pertence a titular nenhum. A linha responde
-- "quem publicou qual versao, quando", que e a pergunta que uma inspecao faz
-- quando o texto vigente diverge do que alguem aceitou.

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.legal_document_versions
FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================

-- A tabela so muda por esta RPC. O `authenticated` ja tinha apenas SELECT;
-- explicitar o REVOKE protege contra um GRANT futuro feito por engano.
REVOKE INSERT, UPDATE, DELETE ON public.legal_document_versions FROM authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.publish_legal_document(public.legal_document_kind, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_legal_document(public.legal_document_kind, text)
  TO authenticated, service_role;

-- ASSERCAO DE EFEITO, nao de execucao (ADR-016): os dois lados.
DO $$
DECLARE
  v_sig text := 'public.publish_legal_document(public.legal_document_kind, text)';
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em publish_legal_document: o painel nao publicaria os termos.';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon EXECUTA publish_legal_document: qualquer um publicaria termo de uso sem login.';
  END IF;
END;
$$;
