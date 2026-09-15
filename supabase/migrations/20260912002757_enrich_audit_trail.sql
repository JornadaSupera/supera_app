-- A trilha ganha origem, qualidade do ator e marca de material restrito.
-- Design e racional: supera-docs/ADRs/ADR-022 — O que ainda dependia so de nos.md
-- Requisito: supera-docs/Requisitos/Segurança e Dados/Auditoria e trilha de acesso.md
--
-- Tres lacunas levantadas pelo dev do painel, e as tres sao nossas. Elas entram
-- juntas porque tocam a mesma tabela e a mesma funcao de escrita.
--
--   5.1  De ONDE partiu o acesso.
--   5.4  Em que QUALIDADE a pessoa agiu (titular ou cuidador).
--   5.5  QUE houve acesso a material restrito, sem dizer de quem.
--
-- O LIMITE QUE ORGANIZA AS TRES: a trilha REFERENCIA o dado, nunca o copia
-- (ADR-003 §6, ADR-005). Cada coluna abaixo teve de passar pelo mesmo teste —
-- ela responde a uma pergunta de inspecao, ou ela transforma a trilha num
-- segundo prontuario? A 5.5 quase reprovou, e a forma dela mudou por isso.


-- ============================================================
-- 1. Origem do acesso (5.1)
-- ============================================================
--
-- A ORIGEM NAO VEM POR PARAMETRO, e esta e uma correcao do que foi prometido ao
-- dev do painel. A promessa era "as read_* recebem a origem por parametro", e
-- isso tem dois defeitos: mudaria a assinatura de vinte e tantas funcoes, e o
-- valor seria inteiramente escolhido pelo cliente.
--
-- O PostgREST expoe os cabecalhos da requisicao no GUC `request.headers`, e o
-- gateway do Supabase ACRESCENTA o endereco de origem em `x-forwarded-for`.
-- Medido no stack local: uma chamada com `X-Forwarded-For: 203.0.113.9` chega
-- ao Postgres como `"x-forwarded-for":"203.0.113.9, 172.27.0.1"` — o primeiro
-- elemento e o que o cliente afirmou, o ultimo e o que o proxy observou.
--
-- RESSALVA QUE FICA ESCRITA, porque ela e a mesma da promessa original e nao
-- desaparece com a mudanca de mecanismo: o inicio da cadeia `x-forwarded-for`
-- e falsificavel por quem controla o cliente. O valor serve como INDICIO
-- operacional ("de quantos lugares esta conta acessou prontuario esta semana"),
-- e NAO como prova contra a pessoa que agiu. Guardar o ultimo elemento em vez
-- do primeiro daria o IP do proxy, que nao distingue ninguem.
--
-- `text` e nao `inet`: a cadeia pode trazer valor malformado vindo do cliente, e
-- um cast que levanta excecao dentro da trilha derrubaria a LEITURA que ela
-- deveria apenas registrar. A trilha nunca pode ser o motivo de uma consulta
-- clinica falhar.
ALTER TABLE public.audit_log ADD COLUMN origin text;

COMMENT ON COLUMN public.audit_log.origin IS
  'Primeiro elemento de x-forwarded-for, quando a chamada vem do PostgREST. INDICIO operacional, nunca prova: o inicio da cadeia e falsificavel por quem controla o cliente. NULL fora de requisicao HTTP (psql, rotina agendada).';

CREATE FUNCTION private.request_origin()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_headers text;
BEGIN
  -- `true` no segundo argumento: fora de uma requisicao do PostgREST o GUC nao
  -- existe, e sem ele `current_setting` levantaria excecao.
  v_headers := pg_catalog.current_setting('request.headers', true);
  IF v_headers IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN pg_catalog.split_part(
           (v_headers::jsonb ->> 'x-forwarded-for'), ',', 1);
EXCEPTION WHEN OTHERS THEN
  -- Cabecalho malformado nao pode derrubar a leitura que esta sendo auditada.
  RETURN NULL;
END;
$$;


