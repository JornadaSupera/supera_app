-- Auditoria de acesso a dado clinico — o pedagio do clinical_reader.
-- Design e racional: supera-docs/ADRs/ADR-008 — Auditoria de leitura de dado clinico.md
-- Decisao ja tomada:  ADR-003 §5 (o COMO). Esta migration e o QUANDO.
--
-- POR QUE AGORA, e nao junto com o proximo agregado: a ADR-003 §5 decidiu a
-- forma em 28/08/2026 e cinco agregados nasceram TO authenticated desde entao.
-- Cada agregado novo multiplica o custo da migracao (politicas a reescrever +
-- chamadas de front-end a trocar), e "perfis de acesso, RLS, LOGS" e item de
-- aceite contratual literal (Anexo II). O pre-mortem do agregado Registro
-- clinico nomeou isto como a falha #1: chegar a homologacao sem trilha e
-- resolver no cliente, que e o unico lugar onde o log e falsificavel.
--
-- O QUE MUDA PARA OS FRONT-ENDS (contrato, nao detalhe):
--   * App do paciente e do cuidador: NADA muda. Eles leem o proprio dado
--     direto no PostgREST, como hoje.
--   * Painel clinico e administrativo: leitura de dado clinico deixa de ser
--     .from('<tabela>') e passa a ser .rpc('read_<tabela>', {...}). Consultar a
--     tabela direto passa a devolver ZERO LINHAS — nao erro. E fail-closed de
--     proposito: um SELECT sem trilha nao pode "quase funcionar".
--
-- O QUE NAO PAGA PEDAGIO (ADR-003 §5): agenda, orientacoes, perfil, NPS,
-- catalogos e as tabelas de IDENTIDADE (accounts, caregivers, vinculos). O
-- pedagio e para "acesso a dado sensivel", nao para toda leitura.


-- ============================================================
-- 1. audit_log — metadado, NUNCA conteudo
-- ============================================================
--
-- ADR-003 §6 e ADR-005: a trilha REFERENCIA o dado, nao o copia. Snapshot de
-- conteudo em trilha imutavel e dado clinico que nao se corrige nem se elimina
-- — colide de frente com retificacao e eliminacao da LGPD. Por isso aqui so
-- existem QUEM, QUANDO, QUE ACAO, SOBRE QUAL TABELA, QUAL LINHA e DE QUAL
-- PACIENTE. Nenhuma coluna de corpo, nenhum jsonb de linha.

CREATE TYPE public.audit_action AS ENUM ('read', 'create', 'update', 'delete');

CREATE TABLE public.audit_log (
  -- bigint identity e nao uuidv7: tabela interna, de volume alto, que ninguem
  -- referencia por FK e que nenhum front-end enumera (ADR-001).
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  -- NULL = service_role / rotina agendada: auth.uid() e NULL fora de sessao de
  -- usuario, e um NOT NULL aqui explodiria a sincronizacao Gemed (ADR-003 §7).
  actor_account_id uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  action        public.audit_action NOT NULL,
  resource_table text NOT NULL,
  -- NULL em leitura de LISTA (a lista de pacientes do painel, por exemplo).
  resource_id   uuid,
  -- Desnormalizado de proposito: e por paciente que a trilha e consultada
  -- ("quem acessou o dado deste titular?"), e o join que a reconstruiria
  -- dependeria de a linha de origem ainda existir.
  patient_id    uuid REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- So em leitura: quantas linhas o acesso devolveu. Distingue "abriu a ficha"
  -- de "varreu a base".
  -- bigint e nao integer: mesma decisao da coluna de versao em
  -- create_patient_clinical — prefer-bigint-over-int segue ativa, e contagem
  -- nao e caso de abrir excecao no .squawk.toml.
  row_count     bigint,
  CONSTRAINT ck_audit_log_row_count
    CHECK ((action = 'read') = (row_count IS NOT NULL))
);

