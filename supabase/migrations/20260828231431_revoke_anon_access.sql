-- Tira `anon` da superfície da API: privilégio, e não só RLS.
--
-- Achado por `supabase db advisors --type security` na primeira aplicação em
-- homologação (28/08/2026): 88 avisos — 44 funções `SECURITY DEFINER`
-- chamáveis sem login por /rest/v1/rpc/, e SELECT de `anon` em 33 tabelas.
--
-- NÃO HOUVE EXPOSIÇÃO, e isso foi medido antes de escrever qualquer linha:
-- nenhuma política é TO anon (pg_policies), e `SET ROLE anon` devolve zero
-- linhas em patients, specialties, symptoms e cid10. Nas funções, `auth.uid()`
-- é NULL fora de sessão, então todo predicado de RLS nega e todo
-- `IF ... IS NULL THEN RAISE` barra. A defesa em profundidade funcionou.
--
-- O que estava errado é a CAMADA em que a negativa acontecia. Em
-- set_account_active a única barreira era o IF no corpo; nas read_*, o
-- auth.uid() nulo. Barreira única é a que a próxima refatoração remove sem
-- ninguém perceber — e 44 funções SECURITY DEFINER numa superfície pública é
-- o achado que qualquer pentest de homologação reporta como severo, com razão,
-- mesmo devolvendo vazio.
--
-- A CAUSA: o Supabase instala
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS / ALL ON TABLES TO anon, authenticated, service_role;
-- Toda função e toda tabela criada em `public` nasce alcançável por `anon`. O
-- `REVOKE ... FROM PUBLIC` que este projeto faz em toda migration NÃO desfaz
-- isso: `PUBLIC` é o pseudo-papel "todo mundo"; `anon` é papel NOMEADO, com
-- concessão própria. As duas linhas convivem no mesmo `proacl` sem se anular.
--
-- DUAS ARMADILHAS MEDIDAS, e ambas moldam o formato desta migration:
--
--   1. REVOKE não atinge concessão de OUTRO concedente. As 15 read_* registram
--      `anon=X/clinical_reader` — quem concedeu foi o DONO, no instante do
--      `ALTER FUNCTION ... OWNER TO`, pelo default privilege do novo dono.
--      Rodando como `postgres`, o REVOKE nelas é NO-OP SILENCIOSO: não levanta
--      erro, não muda nada, e has_function_privilege segue true. É preciso
--      revogar COMO clinical_reader — e `postgres` recebeu esse papel
--      WITH SET TRUE em create_clinical_read_audit exatamente para isso.
--
--   2. Revogar só de `anon` não basta. Sobra `=X/clinical_reader` no acl (a
--      concessão a PUBLIC, reintroduzida pela troca de dono DEPOIS do
--      `REVOKE ... FROM PUBLIC` daquela migration), e `anon` a herda. Toda
--      revogação aqui é `FROM PUBLIC, anon`.
--
-- SOBRE O FORMATO: esta migration NÃO usa blocos EXCEPTION tolerantes. Uma
-- versão anterior usou, por um diagnóstico que uma sonda desmentiu — eu havia
-- concluído que `supabase db push` aplicava sob papel de privilégio menor que
-- `postgres`. É falso: `session_user` é `cli_login_postgres`, mas a CLI faz
-- SET ROLE e `current_user` é `postgres`, dono das tabelas. O que houve foi
-- que o bloco tolerante capturou 33 erros e os engoliu — RAISE NOTICE não
-- retorna no output do `db push`, e "aplicado com sucesso" significava 33
-- tabelas intocadas.
--
-- HISTÓRICO DESTA MIGRATION, porque o remoto guarda vestígio dela: a
-- investigação produziu três migrations (revoke_anon_execute, probe_apply_role
-- e revoke_anon_tables), aplicadas em homologação e depois consolidadas neste
-- arquivo via `supabase migration repair` — as três marcadas `reverted`, esta
-- `applied`. O repair alinha o HISTÓRICO, não o esquema: as duas tabelas de
-- diagnóstico que aquelas migrations criaram (`_probe_apply_role` e
-- `_revoke_anon_tables_report`) permanecem no banco de homologação, órfãs, e
-- são removidas MANUALMENTE fora do versionamento. Em ambiente novo elas nunca
-- existem — um `db reset` a partir deste arquivo não as cria.
--
-- LIÇÃO QUE VALE PARA TODA MIGRATION FUTURA DESTE PROJETO: bloco tolerante que
-- só emite NOTICE é indistinguível de sucesso. Se a tolerância for mesmo
-- necessária, o resultado tem de ser verificado — e é o que a seção 5 faz,
-- levantando exceção. "Aplicou sem erro" tem de significar "anon está
-- fechado", não "as exceções foram capturadas com elegância".


