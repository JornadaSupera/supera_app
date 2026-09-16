-- O segundo fator do administrador deixa de ser so aparencia de tela.
-- Design e racional: supera-docs/ADRs/ADR-022 — O que ainda dependia so de nos.md
-- Requisito: supera-docs/Requisitos/Segurança e Dados/Segurança da plataforma.md
--
-- O QUE ESTAVA ERRADO, e o dev do painel descreveu a fechadura com precisao: o
-- painel PEDE o segundo fator, e **nenhuma politica olha o nivel da sessao**.
-- Quem chegasse por fora do painel — PostgREST direto, com um token obtido so
-- com senha — entraria com todos os direitos de administrador. A exigencia
-- contratual estava cumprida na aparencia.
--
-- O Supabase carimba o nivel de garantia no proprio JWT: `aal1` para sessao com
-- um fator, `aal2` depois da verificacao do segundo. O claim esta em
-- `request.jwt.claims` e nao depende de tabela nossa.
--
-- POR QUE A EXIGENCIA NASCE DESLIGADA, e isto e o centro da migration. Ligar a
-- regra na mesma migration que a cria DERRUBA todo administrador que ainda nao
-- cadastrou autenticador — no pior caso, todos eles, e sem caminho de volta pelo
-- proprio painel, porque conceder acesso tambem e ato de administrador. Em
-- homologacao isso e um susto; em producao e uma clinica sem acesso ao proprio
-- sistema.
--
-- A ordem combinada com o painel tem tres passos, e so o terceiro e um ato de
-- dado:
--   1. o painel trata o erro na tela, com mensagem e caminho de cadastro;
--   2. confirma-se que existe ao menos um administrador com fator configurado;
--   3. liga-se a exigencia.
--
-- Com o interruptor em tabela, o passo 3 e um UPDATE — reversivel, auditado e
-- sem `db push`. Se a regra vivesse hardcoded, o passo 3 seria migration nova e
-- o passo de volta, outra. Isso NAO e configuracao por comodidade: e o que torna
-- a trava destravavel pelo mesmo caminho que a travou.


-- ============================================================
-- 1. O interruptor
-- ============================================================
--
-- Tabela de UMA LINHA, garantida por chave primaria constante. Nao e "tabela de
-- configuracoes" generica: `alert_rules`, motivos de falta e termos de uso ja
-- provaram que cada assunto pede sua propria forma, e um balde `key/value`
-- perderia tipo, comentario e constraint de todos eles ao mesmo tempo.
CREATE TABLE public.security_settings (
  -- `id` fixo em 1: uma linha, sempre. O CHECK e o que impede a segunda, e sem
  -- ele duas linhas divergentes fariam a regra valer ou nao conforme a ordem de
  -- leitura.
  id                  smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  require_admin_mfa   boolean NOT NULL DEFAULT false,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          uuid REFERENCES public.accounts (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.security_settings IS
  'Linha unica. Guarda interruptores de seguranca cuja ativacao e decisao operacional com janela, nao mudanca de esquema.';
COMMENT ON COLUMN public.security_settings.require_admin_mfa IS
  'Nasce false de proposito: ligar junto com a migration derrubaria todo administrador sem autenticador cadastrado, inclusive o unico.';

INSERT INTO public.security_settings (id) VALUES (1);

ALTER TABLE public.security_settings ENABLE ROW LEVEL SECURITY;

-- O painel precisa LER para explicar a exigencia na tela antes de ela morder.
CREATE POLICY security_settings_select_admin ON public.security_settings
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- Nenhuma politica de escrita: o interruptor so muda pela RPC abaixo.

-- GATILHO PROPRIO, e nao o `private.audit_write` generico. Medido aqui: aquele
-- faz `(v_row ->> 'id')::uuid`, e o `id` desta tabela e `smallint` — toda
-- escrita morria com "invalid input syntax for type uuid". A tabela tem UMA
-- linha, entao `resource_id` nao identificaria nada de qualquer forma; o que
-- interessa e quem mexeu no interruptor e quando.
--
-- Vale como achado alem desta tabela: `audit_write` pressupoe PK uuid, o que
-- valia para todo agregado clinico e deixou de valer na primeira tabela de
-- configuracao. O pressuposto agora esta escrito no lugar onde ele quebra.
CREATE FUNCTION private.audit_security_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     origin, actor_capacity)
  VALUES
    (auth.uid(),
     CASE WHEN TG_OP = 'INSERT' THEN 'create'
          WHEN TG_OP = 'DELETE' THEN 'delete'
          ELSE 'update' END::public.audit_action,
     TG_TABLE_NAME, NULL, NULL,
     private.request_origin(), private.actor_capacity());
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.security_settings
FOR EACH ROW EXECUTE FUNCTION private.audit_security_settings();


-- ============================================================
-- 2. A leitura do nivel de garantia da sessao
-- ============================================================

CREATE FUNCTION private.session_meets_mfa()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_claims text;
BEGIN
  v_claims := pg_catalog.current_setting('request.jwt.claims', true);

  -- Fora de uma requisicao do PostgREST nao ha JWT: rotina agendada, `psql` de
  -- manutencao e a suite de testes caem aqui. Devolver `true` seria abrir a
  -- porta que a funcao existe para fechar; devolver `false` quebraria toda
  -- rotina de service_role. A saida e NAO CHAMAR esta funcao quando nao ha
  -- sessao de usuario, e quem garante isso e o predicado do §3: ele so consulta
  -- o nivel depois de `auth.uid()` ter respondido.
  IF v_claims IS NULL THEN
    RETURN false;
  END IF;

  -- COALESCE, E ELE NAO E ENFEITE. Sem ele, claim `aal` AUSENTE faz
  -- `->> 'aal'` devolver NULL, a comparacao devolver NULL, e a funcao devolver
  -- NULL em vez de false. O efeito e assimetrico e foi medido pela suite: na
  -- politica, `EXISTS(...) AND NULL` da NULL e a RLS nega — fail-closed por
  -- acidente. Mas na guarda da RPC, `IF p_required AND NOT NULL` nao dispara, e
  -- a trava que impede o administrador de se trancar do lado de fora
  -- simplesmente NAO ACONTECE. Logica de tres valores desligando uma barreira
  -- sem levantar erro nenhum.
  RETURN COALESCE((v_claims::jsonb ->> 'aal') = 'aal2', false);
EXCEPTION WHEN OTHERS THEN
  -- Claims malformados: fail-closed. Sessao cujo nivel nao se consegue ler nao
  -- e sessao de nivel suficiente.
  RETURN false;
END;
$$;

COMMENT ON FUNCTION private.session_meets_mfa() IS
  'Le o claim `aal` do JWT. Fail-closed: claim ausente ou ilegivel devolve false.';


-- ============================================================
-- 3. A exigencia entra em is_active_admin
-- ============================================================
--
-- AQUI, E NAO EM CADA POLITICA. `is_active_admin()` e o unico ponto por onde
-- passa todo acesso administrativo — politica de RLS e checagem dentro de RPC.
-- Espalhar a condicao por dezenas de politicas garantiria que uma ficaria para
-- tras, e a que ficasse seria a brecha.
--
-- A ordem dos termos e deliberada: o interruptor primeiro. Desligado, a
-- expressao termina sem tocar no JWT, e o custo da funcao volta a ser o de
-- antes desta migration.
CREATE OR REPLACE FUNCTION private.is_active_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.admins ad
    JOIN public.accounts a ON a.id = ad.account_id
    WHERE a.id = auth.uid()
      AND a.is_active
      AND ad.is_active
  )
  AND (
    NOT (SELECT s.require_admin_mfa FROM public.security_settings s WHERE s.id = 1)
    OR private.session_meets_mfa()
  );
