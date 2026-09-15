-- As funcoes de RESUMO — a origem que Relatorios e Estatisticas nunca tiveram.
-- Design e racional: supera-docs/ADRs/ADR-021 — Funcoes de resumo do painel.md
-- Requisito: supera-docs/Requisitos/Painel Administrativo/Relatorios e estatisticas.md
--
-- POR QUE ELAS EXISTEM. O painel administrativo tem tres telas inertes
-- (Relatorios, Estatisticas Clinicas, Estatisticas Operacionais) e a causa foi
-- MEDIDA pelo dev do painel contra o banco em 10/09/2026, tabela por tabela:
-- NENHUMA funcao read_* agrega. Todas devolvem linhas, nunca contagem, e quase
-- todas exigem um paciente por vez. Cruzamento (protocolo x sintoma x grau,
-- volume por especialidade, tempo de resposta) nao tinha origem nenhuma.
--
-- O ARGUMENTO QUE DECIDE NAO E DESEMPENHO, E PRIVACIDADE — e ele e o oposto do
-- intuitivo. A saida "obvia" seria liberar leitura direta das tabelas para o
-- administrador; ela desmontaria a trilha de auditoria, que e item de aceite
-- contratual literal (Anexo II: "perfis de acesso, RLS, logs"). A saida certa e
-- a inversa: **sai a contagem, nunca a linha**. Hoje, para somar, o painel
-- puxaria registro individual de sintoma para o navegador — prontuario viajando
-- para virar estatistica. Uma funcao que devolve so o numero MELHORA a
-- privacidade em vez de afrouxa-la, e paga UMA leitura auditada no lugar de
-- quarenta.
--
-- A REGRA DO PREFIXO, e ela e contrato com os front-ends:
--   read_*       devolve LINHAS sobre paciente identificado; pagina, tem teto.
--   summarize_*  devolve SO NUMEROS. Nenhum nome, nenhum CPF, nenhum
--                patient_id, nenhum id de registro clinico sai daqui. Para
--                descer ao individuo o caminho e a read_* por paciente, que
--                registra o acesso aquele titular.
-- O prefixo e a documentacao: quem le a assinatura sabe, sem abrir o corpo, que
-- dali nao sai identificador.
--
-- O SIGILO ENTRE ESPECIALIDADES NAO PRECISOU DE NENHUMA REGRA NOVA, e esse e o
-- ponto mais importante do desenho. As funcoes sao SECURITY DEFINER com dono
-- `clinical_reader`, entao a RLS de cada tabela vale DENTRO delas, com o
-- auth.uid() de quem chamou. O agregado se forma sobre as linhas que o chamador
-- ja podia ler uma a uma — nunca sobre mais. Consequencias diretas:
--   * o compromisso e a conversa da psicologia nascem `specialty_restricted`
--     (trigger de create_appointments/create_conversations), e a politica do
--     administrador exige `visibility = 'team'`: eles NAO entram na conta dele,
--     e a especialidade confidencial nao aparece no recorte por especialidade;
--   * a psicologa, chamando a mesma funcao, ve a propria area — porque ela ja
--     a via linha a linha;
--   * paciente, cuidador e conta sem perfil recebem resumo VAZIO, porque as
--     politicas deles sao `TO authenticated` e nao alcancam este role.
-- Nenhum `IF perfil = ... THEN` no corpo. Quem decide e a politica, como no
-- resto do projeto.
--
-- O row_count DO RESUMO CONTA OS REGISTROS AGREGADOS, NAO AS LINHAS DEVOLVIDAS.
-- E por isso que as tres funcoes acumulam num laco em vez de usar RETURN QUERY
-- + GET DIAGNOSTICS. Um resumo que varre 40 mil registros de sintoma e devolve
-- 12 baldes registraria "row_count = 12" na trilha — o numero que separa
-- "consultou" de "varreu" diria exatamente a coisa errada, e diria com cara de
-- verdade. O laco custa uma iteracao por balde (dezenas, nao milhares).
--
-- ATRIBUICAO TEMPORAL (premissa P1 da ADR-006, confirmada pela clinica em
-- 31/08/2026): o evento pertence ao protocolo DA DATA DO EVENTO, nunca ao
-- protocolo atual do paciente. E por isso que `treatment_plans` e tabela com
-- historico, e e o unico jeito de "efeitos por protocolo" nao mentir quando o
-- paciente troca de esquema no meio do ano.
--
-- O QUE FICOU DE FORA, DECLARADO: "engajamento no app" foi pedido junto dos
-- indicadores de atendimento e NAO tem definicao em fonte nenhuma. E a questao
-- #4, encerrada em 31/08/2026 como "definicao de relatorio, a decidir com a
-- clinica sobre dado real" — e este e o momento em que se decide. Reaberta como
-- **#44**. Numero calculado sobre definicao inventada e pior que indicador
-- ausente: o ausente se ve, o inventado nao.


