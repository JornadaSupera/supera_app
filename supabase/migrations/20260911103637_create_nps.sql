-- Agregado Conteudo e engajamento — FATIA 2b: o NPS.
-- Design e racional: supera-docs/Modelo de Dados/Conteudo e engajamento.md
-- Decisoes sob teste:  ADR-010 §6 (a forma), #32 (quem le), #41 (os gatilhos)
--
-- A #32 travava esta fatia desde 28/08/2026, e a pergunta que ela fazia —
-- "a resposta e anonima ou atribuivel?" — nunca foi a pergunta certa: a
-- resposta E ATRIBUIVEL POR CONSTRUCAO, porque "resposta unica por marco"
-- exige (paciente, marco). O que se decidia de fato era QUEM LE.
--
-- Decidido em 31/08/2026, na direcao restritiva, pela mesma assimetria de custo
-- que decidiu o chat: o comentario so a ADMINISTRACAO le, e A VIEW COMPARATIVA
-- POR ESPECIALIDADE NAO NASCE. Com ela fora, o problema do N pequeno SOME DO
-- ESQUEMA — nao existe tela em que tres respondentes re-identifiquem alguem.
-- Abrir depois e politica aditiva; ter aberto antes ja teria re-identificado.
--
-- O QUE NAO NASCE, e a ausencia esta sob assercao:
--   * a view comparativa por especialidade, e com ela a pergunta do N minimo,
--     que passa a ser da VIEW e se decide quando alguem pedir o comparativo,
--     com dado real para calibrar;
--   * politica nenhuma para o PROFISSIONAL. O indicador "satisfacao dos
--     pacientes" da Carteira do profissional dependia do comparativo;
--   * funcao read_* nenhuma: a ADR-008 §"o que nao paga pedagio" nomeia o NPS
--     entre as isencoes, junto de agenda, orientacoes e perfil;
--   * tipo de notificacao de NPS. Os quatro filtros da tela de notificacoes
--     ('agenda','chat','content','alert') sao nominais nas fontes, e nenhuma
--     fonte pede push de pesquisa de satisfacao. Inventar o quinto filtro seria
--     decidir uma tela do app por conveniencia de modelagem.


-- ============================================================
-- 1. Os marcos — eixo SEPARADO da fase clinica
-- ============================================================
--
-- A #1 fechou em 31/08/2026: "sao coisas separadas". A fase classifica o
-- paciente (Tratamento ativo / Seguimento); o marco do NPS e MOMENTO DE
-- DISPARO, e os dois nunca se encontram numa coluna so.
--
-- E exatamente o desfecho para o qual treatment_phases.axis foi comprado, em
-- 28/08/2026, como mitigacao barata da #1 (ADR-006 §3). Um discriminador custou
-- uma coluna; descobrir depois que eram dois eixos custaria tabela nova mais
-- migration de dados. Aqui ele se paga: os marcos entram como linhas.

INSERT INTO public.treatment_phases (axis, code, label, sort_order) VALUES
  ('nps', 'primeiro_acesso',   'Primeiro acesso ao app',  1),
  ('nps', 'metade_tratamento', 'Metade do tratamento',    2),
  ('nps', 'ultimo_ciclo',      'Após o último ciclo',     3)
ON CONFLICT (axis, code) DO NOTHING;

-- Alvo da FK COMPOSTA da secao 2. Indice unico e nao ADD CONSTRAINT UNIQUE:
-- o segundo pede ACCESS EXCLUSIVE sobre tabela ja existente (Squawk), e uma
-- FK pode referenciar colunas cobertas por indice unico.
CREATE UNIQUE INDEX uq_treatment_phases_id_axis
  ON public.treatment_phases (id, axis);


-- ============================================================
-- 2. nps_surveys — a pesquisa disparada
-- ============================================================
--
-- Tabela separada da resposta porque a pesquisa pode ser disparada e NUNCA
-- respondida. Numa tabela so, com score nullable, "nao respondeu" e
-- "respondeu" ficariam indistinguiveis de linha ausente — e o indicador de
-- adesao ao NPS mediria a coisa errada.

CREATE TABLE public.nps_surveys (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  milestone_id uuid NOT NULL,
  -- COLUNA REDUNDANTE COM PROPOSITO, como notification_preferences.is_silenceable
  -- (ADR-015 §1): e o segundo termo da FK composta. O CHECK a prende em 'nps' e
  -- a FK entao so aceita treatment_phases cujo eixo seja o do NPS. Marco
  -- clinico NAO TEM LINHA POSSIVEL aqui — para os quatro perfis E para
  -- service_role, que ignora RLS mas nao ignora chave estrangeira.
  milestone_axis text NOT NULL DEFAULT 'nps',
  triggered_at timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_nps_surveys_axis CHECK (milestone_axis = 'nps'),
  CONSTRAINT fk_nps_surveys_milestone
    FOREIGN KEY (milestone_id, milestone_axis)
    REFERENCES public.treatment_phases (id, axis) ON DELETE RESTRICT,
  -- "Resposta unica por marco": a idempotencia do disparo automatico e uma
  -- CHAVE, nao um IF na rotina agendada. Irma do UNIQUE (symptom_report_id) do
  -- alerta e do uq_notifications_dedup.
  CONSTRAINT uq_nps_surveys_patient_milestone UNIQUE (patient_id, milestone_id)
);

