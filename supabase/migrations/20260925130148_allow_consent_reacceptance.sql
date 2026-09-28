-- Fase 3.2 e 3.4 das pendencias consolidadas (app #5 e #6): o consentimento
-- volta a ser um ciclo, e o titular le o que aceitou.
-- Design e racional: supera-docs/ADRs/ADR-025 — Ciclo do pedido do titular e exportacao.md


-- ============================================================
-- 1. Reaceite depois de revogar (3.2, app #5)
-- ============================================================
--
-- O FURO: `uq_consent_records UNIQUE (account_id, document_version_id)` valia
-- tambem para a linha revogada. Quem revogava os termos v1 e voltava ao app
-- nao conseguia aceitar a mesma v1 de novo — `accept_legal_terms` batia no
-- `ON CONFLICT DO NOTHING`, devolvia 0 e o app ficava preso na tela de aceite
-- para sempre. Nenhum erro, so o zero.
--
-- A regra que o indice deveria dizer e mais estreita: **no maximo um aceite
-- VIGENTE por conta e versao**. A revogacao continua sendo fato datado na linha
-- antiga — ela nao e reescrita —, e o reaceite e linha nova, com a sua data.
-- O historico passa a contar "aceitou, revogou, aceitou de novo", que e o que
-- aconteceu.
--
-- O indice parcial e ao mesmo tempo o arbitro do `ON CONFLICT` abaixo: o
-- Postgres infere o indice pela lista de colunas MAIS o predicado.

ALTER TABLE public.consent_records DROP CONSTRAINT uq_consent_records;

CREATE UNIQUE INDEX uq_consent_records_active
  ON public.consent_records (account_id, document_version_id)
  WHERE revoked_at IS NULL;

COMMENT ON INDEX public.uq_consent_records_active IS
  'Um aceite VIGENTE por conta e versao. A linha revogada fica como historico, e o reaceite e linha nova (app #5).';

-- Corpo novo, assinatura e ACL preservados. Continua idempotente no que
-- importa: reaceitar o que ja esta vigente nao duplica nem reescreve a data.
CREATE OR REPLACE FUNCTION public.accept_legal_terms()
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
  ON CONFLICT (account_id, document_version_id) WHERE revoked_at IS NULL DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;


-- ============================================================
-- 2. O titular le a versao que aceitou (3.4, app #6)
-- ============================================================
--
-- `legal_document_versions_select_current` so mostrava a vigente. No dia em que
-- a v2 fosse publicada, a v1 sumia para quem a aceitou — o aceite continuava
-- la, apontando para um texto que o proprio titular nao conseguia mais abrir.
-- A prova do que ele consentiu ficava so com a administracao.
--
-- Politica ADITIVA: a versao citada em algum aceite da propria conta,
-- revogado ou nao — o aceite revogado tambem e algo que o titular precisa
-- poder reler. A subconsulta roda sob a RLS de `consent_records`, que ja
-- restringe ao titular (`consent_records_select_own`); nao ha recursao, porque
-- a politica de `consent_records` nao consulta `legal_document_versions`.
--
-- O cuidador nao ganha nada aqui: o aceite e da conta, e ele so le os proprios.

CREATE POLICY legal_document_versions_select_accepted ON public.legal_document_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.consent_records c
       WHERE c.document_version_id = legal_document_versions.id
         AND c.account_id = (SELECT public.get_my_uid())
    )
  );

-- O indice que a subconsulta usa por versao; o de conta ja existe
-- (idx_consent_records_account_id), e o parcial acima nao serve a linha
-- revogada.
CREATE INDEX idx_consent_records_version
  ON public.consent_records (document_version_id, account_id);


-- ============================================================
-- 3. Privilegios — CREATE OR REPLACE preserva o ACL; repetir e barato
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.accept_legal_terms() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_legal_terms() TO authenticated;
