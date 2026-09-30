-- A fila de envio de notificacoes nunca funcionou para o papel que vai opera-la.
--
-- ACHADO na validacao HTTP da Fase 1 (25/09/2026), chamando a fila pelo
-- supabase-js com a chave secreta: `claim_notification_deliveries` morre com
-- "permission denied for function recipient_still_eligible".
--
-- A CAUSA e de create_notifications (28/08/2026), nao da Fase 1. A fila e
-- SECURITY INVOKER de proposito ("quem chama e decidido por privilegio"), e
-- portanto roda como service_role. Ela chama private.recipient_still_eligible,
-- cujo EXECUTE foi revogado de PUBLIC e concedido a ninguem. O helper e
-- SECURITY DEFINER, mas o Postgres confere o EXECUTE de quem CHAMA antes de
-- trocar de papel.
--
-- POR QUE A SUITE NAO VIU: notifications.test.sql chama a fila como `postgres`,
-- que e dono do helper. O papel que vai chamar de verdade, service_role, nunca
-- teve uma unica assercao. A Edge Function do envio de push (Fase 2.3) teria
-- esbarrado nisto na primeira chamada.

GRANT EXECUTE ON FUNCTION private.recipient_still_eligible(uuid) TO service_role;

DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege('service_role',
         'private.recipient_still_eligible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role continua sem EXECUTE em recipient_still_eligible';
  END IF;
  -- O outro lado: o helper devolve elegibilidade de qualquer notificacao, e
  -- usuario da API nao tem por que consulta-lo.
  IF pg_catalog.has_function_privilege('authenticated',
         'private.recipient_still_eligible(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon',
         'private.recipient_still_eligible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'recipient_still_eligible alcancavel por usuario da API';
  END IF;
END;
$$;
