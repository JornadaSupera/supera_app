-- O tempo ate a primeira resposta da equipe ganha o recorte por ASSUNTO.
-- Plano das pendencias do painel de 30/09/2026, Fase I, item I.2 (painel #11).
-- Design e racional: supera-docs/ADRs/ADR-021 — Funções de resumo do painel.md (emenda de 30/09/2026)
--
-- DEPENDE DA E.1 (fix_conversation_specialty_lookup). Antes dela, quem tinha
-- trocado de area assumia na area ANTIGA, e o recorte por especialidade deste
-- resumo herdava o vies. A partir da E.1 a conversa fica na area vigente de
-- quem a assume, e o recorte por especialidade e por assunto falam do mesmo
-- chat. Vem depois da H porque o roteamento por assunto (H.1) e o que da
-- sentido a pergunta "quanto demora cada assunto".
--
-- DUAS MUDANCAS NA ASSINATURA, AS DUAS NO FIM E COM DEFAULT:
--   p_subject_id        filtra um assunto (como p_specialty_id filtra uma area);
--   p_group_by_subject  quebra cada balde por assunto.
-- E DUAS COLUNAS NO FIM DO RETORNO: subject_id e subject_label.
--
-- POR QUE UM PARAMETRO PARA AGRUPAR, E NAO AGRUPAR SEMPRE: mediana e p90 NAO
-- SE SOMAM. Se o resumo passasse a devolver sempre balde x area x assunto, a
-- tela que hoje mostra "mediana da Enfermagem em setembro" nao conseguiria mais
-- recompor o numero a partir das linhas por assunto — teria de chamar de novo
-- com o filtro, ou inventar uma media de medianas, que nao e mediana de nada.
-- Com o padrao `false`, a chamada antiga devolve exatamente as mesmas linhas de
-- antes, com as duas colunas novas nulas. Com filtro de assunto, as colunas vem
-- preenchidas (todas as linhas sao daquele assunto).
--
-- O ROTULO DO ASSUNTO pede a terceira politica de catalogo para o leitor
-- auditado. `conversation_subjects` recebeu GRANT SELECT para clinical_reader
-- junto do resto do agregado, e ficou com politicas so `TO authenticated` —
-- zero linhas para o papel, o mesmo GRANT inerte que fix_reader_catalog_policies
-- corrigiu para sintomas e especialidades. Assunto e vocabulario sem paciente,
-- e o assunto aposentado continua tendo rotulo no historico: USING (true).
--
-- O FUSO PASSA A SER O DA CLINICA. A versao de 11/09 fixava
-- 'America/Sao_Paulo' no corpo; as funcoes de 25/09 em diante leem
-- clinic_settings.time_zone, que e o mesmo valor hoje. Como a funcao e
-- reescrita, ela entra na regra das demais (com a guarda de fuso ilegivel).
--
-- O RESTO NAO MUDA: a janela continua sobre a ABERTURA da conversa, a primeira
-- resposta continua sendo a primeira mensagem `professional` (sistema nao conta,
-- e a mensagem de transicao do encaminhamento e `system`), e o sigilo continua
-- sendo a RLS dentro da funcao.


-- ============================================================
-- 1. O catalogo de assuntos chega ao leitor auditado
-- ============================================================

CREATE POLICY conversation_subjects_select_reader ON public.conversation_subjects
  FOR SELECT TO clinical_reader
  USING ( true );

-- O GRANT ja existe desde create_conversations; repeti-lo e inofensivo e deixa
-- esta migration de pe sozinha se alguem algum dia o revogar.
GRANT SELECT ON public.conversation_subjects TO clinical_reader;


-- ============================================================
-- 2. A funcao — DROP + CREATE de dentro do papel dono
-- ============================================================
--
-- DROP e nao CREATE OR REPLACE: o retorno ganha duas colunas e a assinatura,
-- dois parametros, e o Postgres recusa trocar o retorno de funcao existente.
-- Os parametros novos vem no fim e com default: a chamada antiga, por nome ou
-- por posicao, continua valendo.

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

DROP FUNCTION public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid);

