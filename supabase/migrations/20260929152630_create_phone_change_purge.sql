-- A limpeza das trocas de celular abandonadas. Pendencia 26.3, de 28/09/2026
-- (Fase D do plano de 29/09/2026). Racional: ADR-020, emenda §8.
--
-- POR QUE LIMPAR: com o Twilio Verify, o Auth nao confere
-- `phone_change_sent_at`. Um pedido abandonado ha meses continua confirmavel
-- por QUALQUER codigo novo enviado ao numero — o de outra pessoa, inclusive.
-- Passada a validade do codigo, o pedido ja nao serve ao proprio dono: so
-- serve de fantasma.
--
-- POR QUE 15 MINUTOS: validade do Verify (10 min, o padrao do Twilio,
-- confirmada em 29/09/2026) + 5 de margem. A regra e "validade + 5": se a validade mudar no
-- Twilio, este intervalo muda junto, por migration nova. Nao ha razao para os
-- 20 minutos do plano B: o registro da confirmacao (migration anterior) ja
-- guarda a evidencia da colisao, e a limpeza nao precisa segura-la.
--
-- O "VAZIO" DO AUTH: `phone_change` e `phone_change_token` tem default `''`,
-- nao NULL (medido em homologacao, 29/09/2026). A limpeza grava `''` nas duas
-- e NULL em `phone_change_sent_at`, que e o estado de uma conta que nunca
-- pediu troca.
--
-- PEDIDO SEM `phone_change_sent_at`: nao deveria existir (0 em homologacao).
-- Se aparecer, e fantasma sem idade — entra na limpeza.


-- ============================================================
-- 1. A funcao
-- ============================================================
--
-- Funcao, e nao SQL inline no cron: a suite chama. SECURITY DEFINER, dona
-- `postgres`, que tem UPDATE em auth.users (medido no fim, nao presumido).
-- `WHERE` sempre presente: o safeupdate recusaria o UPDATE sem ele, se um dia
-- a funcao for chamada pelo PostgREST.

CREATE FUNCTION private.purge_abandoned_phone_changes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE auth.users
     SET phone_change         = '',
         phone_change_token   = '',
         phone_change_sent_at = NULL
   WHERE coalesce(phone_change, '') <> ''
     AND (phone_change_sent_at IS NULL
          OR phone_change_sent_at < pg_catalog.now() - interval '15 minutes');
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.purge_abandoned_phone_changes() IS
  'Zera os pedidos de troca de celular nao confirmados com mais de 15 min (validade do Verify + 5). Devolve quantas contas limpou. Chamada pelo cron purge-abandoned-phone-changes a cada 5 min (ADR-020 §8).';


-- ============================================================
-- 2. O agendamento
-- ============================================================
--
-- cron.schedule com NOME e upsert: reaplicar reescreve o job, no padrao de
-- purge-patient-link-attempts.

SELECT cron.schedule(
  'purge-abandoned-phone-changes',
  '*/5 * * * *',
  $$SELECT private.purge_abandoned_phone_changes()$$
);


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.purge_abandoned_phone_changes() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_function_privilege(v_role, 'private.purge_abandoned_phone_changes()', 'EXECUTE') THEN
      RAISE EXCEPTION '% executa private.purge_abandoned_phone_changes', v_role;
    END IF;
  END LOOP;

  -- Medido, nao presumido: sem UPDATE em auth.users, o job falha a cada 5
  -- minutos em silencio, e os fantasmas ficam.
  IF NOT pg_catalog.has_table_privilege('postgres', 'auth.users', 'UPDATE') THEN
    RAISE EXCEPTION 'postgres nao atualiza auth.users — a limpeza nao roda';
  END IF;

  IF pg_catalog.pg_get_userbyid(
       (SELECT p.proowner FROM pg_catalog.pg_proc p
         WHERE p.oid = 'private.purge_abandoned_phone_changes()'::pg_catalog.regprocedure)
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'purge_abandoned_phone_changes precisa ser de postgres para atualizar auth.users';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job
                  WHERE jobname = 'purge-abandoned-phone-changes'
                    AND schedule = '*/5 * * * *'
                    AND active) THEN
    RAISE EXCEPTION 'rotina de limpeza das trocas de celular nao foi agendada';
  END IF;
END;
$$;
