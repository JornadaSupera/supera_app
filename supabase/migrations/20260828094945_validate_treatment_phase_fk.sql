-- Valida a FK criada NOT VALID na migration anterior.
--
-- Por que e uma migration separada: o Supabase aplica cada migration dentro de
-- uma transacao. NOT VALID + VALIDATE na mesma transacao bloqueia leitura
-- durante a varredura — o oposto do motivo de ter separado. Em transacao
-- propria, o VALIDATE roda sob SHARE UPDATE EXCLUSIVE e nao bloqueia escrita.
--
-- Hoje custa zero (patients esta vazia). O padrao existe para quando nao estiver.

ALTER TABLE public.patients VALIDATE CONSTRAINT fk_patients_treatment_phase;