CREATE FUNCTION public.summarize_chat_response_times(
  p_from             timestamptz,
  p_to               timestamptz,
  p_granularity      text    DEFAULT 'month',
  p_specialty_id     uuid    DEFAULT NULL,
  p_subject_id       uuid    DEFAULT NULL,
  p_group_by_subject boolean DEFAULT false
)
RETURNS TABLE (
  bucket_start                   date,
  specialty_id                   uuid,
  specialty_label                text,
  conversation_count             bigint,
  answered_count                 bigint,
  unanswered_count               bigint,
  first_response_avg_seconds     bigint,
  first_response_median_seconds  bigint,
  first_response_p90_seconds     bigint,
  subject_id                     uuid,
  subject_label                  text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row     record;
  v_events  bigint := 0;
  v_tz      text;
  v_por_assunto boolean := COALESCE(p_group_by_subject, false) OR p_subject_id IS NOT NULL;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'p_granularity aceita day, week ou month'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT cs.time_zone INTO v_tz FROM public.clinic_settings cs WHERE cs.id = 1;
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'fuso da clinica ilegivel dentro do resumo do chat';
  END IF;

  FOR v_row IN
    WITH base AS (
      SELECT (pg_catalog.date_trunc(p_granularity, c.created_at AT TIME ZONE v_tz))::date AS bucket,
             c.created_at          AS opened_at,
             c.origin_specialty_id AS spec_id,
             -- Nulo quando nao se agrupa por assunto: o GROUP BY abaixo junta
             -- todos os assuntos num balde so, exatamente como antes.
             CASE WHEN v_por_assunto THEN c.subject_id END AS subj_id,
             -- A primeira resposta da EQUIPE: so `professional`. Mensagem de
             -- sistema (aviso fora do horario, transicao do encaminhamento)
             -- nao e atendimento.
             ( SELECT pg_catalog.min(m.created_at)
                 FROM public.messages m
                WHERE m.conversation_id = c.id
                  AND m.author_kind = 'professional' ) AS first_reply_at
        FROM public.conversations c
       WHERE c.created_at >= p_from
         AND c.created_at <  p_to
         AND (p_specialty_id IS NULL OR c.origin_specialty_id = p_specialty_id)
         AND (p_subject_id   IS NULL OR c.subject_id          = p_subject_id)
    )
    SELECT b.bucket                           AS bucket,
           b.spec_id                          AS spec_id,
           s.label                            AS spec_label,
           b.subj_id                          AS subj_id,
           cs.label                           AS subj_label,
           count(*)                           AS n_conversations,
           count(b.first_reply_at)            AS n_answered,
           count(*) - count(b.first_reply_at) AS n_unanswered,
           pg_catalog.avg(
             extract(epoch FROM (b.first_reply_at - b.opened_at))
           )                                  AS avg_seconds,
           pg_catalog.percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM (b.first_reply_at - b.opened_at))
           )                                  AS median_seconds,
           pg_catalog.percentile_cont(0.9) WITHIN GROUP (
             ORDER BY extract(epoch FROM (b.first_reply_at - b.opened_at))
           )                                  AS p90_seconds
      FROM base b
      LEFT JOIN public.specialties s ON s.id = b.spec_id
      -- LEFT: assunto aposentado continua com rotulo (a politica nova e
      -- USING true), e com o agrupamento desligado subj_id e nulo.
      LEFT JOIN public.conversation_subjects cs ON cs.id = b.subj_id
     GROUP BY b.bucket, b.spec_id, s.label, b.subj_id, cs.label
     ORDER BY b.bucket, s.label NULLS LAST, cs.label NULLS LAST
  LOOP
    v_events                      := v_events + v_row.n_conversations;
    bucket_start                  := v_row.bucket;
    specialty_id                  := v_row.spec_id;
    specialty_label               := v_row.spec_label;
    conversation_count            := v_row.n_conversations;
    answered_count                := v_row.n_answered;
    unanswered_count              := v_row.n_unanswered;
    first_response_avg_seconds    := pg_catalog.round(v_row.avg_seconds)::bigint;
    first_response_median_seconds := pg_catalog.round(v_row.median_seconds)::bigint;
    first_response_p90_seconds    := pg_catalog.round(v_row.p90_seconds)::bigint;
    subject_id                    := v_row.subj_id;
    subject_label                 := v_row.subj_label;
    RETURN NEXT;
  END LOOP;

  PERFORM private.log_clinical_read('conversations', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid, uuid, boolean) IS
  'Tempo ate a primeira resposta da equipe, por periodo (fuso da clinica) e especialidade; desde 30/09/2026 tambem por assunto (p_subject_id filtra, p_group_by_subject quebra o balde). Sem os dois, as linhas sao as de antes, com subject_id/subject_label nulos. So devolve numeros. NAO cobre "engajamento no app" (#44).';

-- Objeto de clinical_reader: quem revoga e concede e ele (armadilha nº 4).
REVOKE EXECUTE ON FUNCTION public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid, uuid, boolean) TO authenticated, service_role;

RESET ROLE;
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 3. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_fn       text := 'public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid, uuid, boolean)';
  v_dono     text;
  v_assuntos integer;
BEGIN
  IF pg_catalog.to_regprocedure('public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'a assinatura antiga do resumo do chat continua existindo ao lado da nova';
  END IF;

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

  -- O efeito da politica, medido no papel: sem ela, todo subject_label viria
  -- nulo e o resto da funcao continuaria "funcionando".
  SET LOCAL ROLE clinical_reader;
  SELECT count(*) INTO v_assuntos FROM public.conversation_subjects;
  RESET ROLE;
  SET LOCAL ROLE postgres;
  IF v_assuntos = 0 THEN
    RAISE EXCEPTION 'clinical_reader continua cego a conversation_subjects: o rotulo do assunto viria nulo';
  END IF;
END;
$$;
