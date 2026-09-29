-- O registro de cada confirmacao de celular, e se ela disputou o numero com
-- outra conta. Pendencia 26.3, de 28/09/2026 (Fase D do plano de 29/09/2026).
-- Racional: ADR-020, emenda §8 ("A confirmacao contestada").
--
-- O DEFEITO, medido no codigo do Supabase Auth (internal/api/verify.go e
-- internal/models/user.go):
--   * a confirmacao de troca procura a conta por
--     `SELECT * FROM users WHERE phone_change = ? ... LIMIT 1`, SEM ORDER BY;
--   * com o Twilio Verify (o provedor de homologacao, ADR-020 §7), o Auth nao
--     confere o hash da conta: pergunta ao Twilio se o codigo vale PARA O
--     NUMERO, e nao olha `phone_change_sent_at`;
--   * `IsDuplicatedPhone` so olha `phone`, nao `phone_change`.
-- Juntos: duas contas podem ficar pendentes para o mesmo numero, e o codigo
-- LEGITIMO de B confirma a conta A. A confirmacao carimba
-- `phone_confirmed_at`, que e exatamente a prova de posse que
-- link_patient_by_verified_phone aceita.
--
-- A DECISAO (D1, 29/09/2026): registrar a colisao NA HORA em que acontece.
-- Quando `phone_confirmed_at` muda, o trigger grava a confirmacao; se naquele
-- instante outra conta tinha `phone_change` igual ao numero, a confirmacao
-- fica `contested`. O registro e permanente e nao corre contra a limpeza dos
-- pedidos abandonados (migration seguinte). A ligacao recusa confirmacao
-- contestada (a outra migration seguinte).
--
-- FORMATO DO NUMERO: o Auth grava `phone` e `phone_change` no mesmo formato
-- (so digitos, sem `+`). A comparacao e crua, sem normalize_br_phone, porque
-- e a mesma comparacao que o proprio Auth faz no LIMIT 1.
--
-- NAO ENGOLIR ERRO: uma excecao aqui derruba o /verify. E o comportamento
-- certo — melhor o SMS falhar do que o celular ser confirmado sem registro.
-- Por isso a funcao e trivial: um SELECT e um INSERT.


-- ============================================================
-- 1. A tabela
-- ============================================================
--
-- `private`: so o trigger escreve e so a RPC da ligacao le. uuid v7, e nao
-- identity: a linha e evidencia de seguranca, e o id pode aparecer numa
-- investigacao ao lado dos da trilha.
--
-- FK para auth.users, e nao para accounts: o registro e do Auth, nasce no
-- trigger do Auth, e a linha em accounts pode ainda nao existir na ordem dos
-- triggers de INSERT. CASCADE: apagar a conta no Auth nao pode esbarrar num
-- carimbo tecnico (mesmo racional de patient_link_attempts).

CREATE TABLE private.phone_confirmations (
  id           uuid        PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id   uuid        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  phone        text        NOT NULL,
  confirmed_at timestamptz NOT NULL,
  contested    boolean     NOT NULL,
  -- as contas que tinham o mesmo numero pendente no instante da confirmacao
  contested_by uuid[]      NOT NULL DEFAULT '{}',
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT phone_confirmations_account_confirmed_key UNIQUE (account_id, confirmed_at),
  CONSTRAINT phone_confirmations_contested_consistent
    CHECK (contested = (pg_catalog.cardinality(contested_by) > 0))
);

COMMENT ON TABLE private.phone_confirmations IS
  'Uma linha por confirmacao de celular no Auth, gravada por trigger em auth.users. contested = outra conta tinha o mesmo numero em phone_change no instante da confirmacao (o Auth confirma qualquer uma delas). Lida por link_patient_by_verified_phone. ADR-020 §8.';

-- O UNIQUE (account_id, confirmed_at) e o indice da consulta da ligacao e
-- cobre a FK (coluna lider). Nenhum indice a mais.

-- RLS ligada e nenhuma politica: segunda porta fechada, como nas outras de
-- `private`.
ALTER TABLE private.phone_confirmations ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. A funcao do trigger
-- ============================================================
--
-- SECURITY DEFINER: dispara na transacao do Auth, como supabase_auth_admin,
-- que nao escreve em `private`. Dona `postgres` (asserido no fim).

