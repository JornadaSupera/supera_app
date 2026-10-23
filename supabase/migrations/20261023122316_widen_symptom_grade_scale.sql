-- A escala de intensidade passa de 0..5 para 0..10. Pedido da CEON
-- (23/10/2026), para padronizar com os processos internos da clinica. Emenda
-- §8 a ADR-007.
--
-- 0 A 10, E NAO 1 A 10. O zero continua dizendo "marquei o sintoma e ele nao
-- me incomodou", e e o mesmo intervalo da escala numerica do ESAS. O minimo da
-- regra de alerta continua em 1, pelo motivo de antes: com minimo 0, todo
-- registro do diario dispararia alerta.
--
-- O QUE JA EXISTE E CONVERTIDO x2, nos tres lugares ao mesmo tempo: o grau do
-- registro, a copia do grau no alerta e o minimo da regra (vigente ou nao).
-- 0 -> 0, 3 -> 6, 5 -> 10. Converter so uma das tres colunas quebraria duas
-- garantias que o projeto ja assume:
--   - alerts.grade e copia que NAO PODE DIVERGIR de diary_symptom_reports.grade
--     (comentario de alerts.grade em create_alerts);
--   - todo alerta e explicavel pela regra que o disparou: alerts.grade >=
--     alert_rules.min_grade da linha em alerts.alert_rule_id.
-- Fechar a vigencia das regras antigas e abrir regras novas em x2 manteria o
-- historico das regras, mas deixaria os alertas antigos (convertidos) apontando
-- para minimos na escala velha. A historia inteira muda de escala, de uma vez.
--
-- O limiar convertido NAO e decisao clinica nova: "a partir de 4 de 5" vira "a
-- partir de 8 de 10". Os graus impares (1, 3, 5, 7, 9) nascem agora, e quem
-- decide se o corte desce para 7 e o administrador, por set_alert_rule, como
-- sempre (ADR-007 §1: limiar clinico nao se inventa).
--
-- AS TRAVAS SE DESLIGAM SO DURANTE A CONVERSAO, E SO AS DUAS QUE A IMPEDEM:
-- trg_enforce_parent_draft (sintoma de registro salvo nao se altera) e
-- trg_enforce_alert_transition (a origem do alerta, grau incluido, e imutavel).
-- A auditoria (trg_audit_write) e o updated_at continuam ligados: a conversao
-- e uma alteracao real e fica na trilha, sem ator (auth.uid() nulo na
-- migration). DISABLE TRIGGER toma ACCESS EXCLUSIVE ate o fim da transacao; o
-- volume em homologacao e de dados de teste, e producao ainda nao existe.
--
-- O CHECK novo nasce NOT VALID e se valida em validate_symptom_grade_scale,
-- como nas fases anteriores. A verificacao no fim deste arquivo ja confere a
-- conversao; a validacao confere que nenhuma linha ficou fora de 0..10.
--
-- Nenhuma funcao fixa o intervalo: o gatilho de alerta compara grade >=
-- min_grade, e os resumos do painel agrupam pelo grau que existir. So os CHECK
-- e os comentarios mudam.
--
-- O FORA DO BANCO: o app troca as seis carinhas por onze pontos; o resumo do
-- diario para o Gemed (#15, ainda desligado) leva o grau 0..10.


-- ============================================================
-- 1. Os limites antigos saem
-- ============================================================
--
-- Nomes gerados pelo Postgres para o CHECK inline. Se um deles nao existir com
-- este nome, a migration morre aqui, e nao convive com dois limites.

ALTER TABLE public.diary_symptom_reports DROP CONSTRAINT diary_symptom_reports_grade_check;
ALTER TABLE public.alerts                DROP CONSTRAINT alerts_grade_check;
ALTER TABLE public.alert_rules           DROP CONSTRAINT alert_rules_min_grade_check;


-- ============================================================
-- 2. A conversao x2
-- ============================================================

ALTER TABLE public.diary_symptom_reports DISABLE TRIGGER trg_enforce_parent_draft;
ALTER TABLE public.alerts                DISABLE TRIGGER trg_enforce_alert_transition;

-- WHERE true: a intencao e a tabela inteira (CLAUDE.md, safeupdate).
UPDATE public.diary_symptom_reports SET grade     = grade * 2     WHERE true;
UPDATE public.alerts                SET grade     = grade * 2     WHERE true;
UPDATE public.alert_rules           SET min_grade = min_grade * 2 WHERE true;

ALTER TABLE public.diary_symptom_reports ENABLE TRIGGER trg_enforce_parent_draft;
ALTER TABLE public.alerts                ENABLE TRIGGER trg_enforce_alert_transition;


-- ============================================================
-- 3. Os limites novos entram
-- ============================================================

ALTER TABLE public.diary_symptom_reports
  ADD CONSTRAINT ck_diary_symptom_reports_grade CHECK (grade BETWEEN 0 AND 10) NOT VALID;
ALTER TABLE public.alerts
  ADD CONSTRAINT ck_alerts_grade CHECK (grade BETWEEN 0 AND 10) NOT VALID;
-- BETWEEN 1 e nao 0: grau 0 e "marquei o sintoma e ele nao me incomodou".
-- Uma regra com minimo 0 dispararia alerta em todo registro do diario.
ALTER TABLE public.alert_rules
  ADD CONSTRAINT ck_alert_rules_min_grade CHECK (min_grade BETWEEN 1 AND 10) NOT VALID;

COMMENT ON TABLE public.diary_symptom_reports IS
  'Um sintoma marcado com sua graduacao 0-10. A visibilidade DERIVA do registro pai — ver as politicas abaixo.';
COMMENT ON COLUMN public.diary_symptom_reports.grade IS
  'Escala de intensidade 0..10 (0..5 ate 23/10/2026; o que existia foi convertido x2, ADR-007 §8). O corte que torna o grau critico e configuravel pelo administrador e NAO mora aqui (ADR-007 §1).';
COMMENT ON COLUMN public.alert_rules.min_grade IS
  'Grau minimo que dispara o alerta, 1..10. As regras anteriores a 23/10/2026 foram convertidas x2 junto com os graus (ADR-007 §8): o limiar convertido e o de antes, e reve-lo e decisao do administrador.';


-- ============================================================
-- Verificacao — o efeito, nao o comando
-- ============================================================

DO $$
BEGIN
  -- As travas voltaram. Uma trava esquecida desligada e o defeito mais caro
  -- desta migration: registro salvo passaria a aceitar UPDATE em silencio.
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
     WHERE t.tgrelid IN ('public.diary_symptom_reports'::regclass, 'public.alerts'::regclass)
       AND t.tgname IN ('trg_enforce_parent_draft', 'trg_enforce_alert_transition')
       AND t.tgenabled <> 'O'
  ) OR (
    SELECT count(*) FROM pg_catalog.pg_trigger t
     WHERE t.tgname IN ('trg_enforce_parent_draft', 'trg_enforce_alert_transition')
       AND t.tgrelid IN ('public.diary_symptom_reports'::regclass, 'public.alerts'::regclass)
  ) <> 2 THEN
    RAISE EXCEPTION 'trava de imutabilidade do diario ou do alerta nao esta ligada';
  END IF;

  -- A copia continua igual a origem.
  IF EXISTS (
    SELECT 1 FROM public.alerts a
      JOIN public.diary_symptom_reports r ON r.id = a.symptom_report_id
     WHERE a.grade <> r.grade
  ) THEN
    RAISE EXCEPTION 'alerts.grade divergiu de diary_symptom_reports.grade na conversao';
  END IF;

  -- Todo alerta continua explicavel pela regra que o disparou.
  IF EXISTS (
    SELECT 1 FROM public.alerts a
      JOIN public.alert_rules ar ON ar.id = a.alert_rule_id
     WHERE a.grade < ar.min_grade
  ) THEN
    RAISE EXCEPTION 'alerta abaixo do minimo da regra que o disparou, depois da conversao';
  END IF;

  -- Nesta transacao, todo grau e todo minimo vieram da escala velha: sao pares.
  IF EXISTS (SELECT 1 FROM public.diary_symptom_reports WHERE grade % 2 <> 0)
  OR EXISTS (SELECT 1 FROM public.alerts                WHERE grade % 2 <> 0)
  OR EXISTS (SELECT 1 FROM public.alert_rules           WHERE min_grade % 2 <> 0) THEN
    RAISE EXCEPTION 'grau impar logo apos a conversao: algum valor nao foi multiplicado';
  END IF;
END;
$$;
