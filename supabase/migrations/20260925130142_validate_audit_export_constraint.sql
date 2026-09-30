-- VALIDATE da constraint que record_data_exports recriou NOT VALID.
--
-- Migration separada pelo mesmo motivo de validate_audit_restricted_constraint:
-- VALIDATE toma SHARE UPDATE EXCLUSIVE, que nao bloqueia leitura nem escrita,
-- mas so vale a pena se nao estiver na mesma transacao do ADD, que segura
-- ACCESS EXCLUSIVE ate o COMMIT. As linhas antigas nao tem 'export', entao a
-- regra nova e a antiga coincidem sobre elas e o VALIDATE nao pode falhar.

ALTER TABLE public.audit_log VALIDATE CONSTRAINT ck_audit_log_row_count;