CREATE FUNCTION private.record_phone_confirmation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_others uuid[];
BEGIN
  SELECT coalesce(pg_catalog.array_agg(u.id ORDER BY u.id), '{}')
    INTO v_others
    FROM auth.users u
   WHERE u.id <> NEW.id
     AND u.phone_change = NEW.phone;

  INSERT INTO private.phone_confirmations (account_id, phone, confirmed_at, contested, contested_by)
  VALUES (NEW.id, NEW.phone, NEW.phone_confirmed_at, pg_catalog.cardinality(v_others) > 0, v_others)
  ON CONFLICT (account_id, confirmed_at) DO NOTHING;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.record_phone_confirmation() IS
  'Trigger de auth.users: grava a confirmacao do celular em private.phone_confirmations, marcando contested quando outra conta tinha o mesmo numero em phone_change. Nao engole erro (ADR-020 §8).';


-- ============================================================
-- 3. Os triggers
-- ============================================================
--
-- DOIS, e nao um `INSERT OR UPDATE`: o Postgres nao aceita OLD no WHEN de um
-- trigger que tambem dispara em INSERT.
--
-- UPDATE: a TRANSICAO do carimbo, nao o estado. Sem o IS DISTINCT FROM, todo
-- login (que atualiza last_sign_in_at) nem dispararia — o OF ja filtra —, mas
-- um UPDATE que regrava o mesmo valor dispararia.
--
-- INSERT: conta criada ja confirmada (Admin API com `phone_confirm`) tambem
-- e uma confirmacao, e tem de deixar registro.

CREATE TRIGGER trg_record_phone_confirmation_update
AFTER UPDATE OF phone_confirmed_at ON auth.users
FOR EACH ROW
WHEN (
  NEW.phone_confirmed_at IS NOT NULL
  AND OLD.phone_confirmed_at IS DISTINCT FROM NEW.phone_confirmed_at
  AND coalesce(NEW.phone, '') <> ''
)
EXECUTE FUNCTION private.record_phone_confirmation();

CREATE TRIGGER trg_record_phone_confirmation_insert
AFTER INSERT ON auth.users
FOR EACH ROW
WHEN (
  NEW.phone_confirmed_at IS NOT NULL
  AND coalesce(NEW.phone, '') <> ''
)
EXECUTE FUNCTION private.record_phone_confirmation();


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================
--
-- A tabela e a funcao nascem alcancaveis pelo default privilege do Supabase
-- (armadilha 5). `FROM PUBLIC, <roles>` (armadilhas 2 e 3). O trigger nao
-- precisa de EXECUTE de ninguem: o Postgres nao confere EXECUTE da funcao de
-- trigger no disparo.

REVOKE ALL ON TABLE private.phone_confirmations FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.record_phone_confirmation() FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'private.phone_confirmations',
                                      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE') THEN
      RAISE EXCEPTION '% alcanca private.phone_confirmations', v_role;
    END IF;
    IF pg_catalog.has_function_privilege(v_role, 'private.record_phone_confirmation()', 'EXECUTE') THEN
      RAISE EXCEPTION '% executa private.record_phone_confirmation', v_role;
    END IF;
  END LOOP;

  -- O outro lado: o dono (que a funcao DEFINER usa) le auth.users e escreve.
  IF NOT pg_catalog.has_table_privilege('postgres', 'private.phone_confirmations', 'SELECT, INSERT') THEN
    RAISE EXCEPTION 'postgres perdeu acesso a private.phone_confirmations';
  END IF;
  IF NOT pg_catalog.has_table_privilege('postgres', 'auth.users', 'SELECT') THEN
    RAISE EXCEPTION 'postgres nao le auth.users — o trigger nao ve as outras contas pendentes';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;

  IF pg_catalog.pg_get_userbyid(
       (SELECT p.proowner FROM pg_catalog.pg_proc p
         WHERE p.oid = 'private.record_phone_confirmation()'::pg_catalog.regprocedure)
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'record_phone_confirmation precisa ser de postgres para ler auth.users e gravar em private';
  END IF;

  -- Os dois triggers existem e estao habilitados ('O' = origin, o modo normal).
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger
       WHERE tgrelid = 'auth.users'::pg_catalog.regclass
         AND tgname IN ('trg_record_phone_confirmation_update', 'trg_record_phone_confirmation_insert')
         AND tgenabled = 'O') <> 2 THEN
    RAISE EXCEPTION 'os triggers de registro da confirmacao nao estao habilitados em auth.users';
  END IF;
END;
$$;