COMMENT ON TABLE public.audit_log IS
  'Trilha de auditoria: metadado, nunca conteudo (ADR-003 §6). Append-only, garantido por REVOKE + trigger — o REVOKE sozinho nao contem service_role, que tem BYPASSRLS mas nao e superuser.';
COMMENT ON COLUMN public.audit_log.actor_account_id IS
  'NULL = ator do sistema (service_role, rotina agendada). O PERFIL do ator nao e coluna: resolve-se por join, e congelar o perfil aqui seria copiar dado que o titular pode pedir para eliminar.';
COMMENT ON COLUMN public.audit_log.row_count IS
  'Preenchido so em leitura. E o que separa "consultou uma ficha" de "leu a base inteira" — a pergunta que a LGPD faz na inspecao.';

-- Indice da pergunta real da auditoria: "quem tocou no dado deste paciente?"
CREATE INDEX idx_audit_log_patient   ON public.audit_log (patient_id, occurred_at DESC);
-- E a inversa: "o que esta conta acessou?"
CREATE INDEX idx_audit_log_actor     ON public.audit_log (actor_account_id, occurred_at DESC);


-- ============================================================
-- 2. Append-only — a regra vale tambem para service_role
-- ============================================================

CREATE FUNCTION private.reject_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log e append-only: % nao e permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_audit_log_append_only
BEFORE UPDATE OR DELETE ON public.audit_log
FOR EACH ROW EXECUTE FUNCTION private.reject_audit_log_mutation();


-- ============================================================
-- 3. Os dois escritores da trilha
-- ============================================================
--
-- SECURITY DEFINER nos dois: nenhum role de usuario recebe INSERT em audit_log,
-- entao a unica forma de escrever na trilha e por estas funcoes. Trilha que o
-- cliente pode escrever direto e trilha que o cliente pode forjar.

