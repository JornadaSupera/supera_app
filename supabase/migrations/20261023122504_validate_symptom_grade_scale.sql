-- VALIDATE das tres constraints que widen_symptom_grade_scale criou NOT VALID.
-- ADR-007 §8.
--
-- A conversao x2 deixou todo grau em 0..10 e todo minimo em 2..10, entao nao
-- ha o que recusar. O VALIDATE fica em migration propria pelo padrao do
-- projeto: SHARE UPDATE EXCLUSIVE, sem bloquear escrita.

ALTER TABLE public.diary_symptom_reports VALIDATE CONSTRAINT ck_diary_symptom_reports_grade;
ALTER TABLE public.alerts                VALIDATE CONSTRAINT ck_alerts_grade;
ALTER TABLE public.alert_rules           VALIDATE CONSTRAINT ck_alert_rules_min_grade;