$$;


-- ============================================================
-- 4. A RPC que liga e desliga — e a guarda que impede o tiro no pe
-- ============================================================

CREATE FUNCTION public.set_require_admin_mfa(p_required boolean)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador muda a exigencia de segundo fator'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A GUARDA DO PASSO 2, imposta pelo banco em vez de confiada ao combinado:
  -- ninguem liga a exigencia de uma sessao que nao a cumpre. Quem liga precisa
  -- estar, naquele instante, com o segundo fator verificado — o que prova que
  -- ao menos um administrador consegue voltar a entrar depois.
  IF p_required AND NOT private.session_meets_mfa() THEN
    RAISE EXCEPTION
      'ligue a exigencia a partir de uma sessao que ja passou pelo segundo fator: caso contrario voce se tranca do lado de fora'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.security_settings
     SET require_admin_mfa = p_required,
         updated_at        = pg_catalog.clock_timestamp(),
         updated_by        = auth.uid()
   WHERE id = 1;
END;
$$;

COMMENT ON FUNCTION public.set_require_admin_mfa(boolean) IS
  'Liga e desliga a exigencia de aal2 para o perfil administrativo. Ligar exige que a PROPRIA sessao ja cumpra a exigencia — e a guarda contra trancar a clinica do lado de fora.';


-- ============================================================
-- 5. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE INSERT, UPDATE, DELETE ON public.security_settings FROM authenticated, service_role;
-- `anon` nao enxerga nem a existencia do interruptor: o default privilege do
-- Supabase entrega toda tabela nova de `public` a ele (ADR-016, armadilha nº 5).
REVOKE ALL ON public.security_settings FROM anon;

REVOKE EXECUTE ON FUNCTION private.session_meets_mfa()             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.audit_security_settings()       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_require_admin_mfa(boolean)   FROM PUBLIC, anon;

-- `is_active_admin` passou a ler `security_settings` e a chamar
-- `session_meets_mfa`. Ela e SECURITY DEFINER com dono `postgres`, entao a
-- leitura da tabela nao precisa de GRANT — mas o EXECUTE da funcao interna sim,
-- porque `clinical_reader` avalia `is_active_admin` dentro das politicas dele.
GRANT EXECUTE ON FUNCTION private.session_meets_mfa()              TO clinical_reader;
GRANT EXECUTE ON FUNCTION public.set_require_admin_mfa(boolean)    TO authenticated;

DO $$
DECLARE v_ligado boolean;
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated',
         'public.set_require_admin_mfa(boolean)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em set_require_admin_mfa: a exigencia nao poderia ser ligada nem desligada.';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.security_settings', 'SELECT') THEN
    RAISE EXCEPTION 'anon LE security_settings: a configuracao de seguranca estaria exposta sem login.';
  END IF;

  -- O estado inicial e parte da decisao, nao um detalhe de seed. Se esta
  -- migration saisse com a exigencia ligada, ela derrubaria a clinica no push.
  SELECT s.require_admin_mfa INTO v_ligado FROM public.security_settings s WHERE s.id = 1;
  IF v_ligado THEN
    RAISE EXCEPTION 'a exigencia de segundo fator saiu LIGADA da migration: isso tranca todo administrador sem autenticador cadastrado.';
  END IF;
END;
$$;
