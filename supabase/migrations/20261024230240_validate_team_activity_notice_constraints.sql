-- VALIDATE da constraint que create_team_activity_notices recriou NOT VALID:
-- a categoria do tipo de notificacao, agora com "privacy".
-- Pendencia [40] de 24/10/2026.
--
-- As linhas existentes sao todas de categorias que continuam validas. O
-- VALIDATE fica em migration propria pelo padrao do projeto: SHARE UPDATE
-- EXCLUSIVE, sem bloquear escrita, numa transacao que nao carrega o resto.

ALTER TABLE public.notification_types
  VALIDATE CONSTRAINT ck_notification_types_category;
