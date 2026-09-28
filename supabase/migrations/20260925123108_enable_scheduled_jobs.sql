-- Fase 2.1 das pendencias consolidadas (app #8): rotinas agendadas.
--
-- O banco tinha tres produtores esperando relogio e nenhum relogio: o lembrete
-- de compromisso (24 h e 2 h), a fila de push e, adiante, o disparo do NPS de
-- meio e fim de tratamento. `pg_cron` e o relogio; `pg_net` e o unico jeito de
-- uma rotina agendada chamar a Edge Function de envio sem servidor proprio.
--
-- ONDE CADA UMA MORA, como a documentacao do Supabase pede:
--   * pg_cron em pg_catalog — nao e relocavel, e o schema `cron` nasce junto;
--   * pg_net em `extensions`, como citext e pgcrypto (add_extensions). As
--     funcoes dele vivem no schema `net`, que a propria extensao cria.
--
-- RESIDUO QUE NENHUMA MIGRATION FECHA, medido no stack local em 25/09/2026:
-- ao instalar o pg_net, o Supabase concede USAGE em `net` e EXECUTE em
-- `net.http_get`/`net.http_post` a anon e authenticated. Quem concede e
-- `supabase_admin`, e um REVOKE como `postgres` e no-op com WARNING — a
-- armadilha 4 do CLAUDE.md. O risco e contido porque `net` NAO esta entre os
-- schemas expostos pela API (config.toml: public e graphql_public) e nenhuma
-- funcao nossa repassa URL vinda do usuario ao pg_net. Duas regras seguem
-- disto, e a suite mede a primeira: `net` nunca entra em `api.schemas`, e
-- nenhuma funcao alcancavel por authenticated chama `net.*`.


-- ============================================================
-- 1. As extensoes
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;


-- ============================================================
-- 2. O historico do proprio relogio
-- ============================================================
--
-- `cron.job_run_details` guarda uma linha por execucao e nao se limpa sozinho.
-- A fila de push roda a cada minuto: 1.440 linhas por dia, para sempre. Sete
-- dias bastam para investigar uma rotina que parou; o resto e so volume.
-- (`net._http_response` ja expira sozinha, em 6 h, por configuracao do pg_net.)
--
-- cron.schedule com NOME e upsert: reaplicar a migration reescreve o job, nao
-- duplica.

SELECT cron.schedule(
  'purge-cron-history',
  '17 3 * * *',
  $$DELETE FROM cron.job_run_details WHERE end_time < pg_catalog.now() - interval '7 days'$$
);


-- ============================================================
-- 3. Asserção de efeito
-- ============================================================
--
-- Nenhum usuario da API agenda nada. `cron.schedule` tem EXECUTE para todos
-- por padrao, mas sem USAGE no schema `cron` a funcao nao e alcancavel — e e o
-- USAGE que se mede, nao o EXECUTE.

DO $$
BEGIN
  IF pg_catalog.has_schema_privilege('anon', 'cron', 'USAGE')
     OR pg_catalog.has_schema_privilege('authenticated', 'cron', 'USAGE') THEN
    RAISE EXCEPTION 'usuario da API alcanca o schema cron';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-cron-history') THEN
    RAISE EXCEPTION 'job purge-cron-history nao foi agendado';
  END IF;
END;
$$;
