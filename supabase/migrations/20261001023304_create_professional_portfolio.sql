-- A carteira do profissional, parte que nao depende de ninguem: o que A PESSOA
-- fez na janela, ao lado da media dos colegas da mesma area.
-- Plano das pendencias do painel de 30/09/2026, Fase I, item I.3a (painel #5,
-- decisao D5).
-- Design e racional: supera-docs/ADRs/ADR-021 — Funções de resumo do painel.md (emenda de 30/09/2026)
--
-- O QUE ENTRA E O QUE ESPERA. A carteira pedida tem duas metades:
--   I.3a (esta) — indicadores de ACAO DA PESSOA: alertas que ela assumiu e
--     resolveu, e o tempo ate a primeira resposta nas conversas em que ela foi
--     a primeira a responder. Cada um tem dono na propria linha
--     (`triaged_by_professional_id`, `resolved_by_professional_id`,
--     `messages.author_professional_id`), e por isso NAO depende de saber
--     quem e "paciente da carteira".
--   I.3b — pacientes ativos da carteira, distribuicao por fase e a lista
--     "precisa de atencao". Isso exige a definicao de "meu paciente", que a
--     CEON ainda nao respondeu (D4, pergunta 3 de 30/09/2026). NAO SOBE antes
--     da resposta: a definicao muda o numero que a tela mostra, e numero sobre
--     definicao inventada e pior que indicador ausente.
--
-- SEMPRE DO PROPRIO PROFISSIONAL. Nao ha parametro de profissional, e nao e
-- esquecimento: a regra da ADR-021 (nenhum resumo recorta por profissional
-- identificado) continua de pe. A funcao responde "como EU estou", nunca
-- "como fulano esta". Quem nao e profissional ativo (administrador,
-- paciente, conta pendente) recebe `professional_profile_required`, porque
-- "minha carteira" nao tem sujeito — vazio esconderia o erro de tela.
--
-- O COMPARATIVO (D5, decidida em 30/09/2026):
--   * media da especialidade EXCLUINDO quem consulta — com o proprio dentro,
--     a pessoa se compararia em parte consigo mesma, e numa area de quatro o
--     proprio numero pesaria um quarto da "media dos colegas";
--   * so com PELO MENOS 3 OUTROS ativos na area (c_min_peers). Abaixo disso o
--     comparativo vem NULO: com 1 colega a media E o colega, e com 2 quem
--     consulta deduz o outro sabendo o numero de um. O minimo e constante da
--     funcao, nao parametro: parametro deixaria o painel pedir 1;
--   * "ativo na area": profissional ativo, conta ativa e vinculo com a
--     especialidade vigente (`ended_at IS NULL`). O convidado pendente da
--     Fase F nao conta (o papel dele e inativo);
--   * para contagem (alertas), a media e POR PESSOA: o total dos colegas
--     dividido pelo numero de colegas ativos, inclusive os que nao fizeram
--     nada. Para tempo (resposta), e a media das respostas dos colegas,
--     somadas. Nenhuma saida carrega id de outro profissional.
--
-- O SIGILO CONTINUA SENDO A RLS. A funcao e de `clinical_reader`, entao as
-- conversas que entram na conta sao as que quem consulta ja enxerga: as
-- `team` e as restritas da propria area. A conversa sigilosa de outra area
-- nao entra nem no proprio numero nem no dos colegas. Consequencia
-- declarada: quem trocou de area deixa de ver as conversas restritas da area
-- antiga, e elas saem do proprio historico.
--
-- A LISTA DE COLEGAS vem de um helper em `private`, de `postgres`, porque
-- `clinical_reader` nao le `professionals`, `accounts` nem
-- `professional_specialties` — e nao precisa: o helper devolve so ids, que
-- nunca saem da funcao. EXECUTE so para clinical_reader.
--
-- UMA LINHA POR ESPECIALIDADE VIGENTE de quem consulta (quase sempre uma). Os
-- numeros da propria pessoa se repetem em cada linha; o que muda e a area do
-- comparativo. Profissional sem especialidade vigente recebe uma linha com
-- especialidade nula e comparativo nulo.


-- ============================================================
-- 1. Os colegas ativos de uma area — helper privado
-- ============================================================

CREATE FUNCTION private.active_specialty_peer_ids(p_specialty_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.array_agg(DISTINCT p.id), '{}'::uuid[])
    FROM public.professional_specialties ps
    JOIN public.professionals p ON p.id = ps.professional_id
    JOIN public.accounts      a ON a.id = p.account_id
   WHERE ps.specialty_id = p_specialty_id
     AND ps.ended_at IS NULL
     AND p.is_active
     AND a.is_active
     -- Quem consulta nunca e colega de si mesmo (D5).
     AND p.account_id IS DISTINCT FROM auth.uid();