-- ============================================================
-- 1. Indices das varreduras novas
-- ============================================================
--
-- Todos os indices destas tabelas comecam por patient_id ou professional_id,
-- porque ate hoje TODA leitura clinica era por paciente. O resumo e a primeira
-- consulta do projeto que atravessa a base filtrando SO por janela de tempo, e
-- sem estes indices ela e seq scan em tabela de dado de saude.

-- O cruzamento clinico varre o diario por data, e so registro finalizado conta.
-- Indice parcial pelo mesmo motivo de idx_diary_entries_saved: rascunho nao e
-- dado, e o parcial nao carrega o que nunca sera lido (query-partial-indexes).
CREATE INDEX idx_diary_entries_period ON public.diary_entries (entry_date)
  WHERE status = 'saved';

-- A juncao LATERAL "qual protocolo valia na data do evento" busca por paciente
-- e ordena por inicio. Igualdade primeiro, intervalo depois
-- (query-composite-indexes).
CREATE INDEX idx_treatment_plans_patient_period
  ON public.treatment_plans (patient_id, started_on DESC);

-- A agenda da clinica inteira, por janela — a consulta que nenhum indice de
-- appointments servia, porque todos comecam por paciente ou profissional.
CREATE INDEX idx_appointments_period ON public.appointments (starts_at);

-- Conversas abertas na janela: o resumo de atendimento agrupa pela ABERTURA,
-- nao pela ultima mensagem (que e o que idx_conversations_specialty ordena).
CREATE INDEX idx_conversations_opened ON public.conversations (created_at);

-- "Primeira resposta da equipe" e um MIN(created_at) por conversa restrito a
-- mensagem de profissional. O indice parcial responde isso sem tocar no corpo
-- das mensagens de paciente, que sao a maioria.
CREATE INDEX idx_messages_first_professional
  ON public.messages (conversation_id, created_at)
  WHERE author_kind = 'professional';


-- ============================================================
-- 2. Cruzamento clinico — protocolo x sintoma x grau x quantidade
-- ============================================================
--
-- Serve a tela de Estatisticas Clinicas e o relatorio "efeitos por protocolo".
--
-- A LINHA DE protocol_name NULO E RESULTADO, NAO RESIDUO. Ela e a resposta a
-- pergunta "quantos ficaram de fora?", e existe porque a juncao com o plano e
-- LEFT, nunca INNER. Sem ela o resumo descartaria em silencio todo evento de
-- paciente sem plano registrado, e a tela afirmaria um numero que nao mediu.
-- Enquanto o Gemed estiver desligado, essa linha e a MAIORIA — o plano so entra
-- por RPC manual. Isso e o estado correto, nao defeito, e e o que permite a
-- tela OMITIR o indicador em vez de exibir zero (que e o criterio que o proprio
-- dev do painel adotou no Dashboard dele, e ele esta certo).
--
-- Plano sem `started_on` tambem cai no balde nulo: a data do evento nao tem
-- como cair dentro de um intervalo que nao existe. Preferir "nao sei" a chutar
-- o plano mais recente e a mesma disciplina da P1.
CREATE FUNCTION public.summarize_symptoms_by_protocol(
  p_from       date,
  p_to         date,
  p_protocol   text DEFAULT NULL,
  p_symptom_id uuid DEFAULT NULL
)
RETURNS TABLE (
  protocol_name text,
  symptom_id    uuid,
  symptom_label text,
  grade         smallint,
  report_count  bigint,
  patient_count bigint
)
LANGUAGE plpgsql
VOLATILE                        -- STABLE seria mentira: a funcao ESCREVE na trilha
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    record;
  v_events bigint := 0;
