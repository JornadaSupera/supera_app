-- Fase 2.3 das pendencias consolidadas (app #10, painel T-4): o push sai do
-- banco.
--
-- A Edge Function `send-push` (supabase/functions/send-push) consome a fila
-- com service_role: claim_notification_deliveries -> OneSignal ->
-- mark_delivery_result. Esta migration e a outra metade: o RELOGIO que a
-- chama a cada minuto, por pg_cron + pg_net.
--
-- ONDE MORAM A URL E O SEGREDO: no Supabase Vault, nunca na migration.
--   push_dispatch_url     URL completa da funcao
--                         (https://<ref>.supabase.co/functions/v1/send-push)
--   push_dispatch_secret  segredo compartilhado; a funcao o confere no header
--                         x-dispatch-secret contra a secret PUSH_DISPATCH_SECRET
-- A funcao roda com verify_jwt = false (config.toml): quem a chama e o banco,
-- que nao tem JWT de usuario, e o portao e o segredo. A chave do OneSignal NAO
-- passa pelo banco — vive so nas secrets da Edge Function.
--
-- SEM OS DOIS SEGREDOS, A ROTINA NAO FAZ NADA, e isso e o comportamento
-- correto: homologacao sem credencial do OneSignal continua enfileirando, a
-- caixa de entrada continua funcionando, e nenhum fluxo trava esperando o
-- provedor. Mesmo principio do Gemed desligado. Ligar e um ato: criar os dois
-- segredos no Vault e as tres secrets na funcao (ver README §5.8).
--
-- SEM FILA, SEM CHAMADA: a rotina so faz a requisicao HTTP quando ha entrega
-- vencida ou lease expirado. Uma chamada por minuto a toa, 24 h por dia, seria
-- custo de invocacao sem nenhum push.


-- ============================================================
-- 1. O disparo
-- ============================================================

CREATE FUNCTION private.dispatch_push_deliveries()
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.notification_deliveries d
     WHERE (d.status = 'pending' AND d.next_attempt_at <= pg_catalog.now())
        OR (d.status = 'sending' AND d.updated_at < pg_catalog.now() - interval '10 minutes')
  ) THEN
    RETURN NULL;
  END IF;

  SELECT s.decrypted_secret INTO v_url
    FROM vault.decrypted_secrets s WHERE s.name = 'push_dispatch_url';
  SELECT s.decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets s WHERE s.name = 'push_dispatch_secret';

  IF v_url IS NULL OR v_secret IS NULL THEN
    RETURN NULL;
  END IF;

  -- Assincrono: o pg_net enfileira e envia depois do COMMIT. O minuto seguinte
  -- nao espera a funcao terminar, e duas execucoes simultaneas nao se pisam —
  -- a fila usa FOR UPDATE SKIP LOCKED.
  RETURN net.http_post(
    url                  := v_url,
    headers              := pg_catalog.jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-dispatch-secret', v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
END;
$$;

COMMENT ON FUNCTION private.dispatch_push_deliveries() IS
  'Rotina pg_cron (push-dispatch, a cada minuto). Chama a Edge Function send-push so se ha entrega vencida E os segredos push_dispatch_url/push_dispatch_secret existem no Vault. Sem eles, no-op.';

SELECT cron.schedule(
  'push-dispatch',
  '* * * * *',
  $$SELECT private.dispatch_push_deliveries()$$
);


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- A funcao le o Vault. Alcancavel por authenticated, ela seria um jeito de
-- disparar requisicoes com o segredo — e, pior, um oraculo de que ele existe.

REVOKE EXECUTE ON FUNCTION private.dispatch_push_deliveries() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('authenticated',
         'private.dispatch_push_deliveries()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
         'private.dispatch_push_deliveries()', 'EXECUTE') THEN
    RAISE EXCEPTION 'dispatch_push_deliveries alcancavel por usuario da API';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-dispatch') THEN
    RAISE EXCEPTION 'job push-dispatch nao foi agendado';
  END IF;
END;
$$;
