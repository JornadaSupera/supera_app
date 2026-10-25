
-- O limiar do alerta legivel por quem registra o diario. Pendencia [43] do
-- time (24/10/2026). Racional: ADR-007, emenda §9.
--
-- O PROBLEMA: o requisito do Diario (nivel MEDIO) pede um banner quando um
-- sintoma e registrado em grau alto, e "grau alto" e a regra que o
-- administrador cadastra em alert_rules. O titular e o acompanhante nao leem
-- a tabela (so as politicas de profissional e de administrador), e o app
-- usava um corte fixo: o banner e o alerta da equipe se desencontravam.
--
-- O DESENHO: uma funcao sem argumento que devolve so (symptom_id, min_grade)
-- das regras VIGENTES. Nao ha dado de paciente aqui, e o banner ja revela o
-- limiar a quem registra: esconde-lo nao protegeria nada.
--
-- POR QUE NAO UMA POLITICA: RLS e por linha. Uma politica de SELECT para o
-- titular entregaria a linha inteira — created_by_account (a conta de quem
-- configurou) e o historico das vigencias encerradas, que so explica alerta
-- passado e nao interessa ao app.
--
-- Quem le: o titular, o acompanhante com a area `diary` (ADR-030) e a equipe,
-- que ja le a tabela. Qualquer outra conta recebe ZERO linhas, nao excecao: a
-- mesma semantica de uma leitura sob RLS. Sem pedagio da ADR-008: a tabela e
-- configuracao da clinica, sem titular.


-- ============================================================
-- 1. A funcao
-- ============================================================

CREATE FUNCTION public.get_symptom_alert_thresholds()
RETURNS TABLE (symptom_id uuid, min_grade smallint)
LANGUAGE sql
STABLE
SECURITY DEFINER              -- le alert_rules acima da RLS, so duas colunas
SET search_path = ''
AS $$
  SELECT ar.symptom_id, ar.min_grade
    FROM public.alert_rules ar
   WHERE ar.effective_to IS NULL
     AND (   private.my_own_patient_id() IS NOT NULL
          OR pg_catalog.cardinality(private.my_ward_patient_ids_for('diary')) > 0
          OR private.is_active_professional()
          OR private.is_active_admin())
   ORDER BY ar.symptom_id;
$$;

COMMENT ON FUNCTION public.get_symptom_alert_thresholds() IS
  'O grau minimo da regra de alerta VIGENTE de cada sintoma, para o banner do diario no app (pendencia [43], ADR-007 §9). So (symptom_id, min_grade): nem quem configurou, nem o historico. Le o titular, o acompanhante com a area diary e a equipe; qualquer outra conta recebe zero linhas. Sintoma sem linha nao alerta.';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- `FROM PUBLIC, anon`: o default privilege do Supabase concede a `anon` toda
-- funcao nova em `public` (armadilha 5), e revogar so de um deixa o outro.

REVOKE EXECUTE ON FUNCTION public.get_symptom_alert_thresholds() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_symptom_alert_thresholds() TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.get_symptom_alert_thresholds()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa get_symptom_alert_thresholds: a unica porta sem login e get_clinic_presentation (ADR-016)';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_symptom_alert_thresholds()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated nao executa get_symptom_alert_thresholds: o app nao leria o limiar';
  END IF;
END;
$$;
