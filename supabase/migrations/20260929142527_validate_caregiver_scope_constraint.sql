-- VALIDATE da constraint que apply_caregiver_scopes_to_notifications criou
-- NOT VALID, em migration propria, como manda o padrao da casa (ADR-006): na
-- mesma transacao do ADD, o VALIDATE seguraria o lock que o NOT VALID existe
-- para evitar.
--
-- A regra: tipo da equipe (audience = 'team') nunca tem area do acompanhante.
-- O atalho da equipe nas politicas de notifications pressupoe isso.

ALTER TABLE public.notification_types VALIDATE CONSTRAINT ck_notification_types_caregiver_scope;