COMMENT ON TABLE public.nps_surveys IS
  'Pesquisa de satisfacao disparada em marco do tratamento. Separada da resposta porque pode nunca ser respondida. O marco e eixo proprio de treatment_phases (#1), preso por FK composta.';
COMMENT ON COLUMN public.nps_surveys.milestone_axis IS
  'Nao e configuracao: e o segundo termo da FK composta. CHECK + FK(id, axis) tornam impossivel disparar NPS por fase CLINICA.';

CREATE INDEX idx_nps_surveys_patient   ON public.nps_surveys (patient_id, triggered_at DESC);
CREATE INDEX idx_nps_surveys_milestone ON public.nps_surveys (milestone_id);


-- ============================================================
-- 3. nps_responses — a nota e o comentario
-- ============================================================

CREATE TABLE public.nps_responses (
  id        uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- UNIQUE: resposta unica por pesquisa, e a pesquisa ja e unica por
  -- (paciente, marco). Duas chaves em serie, nenhuma checagem em aplicacao.
  survey_id uuid NOT NULL UNIQUE REFERENCES public.nps_surveys (id) ON DELETE RESTRICT,
  -- NPS e 0 a 10, literal na fonte. CHECK e nao enum: dominio numerico local e
  -- fechado (ADR-002), como a escala 0..5 do diario.
  score     smallint NOT NULL CHECK (score BETWEEN 0 AND 10),
  -- Opcional, literal na fonte. E o texto que so a administracao le (#32).
  comment   text CHECK (comment IS NULL OR length(btrim(comment)) > 0),
  answered_at timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nps_responses IS
  'Nota 0-10 com comentario opcional. Atribuivel por construcao — "resposta unica por marco" exige o paciente. O que se decidiu na #32 foi QUEM LE: administracao e o proprio titular, e mais ninguem.';
COMMENT ON COLUMN public.nps_responses.comment IS
  'Comentario livre. NENHUMA politica de profissional o alcanca, e a view comparativa por especialidade nao existe — era ali que o N pequeno re-identificaria (#32).';

CREATE INDEX idx_nps_responses_score ON public.nps_responses (score, answered_at DESC);


-- ============================================================
-- 4. A resposta e final
-- ============================================================
--
-- "Resposta unica" nao e so uma linha por marco: e uma linha que nao se
-- reescreve. Sem isto, o titular poderia trocar a nota depois de ela ja ter
-- entrado no dashboard executivo, e o indicador mudaria retroativamente.
-- Em trigger e nao so por REVOKE, porque service_role ignora privilegio de
-- tabela tanto quanto ignora RLS.

CREATE FUNCTION private.reject_nps_response_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'resposta de NPS e unica e final: % nao e permitido', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER trg_nps_responses_final
BEFORE UPDATE OR DELETE ON public.nps_responses
FOR EACH ROW EXECUTE FUNCTION private.reject_nps_response_mutation();


-- ============================================================
-- 5. O disparo — RPC de rotina, nao politica
-- ============================================================
--
-- Os tres gatilhos que a clinica propos (#41): PRIMEIRO ACESSO AO APP, que e
-- evento nosso e nasce pronto; METADE DO TRATAMENTO
-- (current_cycle_number >= ceil(cycles_planned / 2.0)); e APOS O ULTIMO CICLO
-- (current_cycle_number = cycles_planned).
--
-- A FORMULA E NOSSA E DECLARADA, nao da clinica — e por isso ela mora na
-- ROTINA AGENDADA, nao no esquema: trocar de ideia e trocar uma query, nao uma
-- constraint. Enquanto o Gemed estiver desligado as duas colunas do plano sao
-- nulas e dois dos tres gatilhos ficam INERTES, como alert_rules. E o
-- comportamento correto, nao defeito.

CREATE FUNCTION public.open_nps_survey(
  p_patient_id     uuid,
  p_milestone_code text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_milestone_id uuid;
  v_id           uuid;
BEGIN
  SELECT tp.id INTO v_milestone_id
    FROM public.treatment_phases tp
   WHERE tp.axis = 'nps' AND tp.code = p_milestone_code AND tp.is_active;

  IF v_milestone_id IS NULL THEN
    RAISE EXCEPTION 'marco de NPS inexistente: %', p_milestone_code
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.nps_surveys (patient_id, milestone_id)
  VALUES (p_patient_id, v_milestone_id)
  ON CONFLICT ON CONSTRAINT uq_nps_surveys_patient_milestone DO NOTHING
  RETURNING id INTO v_id;

  -- Ja existia: a rotina agendada reprocessou a mesma janela. Devolve a linha
  -- e sai — a idempotencia e da chave, nao do chamador.
  IF v_id IS NULL THEN
    SELECT s.id INTO v_id
      FROM public.nps_surveys s
     WHERE s.patient_id = p_patient_id AND s.milestone_id = v_milestone_id;
  END IF;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.open_nps_survey(uuid, text) IS
  'Abre a pesquisa de um marco, idempotente pela chave (paciente, marco). Chamada pela rotina agendada com service_role — nunca pelo cliente.';


-- ============================================================
-- 6. RLS
-- ============================================================
--
-- O NPS NAO PAGA O PEDAGIO da ADR-008: ele a nomeia entre as isencoes, junto
-- de agenda, orientacoes, perfil e catalogos. Logo politicas TO authenticated e
-- nenhuma funcao read_*.

ALTER TABLE public.nps_surveys   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

-- O titular ve as proprias pesquisas — e o que faz a tela saber que ha uma
-- pendente. O CUIDADOR nao: satisfacao com o atendimento e juizo do titular
-- sobre o proprio cuidado, e a unica escrita clinica delegada ao acompanhante
-- em todo o modelo e o diario (ADR-007 §2). Decisao declarada, sob assercao.
CREATE POLICY nps_surveys_select_own ON public.nps_surveys
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

CREATE POLICY nps_surveys_select_admin ON public.nps_surveys
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- Sem politica de escrita: a pesquisa nasce so por open_nps_survey.

CREATE POLICY nps_responses_select_own ON public.nps_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.nps_surveys s
       WHERE s.id = survey_id
         AND s.patient_id = (SELECT private.my_own_patient_id())
    )
  );

CREATE POLICY nps_responses_select_admin ON public.nps_responses
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- A unica escrita direta: o titular responde a propria pesquisa. Nao ha regra
-- de negocio a esconder atras de DEFINER — a checagem cabe inteira no
-- WITH CHECK, como no diario.
CREATE POLICY nps_responses_insert_own ON public.nps_responses
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.nps_surveys s
       WHERE s.id = survey_id
         AND s.patient_id = (SELECT private.my_own_patient_id())
    )
  );

