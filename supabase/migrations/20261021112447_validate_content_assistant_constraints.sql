-- VALIDATE das tres constraints que create_content_assistant_usage criou NOT
-- VALID em clinic_settings. ADR-033.
--
-- A linha unica ganhou os defaults (20, 500, 5), todos dentro das faixas,
-- entao nao ha o que recusar. O VALIDATE fica em migration propria pelo
-- padrao do projeto: SHARE UPDATE EXCLUSIVE, sem bloquear escrita.

ALTER TABLE public.clinic_settings VALIDATE CONSTRAINT ck_clinic_settings_ai_hourly_limit;
ALTER TABLE public.clinic_settings VALIDATE CONSTRAINT ck_clinic_settings_ai_question_max_chars;
ALTER TABLE public.clinic_settings VALIDATE CONSTRAINT ck_clinic_settings_content_request_daily_limit;