-- ============================================================
-- 1. O default privilege — a raiz, e a única parte que impede a recaída
-- ============================================================
--
-- Sem isto, as seções 2 a 4 limpam o passado e a PRÓXIMA migration recria o
-- buraco em silêncio.
--
-- FOR ROLE: o default só se altera para o papel que concede. A entrada de
-- `postgres` é alcançável daqui; há uma segunda, concedida por
-- `supabase_admin`, que NENHUMA migration alcança — e é por isso que a
-- verificação da seção 5 mede o EFEITO no papel, não a configuração.

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL     ON TABLES    FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL     ON SEQUENCES FROM anon;


-- ============================================================
-- 2. As funções de `public` cujo dono é quem aplica esta migration
-- ============================================================
--
-- Escopo por DONO, e não `ON ALL FUNCTIONS`: em bloco, a primeira função de
-- outro dono aborta a migration inteira. Filtrar por `relowner = current_user`
-- exclui por construção o que não é nosso, em vez de tropeçar nisso em runtime.

DO $$
DECLARE
  v_fn record;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_catalog.pg_proc      p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND pg_catalog.pg_get_userbyid(p.proowner) = current_user
  LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_fn.sig);
  END LOOP;
END;
$$;

-- Devolve o que o REVOKE de PUBLIC tira de quem PRECISA. uuid_generate_v7 é
-- DEFAULT de PK (exigido de quem INSERE) e get_my_uid entra em política de RLS
-- (exigido de quem CONSULTA). Sem estes dois GRANTs, o sistema inteiro quebra:
-- é a armadilha que o CLAUDE.md documenta, reaparecendo aqui por efeito
-- colateral e não por descuido de quem escreveu as originais.
GRANT EXECUTE ON FUNCTION public.uuid_generate_v7() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_uid()       TO authenticated;


-- ============================================================
-- 3. As funções read_*, que pertencem ao clinical_reader
-- ============================================================
--
-- A armadilha nº 1 da abertura: só o concedente revoga. `postgres` é membro de
-- clinical_reader com SET TRUE / INHERIT FALSE — precisa de SET ROLE explícito,
-- ser membro não basta.
--
-- Filtra por dono DENTRO do bloco pela mesma razão da seção 2: como
-- clinical_reader, um `ON ALL FUNCTIONS` tentaria revogar nas 34 que ele não
-- possui e morreria em "permission denied for function uuid_generate_v7".
--
-- RESET ROLE em EXCEPTION também: sem ele, o papel vaza para o resto da
-- migration e o primeiro comando que dependa de uuid_generate_v7 morre por
-- privilégio. Medido.

DO $$
DECLARE
  v_fn record;
BEGIN
  SET LOCAL ROLE clinical_reader;

  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_catalog.pg_proc      p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_roles     r ON r.oid = p.proowner
     WHERE n.nspname = 'public'
       AND r.rolname = 'clinical_reader'
  LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_fn.sig);
  END LOOP;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END;
$$;


-- ============================================================
-- 4. As tabelas e sequências
-- ============================================================
--
-- 33 tabelas com SELECT para `anon`. As quatro migrations mais recentes já
-- revogavam tabela a tabela; as sete primeiras não — o cuidado entrou no meio
-- do projeto e nunca retroagiu. Este loop cobre as duas metades e passa a
-- valer para o que vier.
--
-- ALL e não SELECT: `anon` não escreve, não apaga e não referencia nada em
-- cenário nenhum deste sistema. Não existe leitura pública no Jornada Supera —
-- nem o catálogo de especialidades, porque a tela de login não lista equipe.

DO $$
DECLARE
  v_rel record;
