-- Fase 1.5 das pendencias consolidadas (app #21): menor privilegio.
--
-- NADA DISTO ERA EXPLORAVEL HOJE, e isso foi o ponto de partida, nao a
-- conclusao: das tres funcoes, uma so faz sentido como trigger e duas batem
-- numa tabela sem politica; as tabelas nao tem politica de escrita — a RLS
-- nega. O defeito e
-- a CAMADA da negativa, o mesmo de revoke_anon_access: barreira unica e a que
-- a proxima refatoracao remove sem ninguem perceber. Uma politica de INSERT
-- escrita amanha para outro fim, numa tabela onde `authenticated` ja tem o
-- privilegio, abre a escrita no mesmo instante; sem o privilegio, a mesma
-- politica levanta "permission denied" e alguem pergunta por que.
--
-- A ORIGEM do privilegio e o default do Supabase (armadilha nº 5 do CLAUDE.md):
-- toda tabela e toda funcao em `public` nasce com ALL/EXECUTE para anon,
-- authenticated e service_role. As migrations deste projeto revogaram `anon`
-- em toda parte, mas `authenticated` ficou com INSERT/UPDATE/DELETE/TRUNCATE
-- nas tabelas cuja escrita sempre foi por RPC. TRUNCATE merece nota: ele NAO
-- passa pela RLS. O PostgREST nao o expoe, entao nao ha caminho hoje — mas e o
-- privilegio mais perigoso de deixar sobrando numa tabela de paciente.
--
-- service_role NAO e tocado: e o papel das rotinas privilegiadas (eliminacao
-- da ADR-005, sincronizacao Gemed), e a regra de negocio que vale para ele mora
-- em trigger, nao em privilegio.


-- ============================================================
-- 1. Funcoes que o usuario nunca deveria chamar
-- ============================================================
--
-- handle_new_auth_user: funcao de TRIGGER em auth.users. O Postgres so confere
-- EXECUTE de funcao de trigger no CREATE TRIGGER, nunca no disparo — entao
-- revogar de todos nao afeta o cadastro. A irma handle_auth_user_confirmed ja
-- nasceu assim (bootstrap_first_admin).
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- A fila de envio de notificacoes e da Edge Function (service_role). As duas
-- sao SECURITY INVOKER e notification_deliveries nao tem politica nenhuma, entao
-- um usuario logado que as chamasse atualizaria zero linhas. Mas
-- create_notifications declarou que "quem pode chamar e decidido por
-- privilegio, nao por um IF no corpo" — e o default privilege desmentia isso em
-- silencio. Se um dia alguem der a fila uma politica (para o painel ver o
-- estado do envio, por exemplo), a reivindicacao de entregas alheias abriria
-- junto.
REVOKE EXECUTE ON FUNCTION public.claim_notification_deliveries(smallint)
  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_delivery_result(uuid, public.notification_delivery_status, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 2. Tabelas escritas so por RPC
-- ============================================================
--
-- Nenhuma delas tem politica de INSERT/UPDATE/DELETE para usuario; toda escrita
-- vem de funcao SECURITY DEFINER, que roda como o dono e nao depende deste
-- privilegio.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON
  public.patients,
  public.admins,
  public.caregivers,
  public.patient_caregivers,
  public.caregiver_invitations,
  public.professionals,
  public.professional_specialties,
  public.permissions,
  public.specialties
FROM PUBLIC, anon, authenticated;

-- accounts e a excecao da lista: o dono atualiza full_name e phone por
-- GRANT de COLUNA (create_identity_core). REVOKE UPDATE em nivel de tabela
-- levaria as concessoes de coluna junto — por isso UPDATE fica fora daqui.
REVOKE INSERT, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.accounts
FROM PUBLIC, anon, authenticated;


-- ============================================================
-- 3. TRUNCATE em TODAS as tabelas — o achado que a lista nao tinha
-- ============================================================
--
-- MEDIDO no stack local antes desta secao existir: depois do §2, nenhuma
-- tabela de `public` dava a authenticated INSERT/UPDATE/DELETE sem politica
-- correspondente — as migrations anteriores ja tinham fechado isso tabela a
-- tabela. Mas TODAS as 53 davam TRUNCATE. Nenhuma politica cobre TRUNCATE (o
-- comando nao existe em CREATE POLICY) e ele nao passa pela RLS: dentro de uma
-- transacao revertida, `SET ROLE authenticated; TRUNCATE public.audit_log`
-- APAGOU a trilha. O PostgREST nao expoe TRUNCATE, entao nao ha caminho hoje;
-- e ainda assim o privilegio de apagar a trilha de auditoria de uma vez, na
-- mao do papel de todo usuario logado.
--
-- REFERENCES e TRIGGER vao junto: nenhum dos dois serve a usuario da API.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public
FROM PUBLIC, anon, authenticated;

-- E a raiz, sem a qual a proxima tabela nasce com o mesmo privilegio
-- (armadilha nº 5). So se altera o default que `postgres` concede; a entrada
-- de `supabase_admin` nenhuma migration alcanca, e e por isso que a suite mede
-- o efeito em toda tabela, nao esta configuracao.
--
-- INSERT/UPDATE/DELETE continuam no default DE PROPOSITO: toda tabela com
-- escrita direta (diario, mensagem, preferencias...) depende deles, e tira-los
-- do default mudaria a convencao de toda migration futura. O que sai e so o que
-- nenhuma politica jamais cobre.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM PUBLIC, anon, authenticated;

-- A trilha e append-only por trigger (UPDATE/DELETE), e o trigger vale para
-- service_role — mas nunca cobriu TRUNCATE, que nao dispara trigger de linha.
-- service_role nem tem DELETE na trilha e tinha TRUNCATE. Um trigger por
-- COMANDO fecha o ultimo caminho, para qualquer papel.
CREATE TRIGGER trg_audit_log_no_truncate
BEFORE TRUNCATE ON public.audit_log
FOR EACH STATEMENT EXECUTE FUNCTION private.reject_audit_log_mutation();


-- ============================================================
-- 4. Asserção de efeito — os dois lados
-- ============================================================
DO $$
DECLARE
  v_tabela text;
  v_priv   text;
BEGIN
  SELECT pg_catalog.string_agg(c.relname, ', ') INTO v_tabela
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
     AND ( pg_catalog.has_table_privilege('authenticated', c.oid, 'TRUNCATE')
        OR pg_catalog.has_table_privilege('anon',          c.oid, 'TRUNCATE') );
  IF v_tabela IS NOT NULL THEN
    RAISE EXCEPTION 'TRUNCATE ainda alcancavel por usuario da API em: %', v_tabela;
  END IF;

  FOREACH v_tabela IN ARRAY ARRAY[
    'public.patients', 'public.admins', 'public.caregivers',
    'public.patient_caregivers', 'public.caregiver_invitations',
    'public.professionals', 'public.professional_specialties',
    'public.permissions', 'public.specialties', 'public.accounts'
  ] LOOP
    FOREACH v_priv IN ARRAY ARRAY['INSERT', 'DELETE', 'TRUNCATE'] LOOP
      IF pg_catalog.has_table_privilege('authenticated', v_tabela, v_priv) THEN
        RAISE EXCEPTION 'authenticated ainda tem % em %', v_priv, v_tabela;
      END IF;
    END LOOP;
    IF v_tabela <> 'public.accounts'
       AND pg_catalog.has_table_privilege('authenticated', v_tabela, 'UPDATE') THEN
      RAISE EXCEPTION 'authenticated ainda tem UPDATE em %', v_tabela;
    END IF;
    -- A leitura NAO pode ter ido junto: as politicas de SELECT dependem dela.
    IF NOT pg_catalog.has_table_privilege('authenticated', v_tabela, 'SELECT') THEN
      RAISE EXCEPTION 'authenticated PERDEU SELECT em % — a RLS de leitura ficaria inalcancavel', v_tabela;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_column_privilege('authenticated', 'public.accounts', 'full_name', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated perdeu UPDATE (full_name) em accounts — o perfil do app deixaria de salvar';
  END IF;

  IF pg_catalog.has_function_privilege('authenticated', 'public.claim_notification_deliveries(smallint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ainda reivindica entregas de notificacao';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', 'public.claim_notification_deliveries(smallint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu claim_notification_deliveries — o envio de push pararia';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role',
         'public.mark_delivery_result(uuid, public.notification_delivery_status, text, text, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu mark_delivery_result';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'public.handle_new_auth_user()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ainda executa handle_new_auth_user';
  END IF;
END;
$$;
