-- VALIDATE das duas constraints que refine_notification_types criou NOT VALID,
-- em migration propria, como manda o padrao da casa (ADR-006): na mesma
-- transacao do ADD, o VALIDATE seguraria o lock que o NOT VALID existe para
-- evitar.
--
-- Depois do VALIDATE, `audience` vira NOT NULL de verdade. O Postgres 12+ usa a
-- CHECK valida (`audience IS NOT NULL AND …`) como prova e nao varre a tabela
-- de novo; e o NOT NULL no catalogo e o que faz o gerador de tipos do Supabase
-- dizer `string` em vez de `string | null` ao front-end.

ALTER TABLE public.notification_types VALIDATE CONSTRAINT ck_notification_types_audience;
ALTER TABLE public.notification_types VALIDATE CONSTRAINT ck_notification_types_category;

ALTER TABLE public.notification_types ALTER COLUMN audience SET NOT NULL;
