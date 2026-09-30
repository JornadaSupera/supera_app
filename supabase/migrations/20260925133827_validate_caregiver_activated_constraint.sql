-- VALIDATE da constraint que create_caregiver_accounts criou NOT VALID.
--
-- Migration separada pelo mesmo motivo de validate_audit_export_constraint:
-- VALIDATE toma SHARE UPDATE EXCLUSIVE, que nao bloqueia leitura nem escrita,
-- mas so vale a pena fora da transacao do ADD, que segura ACCESS EXCLUSIVE ate
-- o COMMIT. A migration anterior preencheu `activated_at` em toda linha antiga,
-- entao o VALIDATE nao pode falhar.

ALTER TABLE public.patient_caregivers VALIDATE CONSTRAINT ck_patient_caregivers_activated;
