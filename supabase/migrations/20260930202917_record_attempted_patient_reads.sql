-- Ler um paciente que nao existe deixa de dar 409 e passa a devolver vazio,
-- com a tentativa registrada na trilha.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.4 (painel #14).
-- Design e racional: supera-docs/ADRs/ADR-008 — Auditoria de leitura de dado clínico.md (emenda de 30/09/2026)
--
-- O DEFEITO. Toda read_* que recebe p_patient_id termina em
-- private.log_clinical_read, que grava o id em audit_log.patient_id — coluna
-- com FK para patients. Com um id que nao existe (ficha de outro ambiente,
-- link antigo, UUID digitado errado), a leitura falhava com 23503, que o
-- PostgREST traduz em 409 Conflict. Pior que o erro: a tentativa NAO ficava na
-- trilha, porque a transacao inteira desfazia. Uma varredura de ids por
-- tentativa e erro nao deixava rastro — justamente o que a trilha de leitura
-- existe para mostrar (ADR-008).
--
-- A CORRECAO MORA NUM LUGAR SO. log_clinical_read confere a existencia: se o
-- paciente existe, o id vai para patient_id, como sempre; se nao existe, vai
-- para a coluna nova attempted_patient_id, SEM FK. Todas as read_* (e
-- reveal_patient_identifiers) ficam corrigidas de uma vez, sem reescrever
-- nenhuma: a leitura volta vazia, com row_count = 0, e a trilha diz quem
-- tentou qual id.
--
-- POR QUE NAO UMA COLUNA details jsonb: a ADR-003 §6 manda a trilha guardar
-- metadado tipado, nunca conteudo livre. Uma coluna uuid e o minimo que
-- responde "que id tentaram abrir".
--
-- A CONSTRAINT. As duas colunas nunca andam juntas: ou o paciente existe e
-- esta em patient_id, ou nao existe e esta em attempted_patient_id. E a linha
-- anonima de material restrito (is_restricted_material) nao carrega nenhum
-- dos dois — a mesma regra de ck_audit_log_restricted_is_anonymous, estendida
-- a coluna nova. Nasce NOT VALID (audit_log e a tabela de maior volume) e
-- valida em validate_phase_e_constraints. Nenhuma linha existente viola: a
-- coluna nasce nula.
--
-- Leitura da trilha: o administrador ja le audit_log direto
-- (audit_log_select_admin). A coluna nova aparece para ele sem mais nada.


-- ============================================================
-- 1. A coluna e a constraint
-- ============================================================

ALTER TABLE public.audit_log
  ADD COLUMN attempted_patient_id uuid;

COMMENT ON COLUMN public.audit_log.attempted_patient_id IS
  'Id de paciente pedido numa leitura clinica quando a ficha NAO existe. Sem FK de proposito: e o registro da tentativa, nao um vinculo. Mutuamente exclusiva com patient_id, e nula na linha anonima de material restrito. Desde 30/09/2026.';

ALTER TABLE public.audit_log
  ADD CONSTRAINT ck_audit_log_attempted_patient
  CHECK (
    attempted_patient_id IS NULL
    OR (patient_id IS NULL AND NOT is_restricted_material)
  )
  NOT VALID;

-- A pergunta de quem investiga: "alguem andou tentando ids?". Parcial: a
-- esmagadora maioria das linhas tem a coluna nula.
CREATE INDEX idx_audit_log_attempted_patient
  ON public.audit_log (attempted_patient_id, occurred_at DESC)
  WHERE attempted_patient_id IS NOT NULL;


-- ============================================================
-- 2. log_clinical_read confere a existencia
-- ============================================================
--
-- CREATE OR REPLACE preserva o dono (postgres) e o ACL (EXECUTE para
-- clinical_reader e authenticated, conforme as migrations anteriores). A
-- conferencia roda como o dono, sem RLS: nao depende de quem chama enxergar a
-- ficha.
--
-- Custo: um lookup por PK em patients por leitura auditada. O pedagio ja faz
-- um INSERT; o EXISTS e da mesma ordem de grandeza e nao muda a curva.

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
     attempted_patient_id, row_count, origin, actor_capacity)
  SELECT auth.uid(), 'read', p_resource_table,
         -- reveal_patient_identifiers passa o proprio paciente como recurso.
         -- Se ele nao existe, o recurso tambem nao: nulo, e o id fica so em
         -- attempted_patient_id.
         CASE WHEN p_resource_id = p_patient_id AND NOT e.patient_exists
              THEN NULL ELSE p_resource_id END,
         CASE WHEN e.patient_exists THEN p_patient_id END,
         CASE WHEN NOT e.patient_exists THEN p_patient_id END,
         p_row_count, private.request_origin(), private.actor_capacity()
    FROM (SELECT p_patient_id IS NULL
                 OR EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id)
                 AS patient_exists) AS e;
$$;

COMMENT ON FUNCTION private.log_clinical_read(text, uuid, integer, uuid) IS
  'Pedagio da leitura clinica (ADR-008). Paciente existente vai para patient_id; inexistente vai para attempted_patient_id, e a leitura segue vazia em vez de falhar com 23503 (desde 30/09/2026).';


-- ============================================================
-- 3. Assercao de efeito
-- ============================================================
--
-- A funcao precisa continuar executavel por quem a chama em runtime: as read_*
-- rodam como clinical_reader. Um REPLACE nao mexe no ACL, mas a verificacao e
-- barata ao lado de descobrir no painel que toda leitura clinica quebrou.
DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege(
           'clinical_reader', 'private.log_clinical_read(text, uuid, integer, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader perdeu EXECUTE em private.log_clinical_read: toda read_* quebraria.';
  END IF;
  IF pg_catalog.has_function_privilege(
       'anon', 'private.log_clinical_read(text, uuid, integer, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa private.log_clinical_read: a trilha aceitaria linha forjada sem login.';
  END IF;
END;
$$;
