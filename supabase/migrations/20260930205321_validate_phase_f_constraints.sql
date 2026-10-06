-- VALIDATE das duas constraints que create_staff_invitations criou NOT VALID.
-- Plano das pendencias do painel de 30/09/2026, Fase F.
--
-- Toda linha existente tem pending_confirmation = false (a coluna nasceu com
-- esse default), entao nao ha o que recusar. O VALIDATE fica em migration
-- propria pelo padrao do projeto: SHARE UPDATE EXCLUSIVE, sem bloquear
-- escrita, numa transacao que nao carrega o resto da fase.

ALTER TABLE public.professionals VALIDATE CONSTRAINT ck_professionals_pending_inactive;
ALTER TABLE public.admins        VALIDATE CONSTRAINT ck_admins_pending_inactive;