$$;

COMMENT ON FUNCTION private.active_specialty_peer_ids(uuid) IS
  'Ids dos profissionais ativos (perfil e conta) com vinculo vigente na especialidade, EXCLUINDO quem chama. So para o comparativo de summarize_my_portfolio; os ids nunca saem dela. EXECUTE so para clinical_reader.';


-- ============================================================
-- 2. A funcao — criada de dentro do papel dono
-- ============================================================

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

CREATE FUNCTION public.summarize_my_portfolio(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS TABLE (
  specialty_id                    uuid,
  specialty_label                 text,
  peer_count                      integer,
  alerts_triaged_count            bigint,
  alerts_resolved_count           bigint,
  peer_alerts_triaged_avg         numeric,
  peer_alerts_resolved_avg        numeric,
  first_response_count            bigint,
  first_response_avg_seconds      bigint,
  peer_first_response_avg_seconds bigint
)
LANGUAGE plpgsql
VOLATILE                        -- escreve na trilha
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- D5: o comparativo so existe com pelo menos tres OUTROS ativos na area.
  c_min_peers CONSTANT integer := 3;

  v_me          uuid;
  v_specs       uuid[];
  v_spec        uuid;
  v_peers       uuid[];
  v_n           integer;
  v_triaged     bigint;
  v_resolved    bigint;
  v_resp_n      bigint;
  v_resp_avg    numeric;
  v_alert_evts  bigint := 0;
  v_conv_evts   bigint := 0;
  v_p_triaged   bigint;
  v_p_resolved  bigint;
  v_p_resp_n    bigint;
  v_p_resp_avg  numeric;
BEGIN
  v_me := private.my_professional_id();
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'professional_profile_required'
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'A carteira e do proprio profissional ativo; administrador e paciente nao tem uma.';
  END IF;

  IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_from e p_to sao obrigatorios e p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Os numeros da propria pessoa: calculados uma vez, repetidos em cada linha.
  -- Alerta: a janela vale sobre o instante da ACAO (assumiu, resolveu), nao
  -- sobre o nascimento do alerta — o indicador e do que a pessoa fez no periodo.
  SELECT count(*) FILTER (WHERE a.triaged_by_professional_id  = v_me
                            AND a.triaged_at  >= p_from AND a.triaged_at  < p_to),
         count(*) FILTER (WHERE a.resolved_by_professional_id = v_me
                            AND a.resolved_at >= p_from AND a.resolved_at < p_to)
    INTO v_triaged, v_resolved
    FROM public.alerts a
   WHERE a.triaged_by_professional_id = v_me
      OR a.resolved_by_professional_id = v_me;

  v_alert_evts := v_alert_evts + v_triaged + v_resolved;

  -- Chat: conversas ABERTAS na janela (a mesma janela do resumo da clinica,
  -- summarize_chat_response_times) cuja PRIMEIRA resposta da equipe foi desta
  -- pessoa. Quem respondeu depois de um colega nao "respondeu primeiro", e a
  -- conversa que chegou ja encaminhada conta para quem respondeu antes.
  SELECT count(*), pg_catalog.avg(extract(epoch FROM (f.first_at - f.opened_at)))
    INTO v_resp_n, v_resp_avg
    FROM ( SELECT c.created_at AS opened_at, fr.created_at AS first_at,
                  fr.author_professional_id AS author
             FROM public.conversations c
            CROSS JOIN LATERAL (
              SELECT m.created_at, m.author_professional_id
                FROM public.messages m
               WHERE m.conversation_id = c.id
                 AND m.author_kind = 'professional'
               ORDER BY m.created_at, m.id
               LIMIT 1
            ) fr
            WHERE c.created_at >= p_from
              AND c.created_at <  p_to ) f
   WHERE f.author = v_me;

  v_conv_evts := v_conv_evts + v_resp_n;

  v_specs := private.my_specialty_ids();

  FOR v_spec IN
    SELECT s FROM pg_catalog.unnest(v_specs) AS s
    UNION ALL
    -- Sem especialidade vigente: uma linha so, com o comparativo nulo.
    SELECT NULL::uuid WHERE pg_catalog.cardinality(v_specs) = 0
  LOOP
    v_peers := CASE WHEN v_spec IS NULL THEN '{}'::uuid[]
                    ELSE private.active_specialty_peer_ids(v_spec) END;
    v_n := pg_catalog.cardinality(v_peers);

    v_p_triaged := NULL; v_p_resolved := NULL; v_p_resp_avg := NULL;

    IF v_n >= c_min_peers THEN
      SELECT count(*) FILTER (WHERE a.triaged_by_professional_id = ANY (v_peers)
                                AND a.triaged_at  >= p_from AND a.triaged_at  < p_to),
             count(*) FILTER (WHERE a.resolved_by_professional_id = ANY (v_peers)
                                AND a.resolved_at >= p_from AND a.resolved_at < p_to)
        INTO v_p_triaged, v_p_resolved
        FROM public.alerts a
       WHERE a.triaged_by_professional_id = ANY (v_peers)
          OR a.resolved_by_professional_id = ANY (v_peers);

      SELECT count(*), pg_catalog.avg(extract(epoch FROM (f.first_at - f.opened_at)))
        INTO v_p_resp_n, v_p_resp_avg
        FROM ( SELECT c.created_at AS opened_at, fr.created_at AS first_at,
                      fr.author_professional_id AS author
                 FROM public.conversations c
                CROSS JOIN LATERAL (
                  SELECT m.created_at, m.author_professional_id
                    FROM public.messages m
                   WHERE m.conversation_id = c.id
                     AND m.author_kind = 'professional'
                   ORDER BY m.created_at, m.id
                   LIMIT 1
                ) fr
                WHERE c.created_at >= p_from
                  AND c.created_at <  p_to ) f
       WHERE f.author = ANY (v_peers);

      v_alert_evts := v_alert_evts + v_p_triaged + v_p_resolved;
      v_conv_evts  := v_conv_evts + v_p_resp_n;
    END IF;

    specialty_id                    := v_spec;
    specialty_label                 := (SELECT s.label FROM public.specialties s WHERE s.id = v_spec);
    peer_count                      := v_n;
    alerts_triaged_count            := v_triaged;
    alerts_resolved_count           := v_resolved;
    peer_alerts_triaged_avg         := pg_catalog.round(v_p_triaged::numeric  / NULLIF(v_n, 0), 2);
    peer_alerts_resolved_avg        := pg_catalog.round(v_p_resolved::numeric / NULLIF(v_n, 0), 2);
    first_response_count            := v_resp_n;
    first_response_avg_seconds      := pg_catalog.round(v_resp_avg)::bigint;
    peer_first_response_avg_seconds := pg_catalog.round(v_p_resp_avg)::bigint;
    RETURN NEXT;
  END LOOP;

  -- Duas linhas na trilha, uma por tabela agregada, contando os registros
  -- que entraram na conta (os da pessoa e os dos colegas), nao as linhas
  -- devolvidas (ADR-021).
  PERFORM private.log_clinical_read('alerts',        NULL, v_alert_evts::integer);
  PERFORM private.log_clinical_read('conversations', NULL, v_conv_evts::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_my_portfolio(timestamptz, timestamptz) IS
  'Carteira do PROPRIO profissional na janela: alertas que assumiu e resolveu, e o tempo ate a primeira resposta nas conversas abertas na janela em que respondeu primeiro. Ao lado, a media dos colegas ativos da mesma especialidade, EXCLUINDO quem consulta, so com pelo menos 3 colegas (senao nulo, D5). Uma linha por especialidade vigente. Sem parametro de profissional e sem id de colega. Pacientes da carteira (I.3b) aguardam a CEON (D4). Desde 30/09/2026.';

REVOKE EXECUTE ON FUNCTION public.summarize_my_portfolio(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.summarize_my_portfolio(timestamptz, timestamptz) TO authenticated, service_role;

RESET ROLE;
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 3. Privilegios do helper — SEMPRE no fim
-- ============================================================
--
-- Funcao nova em `private` nasce com EXECUTE para PUBLIC (default do Postgres),
-- e authenticated herdaria uma lista de colegas que nao tem por que chamar.

REVOKE EXECUTE ON FUNCTION private.active_specialty_peer_ids(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION private.active_specialty_peer_ids(uuid) TO clinical_reader;


-- ============================================================
-- 4. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_fn     text := 'public.summarize_my_portfolio(timestamptz, timestamptz)';
  v_helper text := 'private.active_specialty_peer_ids(uuid)';
  v_dono   text;
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

  IF NOT pg_catalog.has_function_privilege('clinical_reader', v_helper, 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader sem EXECUTE em %: o comparativo morreria por privilegio', v_helper;
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', v_helper, 'EXECUTE')
  OR pg_catalog.has_function_privilege('anon', v_helper, 'EXECUTE') THEN
    RAISE EXCEPTION '% alcancavel fora do leitor auditado', v_helper;
  END IF;

  IF pg_catalog.has_schema_privilege('clinical_reader', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'clinical_reader ficou com CREATE em public depois do emprestimo.';
  END IF;
END;
$$;
