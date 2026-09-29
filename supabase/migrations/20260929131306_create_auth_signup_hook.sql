-- O Auth passa a recusar conta criada sem e-mail. Pendencia 26.1, de 28/09/2026.
--
-- O RISCO: o login por telefone foi ligado em homologacao em 28/09/2026 para
-- confirmar o celular de quem ja tem conta. Mas o mesmo endpoint cria conta:
-- `signInWithOtp({ phone })` com a chave publica, para um numero que o Auth
-- nao conhece, tenta criar um usuario sem e-mail e enviar um SMS PAGO pela
-- CEON. Qualquer pessoa, sem login, com a chave que esta dentro do app.
--
-- O QUE SE MEDIU ANTES DE CORRIGIR (29/09/2026, stack local com SMS ligado):
-- sem o hook, a criacao ja falhava — por acidente. O trigger
-- trg_handle_new_auth_user copia o e-mail para `accounts.email`, que e
-- NOT NULL; a transacao do Auth desfaz o usuario e o Twilio nao e chamado.
-- Homologacao confirma: 0 contas sem e-mail em auth.users. Mas a resposta ao
-- anonimo era um 500 com o erro cru do Postgres — nome da tabela, da coluna e
-- a linha inteira, telefone incluso. E a protecao dependia de uma constraint
-- escrita para outra coisa: quem a afrouxasse abriria o SMS pago sem saber.
--
-- A CORRECAO: o hook *Before User Created* roda antes de o Auth gravar o
-- usuario nos caminhos PUBLICOS de criacao (`/signup`, `/otp`, OAuth) e pode
-- recusar — com 403 `email_required`, antes de tocar no banco e no SMS.
-- Medido: o admin API (`auth.admin.createUser`, service_role) NAO passa pelo
-- hook; quem o usa (`create-caregiver`, `scripts/seed-admin.mjs`) sempre
-- manda e-mail, e o `NOT NULL` de `accounts` continua de guarda ali.
--
-- Todos os caminhos publicos legitimos trazem e-mail: cadastro por e-mail e
-- senha, Google e Apple (a Apple manda o e-mail de retransmissao quando a
-- pessoa o esconde). So a criacao por telefone chega sem ele.
--
-- O QUE O HOOK NAO FAZ: nao roda em ATUALIZACAO de usuario. Confirmar o
-- celular de conta existente (`updateUser({ phone })`) continua funcionando —
-- e continua disparando SMS. Isso nao fecha o *SMS pumping*: qualquer conta
-- com e-mail pode pedir SMS para um numero qualquer. As defesas contra isso
-- sao de configuracao da CEON (Geo Permissions do Twilio so para +55, limites
-- de SMS do Auth, CAPTCHA), fora de migration.
--
-- A ATIVACAO e configuracao do Auth, nao do banco: `supabase/config.toml` no
-- local, e o painel (Auth -> Hooks) no remoto. Sem ela a funcao existe e
-- ninguem a chama.


-- ============================================================
-- 1. O hook
-- ============================================================
--
-- SECURITY INVOKER basta: roda como supabase_auth_admin e nao le tabela
-- nenhuma — decide so pelo evento que o Auth entrega.
--
-- `user.email` chega como string vazia (e nao nulo) quando o usuario nao tem
-- e-mail; as duas formas, e a de so espacos, sao recusadas.
--
-- A mensagem e um CODIGO, no padrao das RPCs: o app decide o texto da tela.

CREATE FUNCTION private.before_user_created(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
BEGIN
  IF pg_catalog.btrim(coalesce(event -> 'user' ->> 'email', '')) = '' THEN
    RETURN pg_catalog.jsonb_build_object('error', pg_catalog.jsonb_build_object(
      'http_code', 403,
      'message',   'email_required'));
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

COMMENT ON FUNCTION private.before_user_created(jsonb) IS
  'Hook Before User Created do Auth: recusa (403 email_required) a criacao de conta sem e-mail — fecha o signup publico por telefone (SMS pago, sem login) antes de tocar no banco. Pendencia 26.1, 29/09/2026.';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- O Auth chama a funcao como supabase_auth_admin, que precisa de USAGE no
-- schema e de EXECUTE nela. O USAGE em `private` abriria as outras funcoes do
-- schema se alguma tivesse EXECUTE para PUBLIC — nenhuma tem desde
-- create_identity_core, e a assercao abaixo mede isso em vez de presumir.
--
-- Ninguem mais chama o hook: nem anon, nem authenticated, nem service_role.
-- Em `private` o default privilege do Supabase nao se aplica, mas o do
-- Postgres da EXECUTE a PUBLIC em toda funcao nova (armadilha 2 e 3).

GRANT USAGE ON SCHEMA private TO supabase_auth_admin;

REVOKE EXECUTE ON FUNCTION private.before_user_created(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT  EXECUTE ON FUNCTION private.before_user_created(jsonb) TO supabase_auth_admin;


-- ============================================================
-- 3. Assercao de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_leak text;
BEGIN
  -- O lado que nao pode perder: sem EXECUTE, o Auth falha TODA criacao de
  -- conta com erro de hook, inclusive as legitimas.
  IF NOT pg_catalog.has_function_privilege('supabase_auth_admin', 'private.before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'supabase_auth_admin ficou SEM EXECUTE no hook: nenhuma conta seria criada';
  END IF;
  IF NOT pg_catalog.has_schema_privilege('supabase_auth_admin', 'private', 'USAGE') THEN
    RAISE EXCEPTION 'supabase_auth_admin ficou SEM USAGE em private: nenhuma conta seria criada';
  END IF;

  -- O lado que nao pode ganhar.
  IF pg_catalog.has_function_privilege('anon', 'private.before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca o hook';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'private.before_user_created(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated alcanca o hook';
  END IF;

  -- O USAGE novo nao pode ter aberto o resto de `private` ao Auth.
  SELECT pg_catalog.string_agg(p.oid::regprocedure::text, ', ')
    INTO v_leak
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'private'
     AND p.proname <> 'before_user_created'
     AND pg_catalog.has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE');
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'supabase_auth_admin alcanca outras funcoes de private: %', v_leak;
  END IF;

  SELECT pg_catalog.string_agg(c.relname, ', ')
    INTO v_leak
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'private'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'S')
     AND pg_catalog.has_table_privilege('supabase_auth_admin', c.oid, 'SELECT, INSERT, UPDATE, DELETE');
  IF v_leak IS NOT NULL THEN
    RAISE EXCEPTION 'supabase_auth_admin alcanca relacoes de private: %', v_leak;
  END IF;
END;
$$;