BEGIN
  -- Janela obrigatoria: varredura sem periodo nao e relatorio, e dump. E o
  -- limite tambem protege a trilha, que passa a dizer sobre QUANTO se varreu.
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN
    SELECT tpl.protocol_name           AS bucket_protocol,
           r.symptom_id                 AS bucket_symptom,
           s.label                      AS bucket_symptom_label,
           r.grade                      AS bucket_grade,
           count(*)                     AS n_reports,
           count(DISTINCT e.patient_id) AS n_patients
      FROM public.diary_symptom_reports r
      JOIN public.diary_entries e ON e.id = r.diary_entry_id
      -- LEFT e nao INNER tambem aqui: sintoma aposentado (is_active = false)
      -- continua tendo rotulo, e o historico nao pode encolher porque a clinica
      -- tirou um item do seletor.
      LEFT JOIN public.symptoms s ON s.id = r.symptom_id
      LEFT JOIN LATERAL (
        SELECT tp.protocol_name
          FROM public.treatment_plans tp
         WHERE tp.patient_id = e.patient_id
           AND tp.started_on IS NOT NULL
           AND tp.started_on <= e.entry_date
           AND (tp.ended_on IS NULL OR tp.ended_on >= e.entry_date)
         ORDER BY tp.started_on DESC
         LIMIT 1
      ) tpl ON true
     WHERE e.status = 'saved'
       AND e.entry_date >= p_from
       AND e.entry_date <= p_to
       AND (p_protocol   IS NULL OR tpl.protocol_name = p_protocol)
       AND (p_symptom_id IS NULL OR r.symptom_id = p_symptom_id)
     GROUP BY tpl.protocol_name, r.symptom_id, s.label, r.grade
     ORDER BY tpl.protocol_name NULLS LAST, s.label, r.grade
  LOOP
    v_events      := v_events + v_row.n_reports;
    protocol_name := v_row.bucket_protocol;
    symptom_id    := v_row.bucket_symptom;
    symptom_label := v_row.bucket_symptom_label;
    grade         := v_row.bucket_grade;
    report_count  := v_row.n_reports;
    patient_count := v_row.n_patients;
    RETURN NEXT;
  END LOOP;

  -- patient_id NULL: o resumo nao tem titular. A contagem e de REGISTROS
  -- agregados, e e ela que denuncia varredura.
  PERFORM private.log_clinical_read('diary_symptom_reports', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_symptoms_by_protocol(date, date, text, uuid) IS
  'Protocolo x sintoma x grau x quantidade, atribuido ao protocolo da DATA DO EVENTO (ADR-006 P1). So devolve numeros. A linha de protocol_name NULL declara quantos eventos ficaram sem plano — enquanto o Gemed estiver desligado, e a maioria.';


-- ============================================================
-- 3. Agenda da clinica — compromissos por periodo, tipo, especialidade e situacao
-- ============================================================
--
-- Serve sessoes realizadas, faltas, cancelamentos, adesao a agenda e volume por
-- especialidade — os cinco indicadores que a secao 11 do guia listava como "sem
-- fonte".
--
-- O NULO DE `origin_specialty_id` E BALDE, NAO LIXO. `appointments.professional_id`
-- e nulavel por desenho (ADR-014 §9: "Hemograma + bioquimica · Laboratorio
-- parceiro · com —"), e `origin_specialty_id` acompanha. Um INNER JOIN com
-- `specialties` perderia exatamente os compromissos de laboratorio parceiro, que
-- sao justamente os que o relatorio de faltas mais precisa contar. LEFT JOIN, e
-- a linha de especialidade nula e a resposta a "quantos ficaram fora do recorte".
--
-- `status_reason_id` ENTRA COMO DIMENSAO MESMO COM A TABELA VAZIA. Hoje
-- `appointment_status_reasons` nao tem uma linha (a clinica ainda nao definiu a
-- lista), entao todo balde sai com motivo nulo e o agrupamento nao muda nada. No
-- dia em que a lista existir, o recorte por motivo aparece sozinho, sem
-- migration e sem mudanca de assinatura. E a diferenca entre comportar o motivo
-- e depender dele.
CREATE FUNCTION public.summarize_appointments(
  p_from                timestamptz,
  p_to                  timestamptz,
  p_granularity         text DEFAULT 'month',
  p_specialty_id        uuid DEFAULT NULL,
  p_appointment_type_id uuid DEFAULT NULL
)
RETURNS TABLE (
  bucket_start           date,
  appointment_type_id    uuid,
  appointment_type_label text,
  specialty_id           uuid,
  specialty_label        text,
  status_code            text,
  status_label           text,
  status_reason_id       uuid,
  status_reason_label    text,
  appointment_count      bigint,
  patient_count          bigint,
  confirmed_count        bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    record;
  v_events bigint := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lista branca antes de `date_trunc`: o parametro e texto e vai para dentro
  -- de uma funcao que aceita qualquer campo. Sem a guarda, 'millennium' viraria
  -- um balde so, e um valor invalido viraria erro de banco na cara do usuario.
  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'p_granularity aceita day, week ou month'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN
    -- AT TIME ZONE antes do date_trunc, pelo mesmo motivo do DEFAULT de
    -- diary_entries.entry_date: truncar em UTC joga o compromisso das 21h de
    -- Chapeco para o dia seguinte, e o relatorio mensal erra a virada do mes.
    SELECT (pg_catalog.date_trunc(p_granularity,
              a.starts_at AT TIME ZONE 'America/Sao_Paulo'))::date AS bucket,
           a.appointment_type_id        AS type_id,
           t.label                      AS type_label,
           a.origin_specialty_id        AS spec_id,
           s.label                      AS spec_label,
           st.code                      AS st_code,
           st.label                     AS st_label,
           a.status_reason_id           AS reason_id,
           rs.label                     AS reason_label,
           count(*)                     AS n_appointments,
           count(DISTINCT a.patient_id) AS n_patients,
           count(*) FILTER (WHERE a.confirmed_at IS NOT NULL) AS n_confirmed
      FROM public.appointments a
      LEFT JOIN public.appointment_types              t  ON t.id  = a.appointment_type_id
      LEFT JOIN public.appointment_statuses           st ON st.id = a.status_id
      LEFT JOIN public.appointment_status_reasons     rs ON rs.id = a.status_reason_id
      LEFT JOIN public.specialties                    s  ON s.id  = a.origin_specialty_id
     WHERE a.starts_at >= p_from
       AND a.starts_at <  p_to
       AND (p_specialty_id        IS NULL OR a.origin_specialty_id  = p_specialty_id)
       AND (p_appointment_type_id IS NULL OR a.appointment_type_id  = p_appointment_type_id)
     GROUP BY 1, a.appointment_type_id, t.label, a.origin_specialty_id, s.label,
              st.code, st.label, a.status_reason_id, rs.label
     ORDER BY 1, t.label, s.label NULLS LAST, st.code
  LOOP
    v_events               := v_events + v_row.n_appointments;
    bucket_start           := v_row.bucket;
    appointment_type_id    := v_row.type_id;
    appointment_type_label := v_row.type_label;
    specialty_id           := v_row.spec_id;
    specialty_label        := v_row.spec_label;
    status_code            := v_row.st_code;
    status_label           := v_row.st_label;
    status_reason_id       := v_row.reason_id;
    status_reason_label    := v_row.reason_label;
    appointment_count      := v_row.n_appointments;
    patient_count          := v_row.n_patients;
    confirmed_count        := v_row.n_confirmed;
    RETURN NEXT;
  END LOOP;

  PERFORM private.log_clinical_read('appointments', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_appointments(timestamptz, timestamptz, text, uuid, uuid) IS
  'Compromissos por periodo x tipo x especialidade x situacao x motivo. So devolve numeros. Especialidade NULA e balde legitimo (laboratorio parceiro, ADR-014 §9), nao descarte.';


-- ============================================================
-- 4. Indicadores de atendimento — tempo ate a primeira resposta da equipe
-- ============================================================
--
-- O QUE ESTA FUNCAO **NAO** RESPONDE, e esta declarado porque a ausencia
-- importa mais que a presenca: **engajamento no app**. Foi pedido no mesmo item
-- e nao tem definicao em fonte nenhuma — sessoes? dias com registro no diario?
-- leitura de orientacao? mensagens enviadas? Cada leitura produz um numero
-- diferente e todas cabem na palavra. E a questao **#44**, e ate ela fechar com
-- a clinica nao ha funcao, porque um `summarize_engagement` com definicao
-- inventada viraria numero em slide sem ninguem lembrar de onde saiu.
--
-- A JANELA E SOBRE A ABERTURA DA CONVERSA, nao sobre a resposta. Isso torna o
-- indicador honesto sobre a DEMANDA que chegou no periodo, e traz um vies que a
-- tela precisa saber ler: conversa aberta no fim da janela e respondida depois
-- de `p_to` conta como NAO RESPONDIDA. A janela mais recente sempre parece pior
-- do que foi. E por isso que `unanswered_count` sai separado e as estatisticas
-- de tempo se calculam SO sobre as respondidas — media que trata o pendente
-- como zero, ou que o ignora sem dizer, e o mesmo erro de exibir zero como
-- medicao.
--
-- MEDIANA E p90 ALEM DA MEDIA: numa fila de atendimento a media e a estatistica
-- mais facil de enganar — duas conversas respondidas em tres dias empurram o
-- mes inteiro. O p90 e o que responde "quao ruim fica quando fica ruim", que e
-- a pergunta de quem opera a fila.
CREATE FUNCTION public.summarize_chat_response_times(
  p_from         timestamptz,
  p_to           timestamptz,
  p_granularity  text DEFAULT 'month',
  p_specialty_id uuid DEFAULT NULL
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
  first_response_p90_seconds     bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    record;
  v_events bigint := 0;
BEGIN
  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_granularity IS NULL OR p_granularity NOT IN ('day', 'week', 'month') THEN
    RAISE EXCEPTION 'p_granularity aceita day, week ou month'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_row IN
    WITH base AS (
      SELECT c.id,
             (pg_catalog.date_trunc(p_granularity,
                c.created_at AT TIME ZONE 'America/Sao_Paulo'))::date AS bucket,
             c.created_at          AS opened_at,
             c.origin_specialty_id AS spec_id,
             -- A primeira resposta da EQUIPE. `author_kind = 'professional'`
             -- e nao "tem author_professional_id": mensagem de sistema nao e
             -- atendimento, e conta-la como resposta zeraria o indicador toda
             -- vez que o banco escrevesse um aviso automatico.
             ( SELECT pg_catalog.min(m.created_at)
                 FROM public.messages m
                WHERE m.conversation_id = c.id
                  AND m.author_kind = 'professional' ) AS first_reply_at
        FROM public.conversations c
       WHERE c.created_at >= p_from
         AND c.created_at <  p_to
         AND (p_specialty_id IS NULL OR c.origin_specialty_id = p_specialty_id)
    )
    SELECT b.bucket                        AS bucket,
           b.spec_id                       AS spec_id,
           s.label                         AS spec_label,
           count(*)                        AS n_conversations,
           count(b.first_reply_at)         AS n_answered,
           count(*) - count(b.first_reply_at) AS n_unanswered,
           -- `extract(... FROM ...)` sem qualificacao: e GRAMATICA SQL, nao
           -- funcao — `pg_catalog.extract(epoch FROM x)` nao parseia. Mesma
           -- familia de COALESCE, LEAST e current_user, ja anotada duas vezes
           -- neste projeto.
           pg_catalog.avg(
             extract(epoch FROM (b.first_reply_at - b.opened_at))
           )                               AS avg_seconds,
           pg_catalog.percentile_cont(0.5) WITHIN GROUP (
             ORDER BY extract(epoch FROM (b.first_reply_at - b.opened_at))
           )                               AS median_seconds,
           pg_catalog.percentile_cont(0.9) WITHIN GROUP (
             ORDER BY extract(epoch FROM (b.first_reply_at - b.opened_at))
           )                               AS p90_seconds
      FROM base b
      LEFT JOIN public.specialties s ON s.id = b.spec_id
     GROUP BY b.bucket, b.spec_id, s.label
     ORDER BY b.bucket, s.label NULLS LAST
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
    RETURN NEXT;
  END LOOP;

  PERFORM private.log_clinical_read('conversations', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid) IS
  'Tempo ate a primeira resposta da equipe, por periodo e especialidade. So devolve numeros. NAO cobre "engajamento no app", que e a questao #44 e nao tem definicao em fonte.';


-- ============================================================
-- 5. Privilegios — SEMPRE no fim (REVOKE so atinge o que ja existe)
-- ============================================================

-- O dono das funcoes precisa de CREATE no schema so no instante do
-- ALTER ... OWNER TO. Concede, transfere, devolve.
GRANT CREATE ON SCHEMA public TO clinical_reader;

-- E ISTO — e so isto — que faz a RLS valer dentro delas. Dono `postgres` seria
-- dono das tabelas, e a RLS nao se aplica ao dono: o resumo passaria a somar a
-- base inteira, em silencio, para qualquer chamador. E o erro mais caro
-- possivel aqui, porque nao levanta erro nenhum — so devolve numero maior.
ALTER FUNCTION public.summarize_symptoms_by_protocol(date, date, text, uuid)
  OWNER TO clinical_reader;
ALTER FUNCTION public.summarize_appointments(timestamptz, timestamptz, text, uuid, uuid)
  OWNER TO clinical_reader;
ALTER FUNCTION public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid)
  OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

-- ARMADILHA Nº 6 (ADR-016, medida em 11/09/2026): o REVOKE **e o GRANT** das
-- funcoes de `clinical_reader` precisam sair de dentro de um SET LOCAL ROLE
-- para o dono. Sob `db push` a cadeia de SET ROLE nao propaga o direito de
-- administrar objeto alheio (inherit_option = false em duas associacoes), e
-- so o DONO pode conceder sobre o proprio objeto. `db reset` NAO reproduz a
-- falha, porque conecta direto como `postgres` — mesmo SQL, resultado
-- diferente conforme o caminho, e o push e o caminho que vale.
--
-- O REVOKE e obrigatorio porque a troca de dono REINTRODUZ a concessao a PUBLIC
-- pelo default privilege, e porque o default privilege do Supabase entrega toda
-- funcao nova de `public` a `anon` (ADR-016, armadilha nº 5).
DO $$
DECLARE v_fn text;
BEGIN
  SET LOCAL ROLE clinical_reader;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.summarize_symptoms_by_protocol(date, date, text, uuid)',
    'public.summarize_appointments(timestamptz, timestamptz, text, uuid, uuid)',
    'public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid)'
  ]
  LOOP
    -- FROM PUBLIC, anon nos dois: revogar de um NAO alcanca o outro
    -- (armadilhas nº 2 e nº 3 da ADR-016).
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_fn);
    EXECUTE pg_catalog.format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', v_fn);
  END LOOP;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  -- Sem o RESET o papel vaza para o resto da migration e o proximo comando que
  -- dependa de uuid_generate_v7 morre por privilegio. Medido.
  RESET ROLE;
  RAISE;
END;
$$;

-- ASSERCAO DE EFEITO, nao de execucao (ADR-016). Os comandos acima estao dentro
-- de um bloco com EXCEPTION, e bloco que so emitisse NOTICE seria
-- indistinguivel de sucesso no output do push — `RAISE NOTICE` nao aparece no
-- `supabase db push`. Aqui o RAISE e incondicional se o privilegio nao existir
-- de fato, e os DOIS lados importam: que `anon` nao alcance, e que
-- `authenticated` alcance.
DO $$
DECLARE
  v_assinaturas text[] := ARRAY[
    'public.summarize_symptoms_by_protocol(date, date, text, uuid)',
    'public.summarize_appointments(timestamptz, timestamptz, text, uuid, uuid)',
    'public.summarize_chat_response_times(timestamptz, timestamptz, text, uuid)'
  ];
  v_faltando text;
  v_aberto   text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_faltando
    FROM pg_catalog.unnest(v_assinaturas) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE');

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated ficou SEM EXECUTE nos resumos: %. As tres telas de relatorio continuariam inertes.',
      v_faltando;
  END IF;

  SELECT pg_catalog.string_agg(sig, ', ') INTO v_aberto
    FROM pg_catalog.unnest(v_assinaturas) AS sig
   WHERE pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');

  IF v_aberto IS NOT NULL THEN
    RAISE EXCEPTION
      'anon AINDA EXECUTA resumo clinico: %. Estatistica de prontuario alcancavel sem login.',
      v_aberto;
  END IF;
END;
$$;

-- ASSERCAO DE ISOLAMENTO: o dono e o que sustenta a RLS dentro da funcao, e ele
-- se perde por acidente banal (um CREATE OR REPLACE aplicado como `postgres`
-- devolve a funcao ao dono anterior). Medir aqui custa nada e evita descobrir
-- em producao que o resumo passou a somar a base inteira.
DO $$
DECLARE v_errado text;
BEGIN
  SELECT pg_catalog.string_agg(p.oid::regprocedure::text, ', ') INTO v_errado
    FROM pg_catalog.pg_proc      p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_catalog.pg_roles     r ON r.oid = p.proowner
   WHERE n.nspname = 'public'
     AND p.proname LIKE 'summarize\_%'
     AND r.rolname <> 'clinical_reader';

  IF v_errado IS NOT NULL THEN
    RAISE EXCEPTION
      'resumo com dono errado: %. Dono que e dono das tabelas nao sofre RLS — o agregado atravessaria o sigilo sem erro nenhum.',
      v_errado;
  END IF;
END;
$$;