-- ============================================================
-- 2. Qualidade do ator (5.4)
-- ============================================================
--
-- ESTA COLUNA NAO CONTRADIZ A DECISAO DE 28/08, e a distincao importa. O
-- comentario de `actor_account_id` diz que **o PERFIL do ator nao e coluna**:
-- congelar "era administrador" seria copiar dado que se resolve por join e que
-- o titular pode pedir para eliminar. Continua valendo.
--
-- O que entra aqui e outra coisa: a QUALIDADE em que a pessoa agiu naquele ato.
-- Ela NAO se resolve por join, porque a mesma conta pode ser titular de uma
-- ficha e cuidadora de outra, e o join diria as duas. O diario ja guarda
-- exatamente isso em `diary_entries.acting_as`, e a informacao existia sem
-- nunca chegar ao log.
--
-- POR QUE IMPORTA, e e a razao clinica antes da regulatoria: **quem declarou o
-- sintoma muda a leitura do registro e a responsabilidade sobre ele**. Um grau 5
-- declarado pelo titular e um grau 5 declarado pelo cuidador nao sao o mesmo
-- dado para quem conduz o caso.
CREATE TYPE public.audit_actor_capacity AS ENUM
  ('patient', 'caregiver', 'professional', 'admin', 'system');

ALTER TABLE public.audit_log ADD COLUMN actor_capacity public.audit_actor_capacity;

COMMENT ON COLUMN public.audit_log.actor_capacity IS
  'Em que qualidade a pessoa agiu NESTE ato, nao que perfis ela tem. Uma conta pode ser titular de uma ficha e cuidadora de outra; o join diria as duas.';

CREATE FUNCTION private.actor_capacity()
RETURNS public.audit_actor_capacity
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 'system';
  END IF;

  -- A ORDEM E A DA REGRA DE ACESSO, nao uma preferencia. Um administrador que
  -- tambem seja cuidador age como administrador quando le prontuario, porque e
  -- a politica de administrador que lhe devolve a linha. Inverter a ordem faria
  -- a trilha registrar a qualidade que NAO autorizou o acesso.
  IF private.is_active_admin()        THEN RETURN 'admin';        END IF;
  IF private.is_active_professional() THEN RETURN 'professional'; END IF;
  IF private.my_own_patient_id() IS NOT NULL THEN RETURN 'patient'; END IF;

  IF EXISTS (
    SELECT 1
      FROM public.patient_caregivers pc
      JOIN public.caregivers c ON c.id = pc.caregiver_id
     WHERE c.account_id = auth.uid()
       AND pc.status = 'active'
  ) THEN
    RETURN 'caregiver';
  END IF;

  -- Conta autenticada sem perfil nenhum. NULL e honesto: dizer 'system' seria
  -- confundi-la com a rotina agendada, que e o unico ator sem conta.
  RETURN NULL;
END;
$$;


-- ============================================================
-- 3. Acesso a material restrito (5.5)
-- ============================================================
--
-- A FORMA MUDOU DEPOIS DO PRIMEIRO RASCUNHO, e o motivo e o furo que o proprio
-- dev do painel antecipou: "e facil enriquecer o log ate ele virar a
-- indiscricao que deveria denunciar".
--
-- O rascunho era um booleano `restricted_content` na MESMA linha de leitura. Ele
-- reprova: a linha de `read_specialty_notes` ja carrega `patient_id`, entao um
-- booleano ao lado diria **de qual paciente era o material restrito** — que e
-- exatamente o que a regra adotada proibe. A trilha passaria a apontar quem faz
-- terapia, para quem consultar a trilha.
--
-- A forma correta e uma linha SEPARADA, com `patient_id` nulo e sem
-- `resource_id`. Ela responde "quem acessou material restrito, quando, quantos
-- itens" e nao responde "de quem". O par leitura + marca convive na mesma
-- transacao sem se cruzar, porque o que os ligaria e justamente o que se omite.
--
-- `row_count` continua sendo a contagem de itens restritos alcancados: e o que
-- distingue uma consulta pontual de uma varredura sobre a especialidade
-- confidencial.
ALTER TABLE public.audit_log
  ADD COLUMN is_restricted_material boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.audit_log.is_restricted_material IS
  'Marca a linha que registra acesso a material de especialidade confidencial. Essa linha SEMPRE tem patient_id e resource_id nulos: dizer de quem era o material e o oposto do que a regra protege.';

