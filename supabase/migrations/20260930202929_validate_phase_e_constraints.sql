-- VALIDATE das duas constraints que a Fase E criou NOT VALID:
--   ck_audit_log_attempted_patient  (record_attempted_patient_reads, E.4)
--   ck_patients_address_shape       (constrain_patient_address, E.7)
-- Plano das pendencias do painel de 30/09/2026, Fase E.
--
-- Arquivo proprio pelo motivo de validate_audit_restricted_constraint: o
-- Squawk recusa NOT VALID + VALIDATE na mesma transacao, e em arquivos
-- separados o VALIDATE toma so SHARE UPDATE EXCLUSIVE, que nao bloqueia
-- leitura.
--
-- audit_log: nenhuma linha pode violar, a coluna nasceu nula.
--
-- patients.address: DEPENDE DO DADO. Antes do db push, conferir em
-- homologacao (so leitura, `supabase db query --linked`):
--
--   SELECT id, address FROM public.patients
--    WHERE address IS NOT NULL
--      AND NOT (
--        jsonb_typeof(address) = 'object'
--        AND (address - ARRAY['cep','logradouro','numero','complemento',
--                             'bairro','cidade','uf']) = '{}'::jsonb
--        AND NOT jsonb_path_exists(address, '$.* ? (@.type() != "string")')
--        AND (NOT (address ? 'uf') OR (address ->> 'uf') ~ '^[A-Z]{2}$'));
--
-- Havendo linha, corrigir pelo painel (update_patient) ANTES do push. Se o
-- VALIDATE falhar no push, esta migration desfaz sozinha (transacao por
-- arquivo) e as anteriores ficam: a constraint continua valendo para escrita
-- nova, e este arquivo se reaplica depois da correcao.

ALTER TABLE public.audit_log VALIDATE CONSTRAINT ck_audit_log_attempted_patient;
ALTER TABLE public.patients  VALIDATE CONSTRAINT ck_patients_address_shape;

-- ASSERCAO DE EFEITO: convalidated diz se a regra vale para o passado.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
     WHERE conname IN ('ck_audit_log_attempted_patient', 'ck_patients_address_shape')
       AND NOT convalidated
  ) OR (
    SELECT count(*) FROM pg_catalog.pg_constraint
     WHERE conname IN ('ck_audit_log_attempted_patient', 'ck_patients_address_shape')
  ) <> 2 THEN
    RAISE EXCEPTION 'as constraints da Fase E nao estao as duas presentes e validadas.';
  END IF;
END;
$$;