BEGIN
  FOR v_rel IN
    SELECT c.oid::regclass AS rel
      FROM pg_catalog.pg_class     c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','v','m','p')
       AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON %s FROM PUBLIC, anon', v_rel.rel);
  END LOOP;
END;
$$;

DO $$
DECLARE
  v_seq record;
BEGIN
  FOR v_seq IN
    SELECT c.oid::regclass AS seq
      FROM pg_catalog.pg_class     c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'S'
       AND pg_catalog.pg_get_userbyid(c.relowner) = current_user
  LOOP
    EXECUTE pg_catalog.format('REVOKE ALL ON SEQUENCE %s FROM PUBLIC, anon', v_seq.seq);
  END LOOP;
END;
$$;


-- ============================================================
-- 5. A verificação que FALHA a migration se o objetivo não foi atingido
-- ============================================================
--
-- Mede `has_*_privilege`, o EFEITO no papel — não a execução dos comandos
-- acima, que seria auto-referente. É o que torna esta seção imune tanto à
-- entrada de pg_default_acl concedida por supabase_admin, que nenhuma migration
-- alcança, quanto às duas armadilhas de concedente da abertura.
--
-- Sem esta seção, a migration repetiria o defeito que ela existe para corrigir.

DO $$
DECLARE
  v_fn  int;
  v_tab int;
  v_lista text;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_catalog.pg_proc      p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE');

  SELECT count(*), coalesce(string_agg(c.relname, ', ' ORDER BY c.relname), '')
    INTO v_tab, v_lista
    FROM pg_catalog.pg_class     c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind IN ('r','v','m','p')
     AND pg_catalog.has_table_privilege('anon', c.oid, 'SELECT');

  IF v_fn > 0 OR v_tab > 0 THEN
    RAISE EXCEPTION 'anon ainda alcanca % funcao(oes) e % tabela(s) de public: %',
      v_fn, v_tab, v_lista
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

-- Contrapartida: o que `authenticated` PRECISA continuar tendo. Um REVOKE de
-- PUBLIC bem-sucedido que derrubasse estes dois deixaria o banco de pé e o
-- sistema inteiro quebrado — todo INSERT sem DEFAULT de PK, toda política sem
-- get_my_uid. Falhar aqui é infinitamente melhor que descobrir na homologação.
DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em uuid_generate_v7 ou get_my_uid'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;


-- ============================================================
-- 6. A lacuna de teste que permitiu isto
-- ============================================================
--
-- 18 migrations e ~700 asserções cobrindo `authenticated`, `service_role` e
-- `clinical_reader`. NENHUMA cobrindo `anon` — e por isso o furo atravessou o
-- projeto inteiro sem disparar nada. O advisor achou no primeiro contato com o
-- ambiente hospedado o que a suíte não procurava.
--
-- A asserção que falta não é "anon lê zero linhas" (já era verdade, por RLS, e
-- continuaria verdade com o privilégio aberto): é "anon NÃO TEM privilégio",
-- que falha no dia em que alguém criar função ou tabela nova em `public` e o
-- default privilege do supabase_admin reabrir a porta.
--
-- Contrato para a suíte pgTAP:
--
--   SELECT is_empty($$
--     SELECT p.proname FROM pg_proc p
--       JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public'
--        AND has_function_privilege('anon', p.oid, 'EXECUTE')
--   $$, 'nenhuma funcao de public e executavel por anon');
--
--   SELECT is_empty($$
--     SELECT c.relname FROM pg_class c
--       JOIN pg_namespace n ON n.oid = c.relnamespace
--      WHERE n.nspname = 'public' AND c.relkind IN ('r','v')
--        AND has_table_privilege('anon', c.oid, 'SELECT')
--   $$, 'nenhuma tabela de public e legivel por anon');
--
-- NÃO se asserta ausência de USAGE em `public`: o `nspacl` mostra
-- `=U/pg_database_owner` — o USAGE de anon vem de PUBLIC, concedido por
-- pg_database_owner. Revogá-lo exigiria assumir esse papel e atingiria TODOS
-- os papéis, `authenticated` inclusive. USAGE sem objeto alcançável não
-- concede nada; trocá-lo por risco de indisponibilidade seria mau negócio.
