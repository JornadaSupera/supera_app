-- VALIDATE da constraint que create_conversation_transfer_notices criou NOT
-- VALID: designacao encerrada <=> designacao com motivo.
-- Plano das pendencias do painel de 30/09/2026, Fase H, item H.3.
--
-- O backfill da migration anterior deu motivo a toda designacao ja encerrada,
-- e a asserção do fim dela confere. O VALIDATE fica em migration propria pelo
-- padrao do projeto: SHARE UPDATE EXCLUSIVE, sem bloquear escrita, numa
-- transacao que nao carrega o resto da fase.

ALTER TABLE public.conversation_assignments
  VALIDATE CONSTRAINT ck_conversation_assignments_release_reason;
