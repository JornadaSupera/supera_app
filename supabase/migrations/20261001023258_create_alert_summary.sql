-- O resumo da fila de alertas: quantos nasceram, quantos foram assumidos e
-- resolvidos, quanto tempo levou ate assumir e ate a conduta, e qual conduta.
-- Plano das pendencias do painel de 30/09/2026, Fase I, item I.1 (painel #10).
-- Design e racional: supera-docs/ADRs/ADR-021 — Funções de resumo do painel.md (emenda de 30/09/2026)
--                    supera-docs/ADRs/ADR-019 — Assunção, designação e desfecho do alerta.md
--
-- O QUE FALTAVA ERA A FUNCAO, NAO O DADO. `alerts` ja guarda tudo o que o
-- resumo precisa na propria linha: `created_at` (nasceu), `triaged_at` (alguem
-- assumiu), `conduct_at` + `conduct_kind` (a conduta) e `resolved_at`. Nao ha
-- coluna nova nem tabela de eventos: o que a fila precisa contar ja e estado.
--
-- MESMO MOLDE DE summarize_chat_response_times (ADR-021):
--   * dono `clinical_reader`, SECURITY DEFINER: a RLS de `alerts` vale dentro
--     dela com o auth.uid() de quem chamou. Profissional ativo e administrador
--     contam a fila inteira (as duas politicas de leitura sao da equipe toda,
--     o alerta nao tem especialidade — ADR-007 §4); paciente, acompanhante e
--     conta sem perfil recebem VAZIO, sem IF no corpo;
--   * janela obrigatoria e lista branca de granularidade (day, week, month).
--     SEM recorte por hora: o pedido do painel falava em "pico por horario", e
--     o painel fica com a contagem diaria. Hora do dia em alerta de sintoma e
--     o comeco de um mapa de rotina de paciente, e nao e indicador de fila;
--   * pedagio com log_clinical_read(..., NULL, n), contando os ALERTAS
--     agregados, nao os baldes devolvidos;
--   * nenhum identificador: nem paciente, nem profissional, nem alerta.
--
-- COORTE PELO NASCIMENTO. O balde e o dia/semana/mes em que o alerta NASCEU,
-- no fuso da clinica, e as contagens de assumidos e resolvidos dizem quantos
-- DAQUELA COORTE ja tinham sido assumidos ou resolvidos no instante da
-- chamada. A pergunta "quantos assumimos em setembro, de qualquer idade" e
-- outra, e nao foi pedida. Consequencia que a tela precisa saber ler: a coorte
-- mais recente sempre parece pior, porque ainda esta em andamento — por isso
-- `open_count` sai separado, e os tempos se calculam SO sobre quem ja passou
-- pela etapa (o alerta aberto nao entra como zero nem como infinito).
--
-- OS DOIS TEMPOS, medidos do NASCIMENTO do alerta:
--   * ate assumir  (triaged_at - created_at): quanto a fila demorou a pegar;
--   * ate a conduta (conduct_at - created_at): quanto o paciente esperou por
--     uma resposta clinica. Hoje conduta e resolucao andam juntas
--     (resolve_alert grava as duas), mas a coluna e a da conduta, porque e a
--     que o requisito nomeia.
-- Media, mediana e p90, como no chat: numa fila, a media e a estatistica mais
-- facil de enganar, e o p90 responde "quao ruim fica quando fica ruim".
--
-- O QUE ESTE RESUMO NAO TEM, DE PROPOSITO: taxa de falso positivo. Nao existe
-- desfecho "descartado" nem "falso positivo" — o alerta tem tres estados e a
-- conduta e uma de tres (orientacao, agendamento, encaminhamento), por decisao
-- (ADR-019 §1). "Resolvido com orientacao" NAO e falso positivo, e a tela nao
-- deve rotula-lo assim.


-- ============================================================
-- 1. Indice da varredura nova
-- ============================================================
--
-- idx_alerts_queue comeca por status, e idx_alerts_patient por paciente:
-- nenhum serve "todos os alertas nascidos entre p_from e p_to". Mesmo motivo
-- de idx_appointments_period e idx_conversations_opened (create_clinical_summaries).
CREATE INDEX idx_alerts_period ON public.alerts (created_at);


-- ============================================================
-- 2. A funcao — criada de dentro do papel dono
-- ============================================================
--
-- Emprestimo de CREATE, SET LOCAL ROLE, devolucao (create_panel_summaries).
-- A funcao nasce de clinical_reader, e o dono e o que sustenta a RLS dentro
-- dela: com dono `postgres`, o resumo somaria a base inteira para qualquer
-- chamador, inclusive o paciente.

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

CREATE FUNCTION public.summarize_alerts(
  p_from        timestamptz,
  p_to          timestamptz,
  p_granularity text DEFAULT 'month'
)
RETURNS TABLE (
  bucket_start            date,
  alert_count             bigint,
  triaged_count           bigint,
  resolved_count          bigint,
  open_count              bigint,
  triage_avg_seconds      bigint,
  triage_median_seconds   bigint,
  triage_p90_seconds      bigint,
  conduct_avg_seconds     bigint,
  conduct_median_seconds  bigint,
  conduct_p90_seconds     bigint,
  conduct_guidance_count  bigint,
  conduct_scheduling_count bigint,
  conduct_referral_count  bigint
)
LANGUAGE plpgsql
VOLATILE                        -- escreve na trilha
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    record;
  v_events bigint := 0;
  v_tz     text;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'p_granularity aceita day, week ou month'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- O balde e o dia de Chapeco, nao o de UTC: o alerta das 22h do dia 30 e do
  -- dia 30. Sem fuso, `AT TIME ZONE NULL` daria balde NULO para todo alerta —
  -- melhor falhar alto (mesma guarda de summarize_content_reads).
  SELECT cs.time_zone INTO v_tz FROM public.clinic_settings cs WHERE cs.id = 1;
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'fuso da clinica ilegivel dentro do resumo de alertas';
  END IF;

  FOR v_row IN
    WITH base AS (
      SELECT (pg_catalog.date_trunc(p_granularity, a.created_at AT TIME ZONE v_tz))::date AS bucket,
             a.status,
             a.conduct_kind,
             -- `extract` sem qualificacao: e gramatica SQL, nao funcao
             -- (anotado em create_clinical_summaries).
             extract(epoch FROM (a.triaged_at - a.created_at)) AS triage_s,
             extract(epoch FROM (a.conduct_at - a.created_at)) AS conduct_s
        FROM public.alerts a
       WHERE a.created_at >= p_from
         AND a.created_at <  p_to
    )
    SELECT b.bucket,
           count(*)                                            AS n_alerts,
           count(b.triage_s)                                   AS n_triaged,
           count(*) FILTER (WHERE b.status = 'resolved')       AS n_resolved,
           count(*) FILTER (WHERE b.status = 'open')           AS n_open,
           pg_catalog.avg(b.triage_s)                          AS triage_avg,
           pg_catalog.percentile_cont(0.5) WITHIN GROUP (ORDER BY b.triage_s)  AS triage_med,
           pg_catalog.percentile_cont(0.9) WITHIN GROUP (ORDER BY b.triage_s)  AS triage_p90,
           pg_catalog.avg(b.conduct_s)                         AS conduct_avg,
           pg_catalog.percentile_cont(0.5) WITHIN GROUP (ORDER BY b.conduct_s) AS conduct_med,
           pg_catalog.percentile_cont(0.9) WITHIN GROUP (ORDER BY b.conduct_s) AS conduct_p90,
           count(*) FILTER (WHERE b.conduct_kind = 'guidance')   AS n_guidance,
           count(*) FILTER (WHERE b.conduct_kind = 'scheduling') AS n_scheduling,
           count(*) FILTER (WHERE b.conduct_kind = 'referral')   AS n_referral
      FROM base b
     GROUP BY b.bucket
     ORDER BY b.bucket
  LOOP
    v_events                 := v_events + v_row.n_alerts;
    bucket_start             := v_row.bucket;
    alert_count              := v_row.n_alerts;
    triaged_count            := v_row.n_triaged;
    resolved_count           := v_row.n_resolved;
    open_count               := v_row.n_open;
    triage_avg_seconds       := pg_catalog.round(v_row.triage_avg)::bigint;
    triage_median_seconds    := pg_catalog.round(v_row.triage_med)::bigint;
    triage_p90_seconds       := pg_catalog.round(v_row.triage_p90)::bigint;
    conduct_avg_seconds      := pg_catalog.round(v_row.conduct_avg)::bigint;
    conduct_median_seconds   := pg_catalog.round(v_row.conduct_med)::bigint;
    conduct_p90_seconds      := pg_catalog.round(v_row.conduct_p90)::bigint;
    conduct_guidance_count   := v_row.n_guidance;
    conduct_scheduling_count := v_row.n_scheduling;
    conduct_referral_count   := v_row.n_referral;
    RETURN NEXT;
  END LOOP;

  -- row_count conta os ALERTAS agregados, nao os baldes (ADR-021).
  PERFORM private.log_clinical_read('alerts', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_alerts(timestamptz, timestamptz, text) IS
  'Fila de alertas por coorte de nascimento (dia, semana ou mes, no fuso da clinica): nascidos, ja assumidos, ja resolvidos, ainda abertos, tempo ate assumir e ate a conduta (media, mediana, p90, so sobre quem passou pela etapa) e contagem por conduta. Nenhum identificador. Nao existe falso positivo (ADR-019 §1). Desde 30/09/2026.';

-- Objeto de clinical_reader: quem revoga e concede e ele (armadilha nº 4). A
-- funcao nova nasce com EXECUTE para PUBLIC, e anon herdaria.
REVOKE EXECUTE ON FUNCTION public.summarize_alerts(timestamptz, timestamptz, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.summarize_alerts(timestamptz, timestamptz, text) TO authenticated, service_role;

RESET ROLE;
-- Explicito: no `db push` o RESET pode voltar ao papel de login da CLI, e nao
-- a postgres (ver mask_patient_identifiers §5).
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 3. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_fn   text := 'public.summarize_alerts(timestamptz, timestamptz, text)';
  v_dono text;
BEGIN
  SELECT r.rolname INTO v_dono
    FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
   WHERE p.oid = v_fn::regprocedure;
  IF v_dono <> 'clinical_reader' THEN
    RAISE EXCEPTION '% saiu da migration com dono %: a RLS nao valeria dentro dela', v_fn, v_dono;
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em %', v_fn;
  END IF;
  IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca %', v_fn;
  END IF;

  IF pg_catalog.has_schema_privilege('clinical_reader', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'clinical_reader ficou com CREATE em public depois do emprestimo.';
  END IF;
END;
$$;