CREATE FUNCTION private.log_clinical_read(
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
    (actor_account_id, action, resource_table, resource_id, patient_id, row_count)
  VALUES
    (auth.uid(), 'read', p_resource_table, p_resource_id, p_patient_id, p_row_count);
$$;

COMMENT ON FUNCTION private.log_clinical_read(text, uuid, integer, uuid) IS
  'Unico caminho de escrita da trilha de LEITURA. Chamada pelas funcoes read_* — nunca pelo cliente.';

-- Auditoria de ESCRITA (#12): a clinica quer distinguir "quem fez o que".
-- AFTER trigger comum, barata. TG_ARGV[0] nomeia a coluna que carrega o
-- paciente ('-' quando a tabela nao tem nenhuma).
CREATE FUNCTION private.audit_write()
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
    (actor_account_id, action, resource_table, resource_id, patient_id)
  VALUES
    (auth.uid(), v_action, TG_TABLE_NAME, (v_row ->> 'id')::uuid, v_patient_id);

  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$$;

COMMENT ON FUNCTION private.audit_write() IS
  'Trilha de escrita (#12). Extrai APENAS os ids do jsonb da linha — o corpo nunca chega a audit_log.';


-- ============================================================
-- 4. clinical_reader — o role que torna a trilha inescapavel
-- ============================================================
--
-- Tres propriedades, e as tres precisam valer juntas (ADR-003 §5):
--   1. O log e inescapavel: nao ha caminho de leitura fora das funcoes read_*.
--   2. A RLS continua valendo: NOBYPASSRLS e o role NAO e dono das tabelas.
--   3. auth.uid() sobrevive: e GUC de sessao, nao role.
--
-- NOLOGIN: ninguem se conecta como ele. Ele so existe como DONO das funcoes
-- SECURITY DEFINER abaixo.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'clinical_reader') THEN
    CREATE ROLE clinical_reader NOLOGIN NOBYPASSRLS;
  END IF;

  -- ACHADO EMPIRICO (28/08/2026): no Supabase, migration roda como `postgres`,
  -- que NAO e superuser — quem e superuser e supabase_admin. Sem SET sobre o
  -- role novo, o ALTER FUNCTION ... OWNER TO la embaixo falha com
  -- "must be able to SET ROLE clinical_reader" (42501). Criar o role NAO basta.
  -- INHERIT FALSE de proposito: `postgres` ganha o direito de ATRIBUIR o dono,
  -- nao de herdar os privilegios dele por acidente.
  -- `current_user` sem qualificacao: e palavra reservada da gramatica SQL, nao
  -- funcao — `pg_catalog.current_user` NAO existe. Mesma familia do
  -- pg_catalog.coalesce ja anotado em create_identity_core.
  EXECUTE pg_catalog.format(
    'GRANT clinical_reader TO %I WITH SET TRUE, INHERIT FALSE', current_user);
END;
$$;

COMMENT ON ROLE clinical_reader IS
  'Dono das funcoes read_* de dado clinico. NOBYPASSRLS e nao-dono das tabelas: a RLS vale para ele.';

GRANT USAGE ON SCHEMA public TO clinical_reader;

-- ACHADO EMPIRICO: trocar o DONO de uma funcao exige que o novo dono tenha
-- CREATE no schema dela — USAGE nao basta ("permission denied for schema
-- public"). O CREATE serve so ao instante do ALTER ... OWNER TO e e REVOGADO
-- no fim desta migration; a propriedade permanece. Leitor auditado que pudesse
-- criar objeto em `public` seria outra coisa, nao um leitor.
GRANT CREATE ON SCHEMA public TO clinical_reader;

-- Ele le exatamente as tabelas que pagam pedagio — nem uma a mais.
GRANT SELECT ON
  public.patients,
  public.patient_diagnoses,
  public.patient_clinical_history,
  public.treatment_plans,
  public.diary_entries,
  public.diary_symptom_reports
TO clinical_reader;

-- Catalogos que as telas resolvem junto (rotulo do CID, da fase, do sintoma).
GRANT SELECT ON public.cid10, public.treatment_phases, public.symptoms, public.specialties
TO clinical_reader;

-- USAGE no schema private ANTES do EXECUTE: os dois sao exigidos, e so o
-- EXECUTE nao basta ("permission denied for schema private").
GRANT USAGE ON SCHEMA private TO clinical_reader;

-- Sem EXECUTE nos helpers, TODA politica TO clinical_reader falharia por
-- privilegio — e o REVOKE ... FROM PUBLIC de create_identity_core ja tirou.
GRANT EXECUTE ON FUNCTION private.is_active_professional() TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.is_active_admin()        TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.my_specialty_ids()       TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.has_permission(text)     TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.log_clinical_read(text, uuid, integer, uuid) TO clinical_reader;


-- ============================================================
-- 5. As politicas do PROFISSIONAL e do ADMINISTRADOR mudam de role
-- ============================================================
--
-- ALTER POLICY ... TO <role> troca so o role: o predicado ja provado por 269
-- assercoes continua palavra por palavra o mesmo. Titular e cuidador NAO sao
-- tocados — o app do paciente segue lendo direto.

ALTER POLICY patients_select_professional                 ON public.patients                 TO clinical_reader;
ALTER POLICY patients_select_admin                        ON public.patients                 TO clinical_reader;
ALTER POLICY patient_diagnoses_select_professional        ON public.patient_diagnoses        TO clinical_reader;
ALTER POLICY patient_diagnoses_select_admin               ON public.patient_diagnoses        TO clinical_reader;
ALTER POLICY patient_clinical_history_select_professional ON public.patient_clinical_history TO clinical_reader;
ALTER POLICY patient_clinical_history_select_admin        ON public.patient_clinical_history TO clinical_reader;
ALTER POLICY treatment_plans_select_professional          ON public.treatment_plans          TO clinical_reader;
ALTER POLICY treatment_plans_select_admin                 ON public.treatment_plans          TO clinical_reader;
ALTER POLICY diary_entries_select_professional            ON public.diary_entries            TO clinical_reader;
ALTER POLICY diary_entries_select_admin                   ON public.diary_entries            TO clinical_reader;

-- diary_symptom_reports tem UMA politica para todo mundo (visibilidade
-- derivada do pai). Ela nao pode mudar de role sem cegar o paciente, entao
-- ganha uma GEMEA para o leitor auditado. O predicado e identico de proposito:
-- "vejo o filho se vejo o pai" continua valendo, agora sob os dois roles.
CREATE POLICY diary_symptom_reports_select_via_entry_reader ON public.diary_symptom_reports
  FOR SELECT TO clinical_reader
  USING ( EXISTS (SELECT 1 FROM public.diary_entries e WHERE e.id = diary_entry_id) );

-- audit_log: quem le a trilha e a administracao (modulo de auditoria do painel
-- administrativo). E metadado, nao conteudo clinico — por isso NAO paga o
-- proprio pedagio, sob pena de recursao infinita de trilha sobre trilha.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select_admin ON public.audit_log
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- 6. As funcoes read_* — o unico caminho de leitura clinica da equipe
-- ============================================================
--
-- Forma comum a todas: RETURN QUERY, depois GET DIAGNOSTICS ROW_COUNT, depois
-- o log. Logar ANTES de saber a contagem registraria uma leitura que a RLS
-- pode ter esvaziado — e "acessou 0 linhas" e justamente o que distingue
-- tentativa de acesso de acesso efetivo.
--
-- STABLE seria mentira: elas ESCREVEM na trilha. VOLATILE de proposito.

CREATE FUNCTION public.read_patients(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.patients
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT p.* FROM public.patients p
    ORDER BY p.full_name
    -- LEAST sem qualificacao: gramatica SQL, nao funcao (mesma familia de
    -- COALESCE e current_user). Teto de 200 no servidor — paginacao nao e
    -- gentileza do cliente quando a tabela e dado de saude.
    LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Lista: sem patient_id, com contagem. E a linha que denuncia varredura.
  PERFORM private.log_clinical_read('patients', NULL, v_count);
END;
$$;

CREATE FUNCTION public.read_patient(p_patient_id uuid)
RETURNS SETOF public.patients
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY SELECT p.* FROM public.patients p WHERE p.id = p_patient_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('patients', p_patient_id, v_count, p_patient_id);
END;
$$;

CREATE FUNCTION public.read_patient_diagnoses(p_patient_id uuid)
RETURNS SETOF public.patient_diagnoses
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY SELECT d.* FROM public.patient_diagnoses d
   WHERE d.patient_id = p_patient_id ORDER BY d.created_at DESC;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('patient_diagnoses', p_patient_id, v_count);
END;
$$;

CREATE FUNCTION public.read_patient_clinical_history(p_patient_id uuid)
RETURNS SETOF public.patient_clinical_history
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY SELECT h.* FROM public.patient_clinical_history h
   WHERE h.patient_id = p_patient_id ORDER BY h.created_at DESC;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('patient_clinical_history', p_patient_id, v_count);
END;
$$;

CREATE FUNCTION public.read_treatment_plans(p_patient_id uuid)
RETURNS SETOF public.treatment_plans
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY SELECT t.* FROM public.treatment_plans t
   WHERE t.patient_id = p_patient_id ORDER BY t.created_at DESC;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('treatment_plans', p_patient_id, v_count);
END;
$$;

-- Janela de 30 dias da timeline: p_before pagina por chave estavel, nao por
-- OFFSET (data-loading-pagination). O front-end DEVE filtrar por paciente —
-- aqui o parametro e obrigatorio, entao o contrato deixou de ser combinado
-- e virou assinatura.
CREATE FUNCTION public.read_diary_entries(
  p_patient_id uuid,
  p_limit      integer     DEFAULT 50,
  p_before     timestamptz DEFAULT NULL
)
RETURNS SETOF public.diary_entries
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT e.* FROM public.diary_entries e
     WHERE e.patient_id = p_patient_id
       AND (p_before IS NULL OR e.submitted_at < p_before)
     ORDER BY e.submitted_at DESC
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('diary_entries', p_patient_id, v_count);
END;
$$;

CREATE FUNCTION public.read_diary_symptom_reports(p_diary_entry_id uuid)
RETURNS SETOF public.diary_symptom_reports
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count      integer;
  v_patient_id uuid;
BEGIN
  RETURN QUERY SELECT r.* FROM public.diary_symptom_reports r
   WHERE r.diary_entry_id = p_diary_entry_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  -- Sob a RLS do clinical_reader: se ele nao ve o pai, fica NULL e o log
  -- registra o acesso sem paciente. Nao ha caminho para descobrir o titular
  -- de um registro que a politica esconde.
  SELECT e.patient_id INTO v_patient_id
    FROM public.diary_entries e WHERE e.id = p_diary_entry_id;
  PERFORM private.log_clinical_read('diary_symptom_reports', v_patient_id, v_count, p_diary_entry_id);
END;
$$;


-- ============================================================
-- 7. Trilha de escrita nas tabelas clinicas ja existentes (#12)
-- ============================================================

CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.patient_diagnoses
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.patient_clinical_history
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.treatment_plans
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.diary_entries
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');
-- patients: a propria ficha. O id da linha JA e o paciente.
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.patients
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('id');


-- ============================================================
-- 8. Privilegios — SEMPRE no fim (REVOKE so atinge o que ja existe)
-- ============================================================

-- Append-only tambem por privilegio, nao so por trigger: defesa em duas camadas
-- porque service_role ignora RLS e o trigger e a unica barreira que sobra.
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, service_role;

-- As funcoes read_* pertencem ao leitor auditado. E isto — e so isto — que faz
-- a RLS de clinical_reader valer dentro delas.
ALTER FUNCTION public.read_patients(integer, integer)                OWNER TO clinical_reader;
ALTER FUNCTION public.read_patient(uuid)                             OWNER TO clinical_reader;
ALTER FUNCTION public.read_patient_diagnoses(uuid)                   OWNER TO clinical_reader;
ALTER FUNCTION public.read_patient_clinical_history(uuid)            OWNER TO clinical_reader;
ALTER FUNCTION public.read_treatment_plans(uuid)                     OWNER TO clinical_reader;
ALTER FUNCTION public.read_diary_entries(uuid, integer, timestamptz) OWNER TO clinical_reader;
ALTER FUNCTION public.read_diary_symptom_reports(uuid)               OWNER TO clinical_reader;

-- Devolvido assim que a propriedade esta atribuida (ver o GRANT da secao 4).
REVOKE CREATE ON SCHEMA public FROM clinical_reader;

REVOKE EXECUTE ON FUNCTION private.log_clinical_read(text, uuid, integer, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.audit_write()                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.reject_audit_log_mutation()      FROM PUBLIC;

-- Quem pode PEDIR a leitura auditada: usuario autenticado (a politica dentro
-- decide se ele ve alguma linha) e service_role. Nao PUBLIC.
REVOKE EXECUTE ON FUNCTION public.read_patients(integer, integer)                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_patient(uuid)                             FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_patient_diagnoses(uuid)                   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_patient_clinical_history(uuid)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_treatment_plans(uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_diary_entries(uuid, integer, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_diary_symptom_reports(uuid)               FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.read_patients(integer, integer)                TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_patient(uuid)                             TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_patient_diagnoses(uuid)                   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_patient_clinical_history(uuid)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_treatment_plans(uuid)                     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_diary_entries(uuid, integer, timestamptz) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_diary_symptom_reports(uuid)               TO authenticated, service_role;
