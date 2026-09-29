-- As areas do acompanhante. Pendencia 32, de 28/09/2026 (Fase C1 do plano de
-- 29/09/2026). Decisao na ADR-030; mudanca de escopo aceita pela CEON em
-- 29/09/2026.
--
-- ATE AQUI o acesso do acompanhante era um so: vinculo `active` abria agenda
-- da equipe, diario, chat, orientacoes e dados clinicos do tutelado, tudo ou
-- nada. A partir desta fase o TITULAR escolhe, area por area, o que o
-- acompanhante alcanca. O vinculo continua sendo a porta; a area e o comodo.
--
-- AS CINCO AREAS (enum, e nao tabela de dominio: cada valor corresponde a um
-- trecho de politica escrito a mao na migration apply_caregiver_scopes_to_reads.
-- Area nova sem politica seria uma chave sem fechadura — tem de nascer junto
-- com o SQL que a respeita, por migration):
--   schedule        compromissos `team` e a confirmacao de presenca
--   diary           diario e sintomas (ler, escrever, editar rascunho)
--   chat            conversas `team`, mensagens e anexos
--   resources       orientacoes publicadas
--   clinical_record diagnosticos, plano terapeutico e historico clinico
--
-- O QUE A LINHA DIZ: "neste vinculo, esta area esta ligada ou desligada". A
-- AUSENCIA de linha NEGA (fail-closed, ADR-003). Por isso todo vinculo nasce
-- com as cinco — pelo trigger desta migration, qualquer que seja o caminho
-- que o criou — e os vinculos de hoje recebem as cinco no backfill abaixo.
--
-- TODAS NASCEM LIGADAS, inclusive clinical_record (confirmado pelo usuario em
-- 29/09/2026): o acompanhante de hoje continua vendo exatamente o que ve, e o
-- titular passa a poder desligar. Nascer desligada mudaria, sem aviso, a tela
-- de quem ja usa o app.
--
-- DESVIO DO PEDIDO: `id` como PK e (link_id, scope) como UNIQUE, e nao a PK
-- composta. private.audit_write le NEW.id; com PK composta a trilha gravaria
-- resource_id = NULL ("o titular mudou algo", sem dizer o que).


-- ============================================================
-- 1. O tipo e a tabela
-- ============================================================

CREATE TYPE public.caregiver_scope AS ENUM
  ('schedule', 'diary', 'chat', 'resources', 'clinical_record');

COMMENT ON TYPE public.caregiver_scope IS
  'Areas que o titular liga ou desliga para o acompanhante (ADR-030). A ordem do enum e a ordem da tela.';

CREATE TABLE public.patient_caregiver_scopes (
  id                 uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  link_id            uuid NOT NULL REFERENCES public.patient_caregivers (id) ON DELETE CASCADE,
  -- Copiado do vinculo pelo trigger abaixo, nunca informado pelo chamador.
  -- Existe para a RLS do titular e para a trilha (audit_write('patient_id')).
  patient_id         uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  scope              public.caregiver_scope NOT NULL,
  enabled            boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  -- NULL = o padrao da criacao do vinculo. Preenchido so por set_caregiver_scope.
  updated_by_account uuid REFERENCES public.accounts (id) ON DELETE RESTRICT,
  CONSTRAINT uq_patient_caregiver_scopes UNIQUE (link_id, scope)
);

COMMENT ON TABLE public.patient_caregiver_scopes IS
  'Uma linha por area por vinculo de acompanhante (ADR-030). Linha ausente nega. Escrita so por triggers e por set_caregiver_scope; o app le por get_caregiver_scopes (titular) e get_my_ward_scopes (acompanhante).';

-- (link_id, scope) ja e coberto pelo UNIQUE. As outras duas FKs ganham
-- indice (panel_reads.test.sql falha nomeando FK sem indice).
CREATE INDEX idx_patient_caregiver_scopes_patient
  ON public.patient_caregiver_scopes (patient_id);
CREATE INDEX idx_patient_caregiver_scopes_updated_by
  ON public.patient_caregiver_scopes (updated_by_account)
  WHERE updated_by_account IS NOT NULL;


-- ============================================================
-- 2. patient_id vem do vinculo
-- ============================================================
--
-- Nao confiar no chamador: uma linha com o link de um paciente e o patient_id
-- de outro mostraria ao titular errado uma area que nao e dele. O trigger
-- sobrescreve o que vier.

CREATE FUNCTION private.set_caregiver_scope_patient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT pc.patient_id INTO NEW.patient_id
    FROM public.patient_caregivers pc
   WHERE pc.id = NEW.link_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'vinculo de acompanhante inexistente' USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_caregiver_scope_patient
BEFORE INSERT OR UPDATE OF link_id, patient_id ON public.patient_caregiver_scopes
FOR EACH ROW
EXECUTE FUNCTION private.set_caregiver_scope_patient();

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.patient_caregiver_scopes
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