-- NENHUMA POLITICA PARA O PROFISSIONAL, nas duas tabelas. E a decisao da #32,
-- nao esquecimento: o indicador da Carteira do profissional dependia do
-- comparativo por especialidade, que nao nasce. A ausencia esta medida para os
-- quatro perfis, e abrir depois e politica aditiva.


-- ============================================================
-- 7. updated_at
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.nps_surveys
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
-- nps_responses nao recebe o trigger: a linha nao se atualiza (secao 4).


-- ============================================================
-- 8. Privilegios — SEMPRE no fim
-- ============================================================

-- Defesa em duas camadas, como audit_log: o trigger vale para service_role, o
-- REVOKE vale para quem nao chega la.
REVOKE UPDATE, DELETE ON public.nps_responses FROM authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.nps_surveys FROM authenticated, service_role;

REVOKE EXECUTE ON FUNCTION private.reject_nps_response_mutation() FROM PUBLIC, anon;

-- FROM PUBLIC, anon **E** authenticated. O `REVOKE ... FROM PUBLIC` NAO alcanca
-- role nomeado, e o default privilege do Supabase concede EXECUTE de toda funcao
-- nova de `public` a anon, authenticated e service_role. A migration
-- revoke_anon_access desarmou o default so para `anon` — `authenticated`
-- continua nascendo com EXECUTE, e ha uma segunda entrada de default concedida
-- por supabase_admin que NENHUMA migration alcanca (ADR-016, armadilhas 2 e 5).
--
-- Medido: sem esta linha, o proprio titular chamava open_nps_survey e abria a
-- pesquisa dele quando quisesse. Nao ha IF no corpo que o barre — aqui o portao
-- E o privilegio, de proposito.
REVOKE EXECUTE ON FUNCTION public.open_nps_survey(uuid, text) FROM PUBLIC, anon, authenticated;

-- O disparo e da rotina agendada. O cliente nao abre a propria pesquisa — se
-- abrisse, escolheria quando ser perguntado.
GRANT EXECUTE ON FUNCTION public.open_nps_survey(uuid, text) TO service_role;

REVOKE ALL ON public.nps_surveys   FROM anon;
REVOKE ALL ON public.nps_responses FROM anon;