-- Indice da pergunta do encarregado de dados: "quem acessou material restrito
-- neste mes?". Parcial porque a esmagadora maioria das linhas e false.
CREATE INDEX idx_audit_log_restricted
  ON public.audit_log (occurred_at DESC, actor_account_id)
  WHERE is_restricted_material;

-- A constraint impede que a proxima pessoa "melhore" a marca acrescentando o
-- titular. Sem ela, a regra viveria so no comentario — e comentario nao e
-- invariante.
ALTER TABLE public.audit_log
  ADD CONSTRAINT ck_audit_log_restricted_is_anonymous
  CHECK (NOT is_restricted_material OR (patient_id IS NULL AND resource_id IS NULL))
  NOT VALID;

CREATE FUNCTION private.log_restricted_material_read(p_row_count integer)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     row_count, origin, actor_capacity, is_restricted_material)
  VALUES
    (auth.uid(), 'read', 'specialty_notes', NULL, NULL,
     p_row_count, private.request_origin(), private.actor_capacity(), true);
$$;

COMMENT ON FUNCTION private.log_restricted_material_read(integer) IS
  'Linha ANONIMA de acesso a material de especialidade confidencial: sem paciente, sem registro. Responde "quem acessou material de Psicologia neste mes" sem apontar de quem era.';


-- ============================================================
-- 4. Os dois escritores da trilha passam a preencher as colunas novas
-- ============================================================

CREATE OR REPLACE FUNCTION private.log_clinical_read(
  p_resource_table text,
  p_patient_id     uuid,
  p_row_count      integer,
  p_resource_id    uuid DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     row_count, origin, actor_capacity)
  VALUES
    (auth.uid(), 'read', p_resource_table, p_resource_id, p_patient_id,
     p_row_count, private.request_origin(), private.actor_capacity());
$$;

CREATE OR REPLACE FUNCTION private.audit_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row        jsonb;
  v_action     public.audit_action;
  v_patient_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := pg_catalog.to_jsonb(OLD);
    v_action := 'delete';
  ELSE
    v_row := pg_catalog.to_jsonb(NEW);
    v_action := CASE WHEN TG_OP = 'INSERT' THEN 'create' ELSE 'update' END::public.audit_action;
  END IF;

  -- So o ID sai do jsonb. O corpo da linha morre nesta variavel: e o que
  -- separa "trilha que referencia" de "trilha que copia" (ADR-005).
  IF TG_ARGV[0] <> '-' THEN
    v_patient_id := (v_row ->> TG_ARGV[0])::uuid;
  END IF;

  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     origin, actor_capacity)
  VALUES
    (auth.uid(), v_action, TG_TABLE_NAME, (v_row ->> 'id')::uuid, v_patient_id,
     private.request_origin(), private.actor_capacity());

  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$$;


-- ============================================================
-- 5. A leitura da anotacao clinica passa a marcar o material restrito
-- ============================================================
--
-- `read_specialty_notes` e a unica leitura que alcanca conteudo de especialidade
-- confidencial hoje. A marca sai em linha propria, DEPOIS da linha normal de
-- leitura, e so quando houve de fato material restrito no retorno.
--
-- A contagem se faz sobre a MESMA janela que foi devolvida, com o mesmo
-- predicado — nao sobre a tabela inteira. Contar fora da janela diria "acessou
-- material restrito" sobre linhas que a funcao nao entregou.
--
-- MEDIDO AQUI: `CREATE OR REPLACE` sobre funcao alheia falha com
-- "must be owner of function" (42501). A funcao pertence a `clinical_reader`
-- desde create_specialty_notes, e nem `postgres` a substitui de fora. E preciso
-- ASSUMIR o dono — o mesmo SET LOCAL ROLE da armadilha nº 6 da ADR-016, agora
-- por outro motivo: la era conceder sobre objeto alheio, aqui e reescreve-lo.
--
-- Efeito colateral bem-vindo: substituida DE DENTRO do papel, a funcao continua
-- pertencendo a `clinical_reader` e nao precisa de ALTER ... OWNER depois. Fosse
-- pelo caminho de fora, ela sairia pertencendo a quem aplicou a migration, que e
-- dono das tabelas e NAO sofre RLS — a anotacao restrita da psicologia passaria
-- a aparecer para todo mundo, sem erro nenhum.
--
-- E o papel precisa de CREATE no schema para SUBSTITUIR, nao so para criar: sem
-- o GRANT abaixo o comando falha com "permission denied for schema public".
-- Mesmo emprestimo temporario que create_clinical_read_audit ja fazia para o
-- ALTER ... OWNER, e devolvido logo depois — leitor auditado que pudesse criar
-- objeto em `public` seria outra coisa, nao um leitor.
GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