-- Trilha de UPDATE e DELETE sempre; de INSERT, so quando alguem o fez
-- (updated_by_account preenchido — set_caregiver_scope recriando uma linha
-- que sumiu). O INSERT do padrao acompanha a criacao do vinculo, e a criacao
-- ja esta na trilha (trg_audit_write de patient_caregivers): cinco linhas de
-- "create" por vinculo seriam ruido que nao diz nada que a outra nao diga.
CREATE TRIGGER trg_audit_write
AFTER UPDATE OR DELETE ON public.patient_caregiver_scopes
FOR EACH ROW
EXECUTE FUNCTION private.audit_write('patient_id');

CREATE TRIGGER trg_audit_write_insert
AFTER INSERT ON public.patient_caregiver_scopes
FOR EACH ROW
WHEN (NEW.updated_by_account IS NOT NULL)
EXECUTE FUNCTION private.audit_write('patient_id');


-- ============================================================
-- 3. Todo vinculo nasce com as cinco areas ligadas
-- ============================================================
--
-- AFTER INSERT em patient_caregivers, e nao dentro de link_caregiver_account:
-- o vinculo tem mais de um caminho de criacao (a RPC do acompanhante, o
-- convite antigo, o INSERT direto das fixtures e de um eventual suporte), e
-- a area ausente nega. Um caminho esquecido criaria acompanhante que nao ve
-- nada, sem erro.

CREATE FUNCTION private.seed_caregiver_scopes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.patient_caregiver_scopes (link_id, patient_id, scope)
  SELECT NEW.id, NEW.patient_id, s
    FROM pg_catalog.unnest(pg_catalog.enum_range(NULL::public.caregiver_scope)) AS s
  ON CONFLICT (link_id, scope) DO NOTHING;

  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$$;

CREATE TRIGGER trg_seed_caregiver_scopes
AFTER INSERT ON public.patient_caregivers
FOR EACH ROW
EXECUTE FUNCTION private.seed_caregiver_scopes();


-- ============================================================
-- 4. Backfill
-- ============================================================
--
-- Os vinculos vivos (pending e active) ganham as cinco ligadas. Os revogados
-- ficam sem linha: nao alcancam nada de qualquer forma, e inventar para eles
-- um historico de areas que nunca existiu seria mentir na tabela.

INSERT INTO public.patient_caregiver_scopes (link_id, patient_id, scope)
SELECT pc.id, pc.patient_id, s
  FROM public.patient_caregivers pc
 CROSS JOIN pg_catalog.unnest(pg_catalog.enum_range(NULL::public.caregiver_scope)) AS s
 WHERE pc.status IN ('pending', 'active')
ON CONFLICT (link_id, scope) DO NOTHING;


-- ============================================================
-- 5. RLS
-- ============================================================
--
-- Nenhuma politica de escrita: a escrita e por set_caregiver_scope, que grava
-- quem mudou. A leitura do app e pelas RPCs, mas o titular tambem le as
-- proprias linhas direto — sao dele.

ALTER TABLE public.patient_caregiver_scopes ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_caregiver_scopes_select_own
  ON public.patient_caregiver_scopes
  FOR SELECT TO authenticated
  USING (patient_id = (SELECT private.my_own_patient_id()));


-- ============================================================
-- 6. Privilegios — SEMPRE no fim
-- ============================================================
--
-- O default privilege de postgres em `public` da a authenticated
-- INSERT/UPDATE/DELETE; sem politica nenhuma a RLS ja nega, mas a segunda
-- porta fechada e o padrao do projeto (revoke_unused_write_privileges).
-- service_role fica como em patient_caregivers.

REVOKE ALL ON TABLE public.patient_caregiver_scopes FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON TABLE public.patient_caregiver_scopes FROM authenticated;
GRANT SELECT ON TABLE public.patient_caregiver_scopes TO authenticated;

-- Funcoes de trigger: ninguem as chama direto.
REVOKE EXECUTE ON FUNCTION private.set_caregiver_scope_patient() FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.seed_caregiver_scopes()       FROM PUBLIC, anon, authenticated, service_role;


-- ============================================================
-- 7. Assercao de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
BEGIN
  IF pg_catalog.has_table_privilege('anon', 'public.patient_caregiver_scopes', 'SELECT, INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'anon alcanca patient_caregiver_scopes';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated', 'public.patient_caregiver_scopes', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'authenticated escreve direto em patient_caregiver_scopes';
  END IF;
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.patient_caregiver_scopes', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated perdeu SELECT em patient_caregiver_scopes — a politica do titular morreria';
  END IF;

  IF pg_catalog.has_function_privilege('authenticated', 'private.seed_caregiver_scopes()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'private.set_caregiver_scope_patient()', 'EXECUTE') THEN
    RAISE EXCEPTION 'funcao de trigger das areas alcancavel pela API';
  END IF;

  -- O outro lado: o REVOKE nao pode ter levado o que o sistema inteiro usa.
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;

  -- O backfill cobriu todo vinculo vivo.
  IF EXISTS (
    SELECT 1 FROM public.patient_caregivers pc
     WHERE pc.status IN ('pending', 'active')
       AND (SELECT count(*) FROM public.patient_caregiver_scopes s WHERE s.link_id = pc.id) <> 5
  ) THEN
    RAISE EXCEPTION 'vinculo vivo sem as cinco areas depois do backfill';
  END IF;
END;
$$;
