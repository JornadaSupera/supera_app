-- Núcleo de identidade e acesso do Jornada Supera.
-- Design e racional: supera-docs/Modelo de Dados/Identidade e acesso.md
-- Decisões: ADR-001 (nomes/PK), ADR-002 (vocabulário), ADR-003 (RLS multi-perfil).
--
-- Aqui auth.uid() vira PERFIL. Nenhuma tabela clínica pode nascer antes desta:
-- os helpers private.* deste arquivo são o predicado de toda política do sistema.

-- Schema dos helpers de autorização. NÃO está em db-schemas do config.toml:
-- inalcançável pelo PostgREST, para não virar oráculo de enumeração.
CREATE SCHEMA private;


-- ============================================================
-- Tabelas
-- ============================================================

-- Âncora da identidade: uma linha por pessoa que autentica.
-- PK reusa auth.users.id — exceção deliberada à ADR-001 (uuidv7), para que
-- toda política compare com auth.uid() sem pagar um join.
CREATE TABLE public.accounts (
  id         uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  -- NULLABLE de propósito: a conta nasce no trigger de auth.users, ANTES de o
  -- onboarding coletar o nome. Com NOT NULL, o signup sem full_name no metadata
  -- falha por inteiro (medido). A CHECK barra só string vazia.
  full_name  text CHECK (full_name IS NULL OR length(btrim(full_name)) > 0),
  -- citext: e-mail é case-insensitive na prática; UNIQUE sobre text deixaria
  -- Maria@ceon e maria@ceon virarem duas identidades.
  email      extensions.citext NOT NULL UNIQUE,
  phone      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.accounts IS
  'Identidade comum aos quatro perfis. PK = auth.users.id (exceção à ADR-001).';
COMMENT ON COLUMN public.accounts.is_active IS
  'Pode autenticar. Distinto do is_active de cada perfil, que diz se exerce o papel.';

-- Paciente: existe ANTES de ter conta (cadastrado pela secretaria).
CREATE TABLE public.patients (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- NULLABLE: enquanto for NULL, my_own_patient_id() nunca devolve esta linha —
  -- invisível ao titular, visível a profissional e admin. Fail-closed.
  -- SET NULL, não CASCADE: apagar a conta do Auth não apaga o prontuário.
  account_id      uuid UNIQUE REFERENCES public.accounts (id) ON DELETE SET NULL,
  full_name       text NOT NULL CHECK (length(btrim(full_name)) > 0),
  -- Sem máscara: o Gemed resolve o cadastro por CPF, e normalizar na escrita
  -- evita que 123.456.789-00 e 12345678900 virem dois pacientes.
  cpf             text NOT NULL UNIQUE CHECK (cpf ~ '^[0-9]{11}$'),
  birth_date      date NOT NULL,
  -- Identificador de origem: base da idempotência do upsert de sincronização.
  gemed_source_id text UNIQUE,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.patients.account_id IS
  'NULL enquanto o paciente não ativou a conta. Requisito do fluxo de cadastro.';

CREATE TABLE public.professionals (
  id                   uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id           uuid NOT NULL UNIQUE REFERENCES public.accounts (id) ON DELETE CASCADE,
  -- CRM/CRF/COREN/CRN/CRP/CRO/CREFITO. Nullable e sem validação de formato
  -- enquanto a questão #14 estiver aberta — nenhuma fonte detalha o registro.
  council_registration text,
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.admins (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id uuid NOT NULL UNIQUE REFERENCES public.accounts (id) ON DELETE CASCADE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2FA obrigatório do administrador é política de MFA do Auth, não coluna:
-- manter cópia de estado do Auth no banco só criaria divergência.

CREATE TABLE public.caregivers (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  account_id uuid NOT NULL UNIQUE REFERENCES public.accounts (id) ON DELETE CASCADE,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.caregivers IS
  'A pessoa-cuidadora. O VÍNCULO paciente x cuidador é do agregado Vínculos.';

-- Tabela de domínio (ADR-002): recebe FK, logo não é enum.
CREATE TABLE public.specialties (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code            text NOT NULL UNIQUE,
  label           text NOT NULL,
  sort_order      smallint NOT NULL DEFAULT 0,
  -- REGRA DE SEGURANÇA, não metadado: implementa sozinha a resposta #9 da CEON
  -- (toda especialidade lê todas, exceto psicologia). Escrita é privilégio de
  -- migration/service_role — nunca de política de authenticated, nem do admin.
  is_confidential boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.specialties.is_confidential IS
  'Psicologia. Virar esta flag muda o sigilo de toda a plataforma, retroativamente.';

-- As sete do Anexo I. Vive na migration, não em seed: seed NÃO roda em db push,
-- e um ambiente com specialties vazia não vincula profissional (FK RESTRICT).
INSERT INTO public.specialties (code, label, sort_order, is_confidential) VALUES
  ('oncology',      'Oncologia',    1, false),
  ('pharmacy',      'Farmácia',     2, false),
  ('nursing',       'Enfermagem',   3, false),
  ('nutrition',     'Nutrição',     4, false),
  ('psychology',    'Psicologia',   5, true),
  ('dentistry',     'Odontologia',  6, false),
  ('physiotherapy', 'Fisioterapia', 7, false)
ON CONFLICT (code) DO NOTHING;

-- Junção TEMPORAL, não coluna em professionals: com a escrita amarrada à
-- especialidade (#9), um UPDATE de coluna mudaria retroativamente o que a
-- pessoa pode escrever e enxergar, sem deixar rastro.
CREATE TABLE public.professional_specialties (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  -- RESTRICT: apagar uma das sete com profissional vinculado tem de falhar alto.
  -- A saída correta é is_active = false.
  specialty_id    uuid NOT NULL REFERENCES public.specialties (id) ON DELETE RESTRICT,
  is_primary      boolean NOT NULL DEFAULT false,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_professional_specialties_period
    CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- Sem estes dois, a junção temporal vira lixeira: duas vigências idênticas
-- fariam my_specialty_ids() devolver duplicatas, inflando o = ANY() de toda
-- política de escrita clínica.
CREATE UNIQUE INDEX uq_professional_specialties_active
  ON public.professional_specialties (professional_id, specialty_id)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX uq_professional_specialties_primary
  ON public.professional_specialties (professional_id)
  WHERE is_primary AND ended_at IS NULL;

-- Costura da questão #12. Nascem VAZIAS de propósito: a CEON respondeu que não
-- há diferença entre profissionais da mesma especialidade. É a única parte do
-- desenho que NÃO seria aditiva depois — criar níveis sem a costura instalada
-- significaria reescrever todas as políticas do sistema.
CREATE TABLE public.permissions (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code       text NOT NULL UNIQUE,
  label      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.professional_permissions (
  id                 uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  professional_id    uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  permission_id      uuid NOT NULL REFERENCES public.permissions (id) ON DELETE CASCADE,
  granted_at         timestamptz NOT NULL DEFAULT now(),
  granted_by_account uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  UNIQUE (professional_id, permission_id)
);


-- ============================================================
-- Trigger de criação da conta
-- ============================================================

-- SECURITY DEFINER porque o INSERT ocorre no fluxo do Auth, sem authenticated
-- no comando. nullif(btrim(...)) impede que nome em branco vire string vazia.
CREATE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- coalesce/nullif SEM schema: são produções da gramática SQL, não funções;
  -- pg_catalog.coalesce() não existe. Sendo gramática, não é sequestrável por
  -- search_path. Mesmo caso do overlay posicional em add_shared_functions.
  INSERT INTO public.accounts (id, full_name, email, phone)
  VALUES (
    NEW.id,
    nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
    NEW.email,
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_handle_new_auth_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ============================================================
-- Helpers de autorização (ADR-003 §1 e §2)
-- ============================================================
--
-- Superfície mais crítica do sistema: rodam como o dono das tabelas, logo
-- qualquer bug de lógica aqui é bypass total de RLS. Todos checam OS DOIS
-- níveis de is_active (conta e perfil) — é o que torna a revogação instantânea.
--
-- Como usar em política:
--   escalar/booleano -> (SELECT private.f())                            [InitPlan]
--   plural (uuid[])  -> col = ANY (ARRAY(SELECT unnest(private.f())))   [InitPlan]
-- A forma col = ANY ((SELECT f())) NÃO COMPILA com uuid[]; e = ANY (f())
-- compila mas é avaliada por linha (medido: 3.780 ms vs 34 ms em 200k linhas).

-- #10: todos os profissionais veem todos os pacientes -> predicado é BOOLEANO,
-- não conjunto. Some o risco de política por array com a base inteira.
CREATE FUNCTION private.is_active_professional()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.professionals p
    JOIN public.accounts a ON a.id = p.account_id
    WHERE a.id = auth.uid()
      AND a.is_active
      AND p.is_active
  );
$$;

CREATE FUNCTION private.is_active_admin()
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
  );
$$;

-- Escalar e SÓ do titular — nunca compartilhado com o cuidador (ADR-003 §2).
-- NULL para quem não é paciente => coluna = NULL nunca é verdadeiro => fail-closed.
CREATE FUNCTION private.my_own_patient_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id
  FROM public.patients p
  JOIN public.accounts a ON a.id = p.account_id
  WHERE a.id = auth.uid()
    AND a.is_active
    AND p.is_active;
$$;

-- Base da regra de ESCRITA por especialidade (#9).
-- coalesce para '{}': array_agg sobre zero linhas devolve NULL, e = ANY (NULL)
-- nega por acidente de três valores. '{}' nega explicitamente.
CREATE FUNCTION private.my_specialty_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(ps.specialty_id), '{}'::uuid[])
  FROM public.professional_specialties ps
  JOIN public.professionals p ON p.id = ps.professional_id
  JOIN public.accounts      a ON a.id = p.account_id
  WHERE a.id = auth.uid()
    AND a.is_active
    AND p.is_active
    AND ps.ended_at IS NULL;
$$;

-- Semântica deliberada: permissão AUSENTE do catálogo não restringe nada.
-- Catálogo vazio (#12) => tudo passa, custo de runtime zero.
CREATE FUNCTION private.has_permission(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = p_code)
      OR EXISTS (
        SELECT 1
        FROM public.professional_permissions pp
        JOIN public.permissions   pm ON pm.id = pp.permission_id
        JOIN public.professionals p  ON p.id  = pp.professional_id
        WHERE pm.code = p_code
          AND p.account_id = auth.uid()
          AND p.is_active
      );
$$;


-- ============================================================
-- RPC de escrita administrativa
-- ============================================================

-- Padrão de toda escrita administrativa: SECURITY DEFINER COM checagem
-- explícita de is_active_admin() no corpo. Sem essa linha, é escalada de
-- privilégio para qualquer autenticado.
CREATE FUNCTION public.set_account_active(p_account_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.accounts SET is_active = p_is_active WHERE id = p_account_id;
  -- TODO(auditoria): registrar em audit_log quando o agregado existir (#12).
END;
$$;


-- ============================================================
-- RLS
-- ============================================================
--
-- REGRA: um perfil, uma política. Nenhum predicado atende dois perfis —
-- políticas permissivas se somam por OR, e a mais larga vence.

ALTER TABLE public.accounts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professionals            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caregivers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.specialties              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_permissions ENABLE ROW LEVEL SECURITY;

-- accounts. Sem política de INSERT/DELETE: a conta nasce do trigger em
-- auth.users e morre com ela; default deny cobre o resto.
CREATE POLICY accounts_select_own ON public.accounts
  FOR SELECT TO authenticated
  USING ( id = (SELECT public.get_my_uid()) );

CREATE POLICY accounts_select_professional ON public.accounts
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY accounts_select_admin ON public.accounts
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY accounts_update_own ON public.accounts
  FOR UPDATE TO authenticated
  USING      ( id = (SELECT public.get_my_uid()) )
  WITH CHECK ( id = (SELECT public.get_my_uid()) );

-- patients: SOMENTE LEITURA para authenticated, inclusive para o titular.
-- Toda coluna é cadastro espelhado do Gemed ou ato administrativo auditado.
-- O que o paciente edita (nome, telefone) está em accounts.
CREATE POLICY patients_select_own ON public.patients
  FOR SELECT TO authenticated
  USING ( id = (SELECT private.my_own_patient_id()) );

CREATE POLICY patients_select_professional ON public.patients
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY patients_select_admin ON public.patients
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- patients_select_caregiver entra na migration do agregado Vínculos, quando
-- my_ward_patient_ids() existir. Até lá o cuidador é negado por default deny.

-- Catálogo da equipe: o paciente precisa saber com quem conversa e quem o atende.
-- Nenhuma política de escrita — cadastrar profissional e atribuir especialidade
-- são atos do admin via RPC, porque a atribuição DECIDE O QUE A PESSOA ESCREVE.
CREATE POLICY specialties_select_authenticated ON public.specialties
  FOR SELECT TO authenticated USING ( true );

CREATE POLICY professionals_select_authenticated ON public.professionals
  FOR SELECT TO authenticated USING ( true );

CREATE POLICY professional_specialties_select_authenticated ON public.professional_specialties
  FOR SELECT TO authenticated USING ( true );

-- admins é a tabela mais fechada: quem é sócio da CEON não é informação que
-- paciente ou profissional precise consultar.
CREATE POLICY admins_select_own ON public.admins
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY admins_select_admin ON public.admins
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY caregivers_select_own ON public.caregivers
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );

CREATE POLICY caregivers_select_professional ON public.caregivers
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY caregivers_select_admin ON public.caregivers
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY permissions_select_admin ON public.permissions
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE POLICY professional_permissions_select_admin ON public.professional_permissions
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- Índices
-- ============================================================

-- FK não é indexada automaticamente pelo Postgres.
CREATE INDEX idx_professional_specialties_professional_id
  ON public.professional_specialties (professional_id);
CREATE INDEX idx_professional_specialties_specialty_id
  ON public.professional_specialties (specialty_id);
CREATE INDEX idx_professional_permissions_professional_id
  ON public.professional_permissions (professional_id);
CREATE INDEX idx_professional_permissions_permission_id
  ON public.professional_permissions (permission_id);

-- Colunas que aparecem em política. account_id de patients e professionals já
-- tem índice pelo UNIQUE; admins e caregivers ganham parcial porque o filtro
-- sempre carrega is_active.
CREATE INDEX idx_admins_account_id_active
  ON public.admins (account_id) WHERE is_active;
CREATE INDEX idx_caregivers_account_id_active
  ON public.caregivers (account_id) WHERE is_active;


-- ============================================================
-- Triggers de updated_at
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.accounts
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patients
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.professionals
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.admins
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.caregivers
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.specialties
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Privilégios — REVOKE no FIM, GRANT cirúrgico
-- ============================================================
--
-- REVOKE ... ON ALL FUNCTIONS só atinge funções JÁ EXISTENTES: invertido, é
-- no-op silencioso.

GRANT USAGE ON SCHEMA private TO authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;

-- authenticated PRECISA de EXECUTE: o Postgres verifica o privilégio do usuário
-- corrente ao AVALIAR A POLÍTICA — sem ele, toda query falha com permission
-- denied. A revogação que importa é outra e já está feita: private fora de
-- db-schemas, portanto sem rota de RPC.
GRANT EXECUTE ON FUNCTION private.is_active_professional() TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_active_admin()        TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_own_patient_id()      TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_specialty_ids()       TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_permission(text)     TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_account_active(uuid, boolean) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_account_active(uuid, boolean) TO authenticated;

-- RLS é por LINHA e não distingue coluna: accounts_update_own deixaria o titular
-- editar o próprio is_active (auto-reativação após desligamento pelo admin).
-- A defesa é privilégio de coluna. Aqui não é preciso distinguir perfil —
-- NINGUÉM edita o próprio is_active; o admin passa por set_account_active().
REVOKE UPDATE ON public.accounts FROM authenticated;
GRANT  UPDATE (full_name, phone) ON public.accounts TO authenticated;