CREATE OR REPLACE FUNCTION public.read_specialty_notes(
  p_patient_id uuid,
  p_limit      integer     DEFAULT 50,
  p_before     timestamptz DEFAULT NULL
)
RETURNS SETOF public.specialty_notes
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count            integer;
  v_restricted_count integer;
BEGIN
  RETURN QUERY
    SELECT n.* FROM public.specialty_notes n
     WHERE n.patient_id = p_patient_id
       AND (p_before IS NULL OR n.created_at < p_before)
     ORDER BY n.created_at DESC
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('specialty_notes', p_patient_id, v_count);

  SELECT count(*) INTO v_restricted_count
    FROM ( SELECT n.visibility FROM public.specialty_notes n
            WHERE n.patient_id = p_patient_id
              AND (p_before IS NULL OR n.created_at < p_before)
            ORDER BY n.created_at DESC
            LIMIT LEAST(p_limit, 200) ) AS janela
   WHERE janela.visibility = 'specialty_restricted';

  IF v_restricted_count > 0 THEN
    PERFORM private.log_restricted_material_read(v_restricted_count);
  END IF;
END;
$$;

RESET ROLE;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 6. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.request_origin()                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.actor_capacity()                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.log_restricted_material_read(integer) FROM PUBLIC, anon;

-- As tres sao chamadas de DENTRO das funcoes de trilha, que pertencem a
-- `clinical_reader` ou a `postgres`. O EXECUTE e exigido em runtime.
GRANT EXECUTE ON FUNCTION private.request_origin()                      TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.actor_capacity()                      TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.log_restricted_material_read(integer) TO clinical_reader;

-- A funcao foi substituida DE DENTRO do papel dono (§5), entao ela nao trocou de
-- dono e nao precisa de ALTER ... OWNER. O que ela precisa e do REVOKE/GRANT
-- refeito: `CREATE OR REPLACE` reintroduz a concessao a PUBLIC pelo default
-- privilege, e o default do Supabase alcanca `anon` (ADR-016, armadilhas nº 4
-- e nº 5). Como sempre, quem revoga e concede sobre objeto de `clinical_reader`
-- tem de ser `clinical_reader`.
DO $$
BEGIN
  SET LOCAL ROLE clinical_reader;
  REVOKE EXECUTE ON FUNCTION public.read_specialty_notes(uuid, integer, timestamptz)
    FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION public.read_specialty_notes(uuid, integer, timestamptz)
    TO authenticated, service_role;
  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END;
$$;

-- A constraint nasceu NOT VALID de proposito: `audit_log` e a tabela de maior
-- volume do sistema, e `ADD CONSTRAINT` com validacao imediata tomaria
-- ACCESS EXCLUSIVE e varreria tudo dentro do `db push`. O VALIDATE vai em
-- migration propria, como ja fizeram validate_treatment_phase_fk e
-- validate_deferred_constraints.

-- ASSERCAO DE EFEITO (ADR-016): o dono da leitura de anotacao clinica e o que
-- sustenta o sigilo dentro dela.
DO $$
DECLARE v_dono text;
BEGIN
  SELECT r.rolname INTO v_dono
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
   WHERE p.oid = 'public.read_specialty_notes(uuid, integer, timestamptz)'::regprocedure;

  IF v_dono <> 'clinical_reader' THEN
    RAISE EXCEPTION
      'read_specialty_notes saiu da migration com dono %. Dono de tabela nao sofre RLS, e a anotacao restrita vazaria.',
      v_dono;
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated',
         'public.read_specialty_notes(uuid, integer, timestamptz)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em read_specialty_notes.';
  END IF;
END;
$$;
