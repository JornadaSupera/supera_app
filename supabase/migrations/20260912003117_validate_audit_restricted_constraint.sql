-- VALIDATE da constraint que nasceu NOT VALID em enrich_audit_trail.
-- Design e racional: supera-docs/ADRs/ADR-022 — O que ainda dependia so de nos.md
--
-- Migration separada pelo mesmo motivo de validate_treatment_phase_fk e
-- validate_deferred_constraints: `ADD CONSTRAINT` com validacao imediata toma
-- ACCESS EXCLUSIVE e varre a tabela inteira. `audit_log` e a de maior volume do
-- sistema, e ela cresce a cada leitura clinica.
--
-- Squawk recusa NOT VALID + VALIDATE na MESMA transacao, e recusa com razao: no
-- mesmo comando o par nao economiza nada, so esconde a varredura atras de duas
-- linhas. Em arquivos separados, cada `db push` aplica um, e o VALIDATE toma
-- apenas SHARE UPDATE EXCLUSIVE — que nao bloqueia leitura.
--
-- Nenhuma linha existente pode violar a regra: `is_restricted_material` nasceu
-- com DEFAULT false no arquivo anterior, e so
-- `private.log_restricted_material_read` escreve `true`, sempre com paciente e
-- recurso nulos.

ALTER TABLE public.audit_log VALIDATE CONSTRAINT ck_audit_log_restricted_is_anonymous;

-- ASSERCAO DE EFEITO (ADR-016): `convalidated` e o que diz se a regra passa a
-- valer para o passado tambem. Um VALIDATE que nao tomou efeito deixaria a
-- constraint checando apenas linha nova, e ninguem notaria.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname = 'ck_audit_log_restricted_is_anonymous'
       AND conrelid = 'public.audit_log'::regclass
       AND convalidated
  ) THEN
    RAISE EXCEPTION
      'ck_audit_log_restricted_is_anonymous continua NOT VALID: a marca de material restrito poderia carregar o titular em linha antiga.';
  END IF;
END;
$$;
