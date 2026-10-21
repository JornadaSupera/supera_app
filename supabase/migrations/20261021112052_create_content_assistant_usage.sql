-- O assistente de orientacoes: a chave que liga, os limites e o registro de
-- uso. A Edge Function ask-content-assistant e quem conversa com a IA; o
-- banco decide SE a pergunta pode ir, e conta.
-- Design e racional: supera-docs/ADRs/ADR-033 — Assistente de orientações com IA.md
--
-- E O BONUS DE IA DO CONTRATO, e a restricao dele e literal (Escopo
-- contratado — nivel MEDIO): a aplicacao "nao processara dados identificaveis
-- de pacientes", "nao desempenhara funcao de diagnostico, triagem, priorizacao
-- ou orientacao clinica", e "o provedor e a regiao de processamento serao
-- informados previamente a CONTRATANTE". Por isso:
--
--   * NASCE DESLIGADO (ai_assistant_enabled = false). Ligar e ato do
--     administrador, depois de a CEON ser informada do provedor e da regiao.
--     Sem a chave, begin_content_assistant_query recusa antes de qualquer
--     chamada a IA.
--   * NENHUM TEXTO e gravado aqui. A pergunta vai da Edge Function a IA e
--     volta; o banco guarda conta, instante, desfecho e tokens. A pergunta so
--     fica no banco se o paciente pedir uma orientacao (content_requests, na
--     migration seguinte), e ai foi ele quem a escreveu ali.
--   * O registro de uso nao tem patient_id: o limite e por CONTA (decisao de
--     21/10/2026), e a ficha nao acrescenta nada a conta de custo.
--
-- OS LIMITES SAO DA CLINICA, nao do codigo. O custo da IA e da CONTRATANTE
-- (Titularidade de contas e artefatos), entao quem aperta ou afrouxa e o
-- administrador, pelo painel, sem migration:
--   * ai_assistant_hourly_limit        — perguntas por conta, janela movel de 1 h;
--   * ai_assistant_question_max_chars  — tamanho maximo da pergunta;
--   * content_request_daily_limit      — pedidos de orientacao por conta, por
--                                        dia no fuso da clinica (usado pela
--                                        migration seguinte).
--
-- A pergunta que chega a IA conta, inclusive a que falha no provedor: o
-- limite existe justamente para o app que repete em loop. A recusada antes
-- (chave desligada, quem nao e publico da biblioteca, tamanho) nao conta.


-- ============================================================
-- 1. A chave e os limites, na linha da clinica
-- ============================================================

ALTER TABLE public.clinic_settings
  ADD COLUMN ai_assistant_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_assistant_hourly_limit smallint NOT NULL DEFAULT 20,
  ADD COLUMN ai_assistant_question_max_chars smallint NOT NULL DEFAULT 500,
  ADD COLUMN content_request_daily_limit smallint NOT NULL DEFAULT 5;

-- NOT VALID aqui e VALIDATE em validate_content_assistant_constraints, o
-- padrao do projeto (e a regra do squawk) para constraint em tabela que ja
-- existe. Ate la, a linha nova ja e conferida; so a antiga espera.
ALTER TABLE public.clinic_settings
  ADD CONSTRAINT ck_clinic_settings_ai_hourly_limit
    CHECK (ai_assistant_hourly_limit BETWEEN 1 AND 200) NOT VALID,
  ADD CONSTRAINT ck_clinic_settings_ai_question_max_chars
    CHECK (ai_assistant_question_max_chars BETWEEN 100 AND 2000) NOT VALID,
  ADD CONSTRAINT ck_clinic_settings_content_request_daily_limit
    CHECK (content_request_daily_limit BETWEEN 1 AND 50) NOT VALID;

COMMENT ON COLUMN public.clinic_settings.ai_assistant_enabled IS
  'Liga o assistente de orientacoes (bonus de IA, ADR-033). Nasce false: so liga depois de a CEON ser informada do provedor e da regiao de processamento. O app esconde o botao com false.';
COMMENT ON COLUMN public.clinic_settings.ai_assistant_hourly_limit IS
  'Perguntas ao assistente por CONTA, na ultima hora (janela movel). Conta a pergunta que chegou a IA, inclusive a que falhou. 1 a 200.';
COMMENT ON COLUMN public.clinic_settings.ai_assistant_question_max_chars IS
  'Tamanho maximo da pergunta ao assistente, em caracteres. O app usa como maxLength do campo. 100 a 2000.';
COMMENT ON COLUMN public.clinic_settings.content_request_daily_limit IS
  'Pedidos de orientacao (content_requests) por CONTA, por dia no fuso da clinica. 1 a 50.';


-- ============================================================
-- 2. O registro de uso
-- ============================================================
--
-- Em `private`: e contador, nao dado do paciente. Ninguem da API le a linha;
-- o administrador vera agregados quando houver tela para isso.

CREATE TABLE private.content_assistant_usage (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id  uuid NOT NULL REFERENCES public.accounts (id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  -- NULL enquanto a pergunta esta no provedor (ou se a funcao morreu antes de
  -- fechar: a linha continua contando no limite, que e o que se quer).
  outcome     text CHECK (outcome IN ('answered', 'no_match', 'failed')),
  provider    text CHECK (length(provider) BETWEEN 1 AND 40),
  model       text CHECK (length(model) BETWEEN 1 AND 100),
  input_tokens  bigint CHECK (input_tokens  >= 0),
  output_tokens bigint CHECK (output_tokens >= 0),
  latency_ms    bigint CHECK (latency_ms    >= 0),
  CONSTRAINT ck_content_assistant_usage_finished
    CHECK ((finished_at IS NULL) = (outcome IS NULL)),
  CONSTRAINT ck_content_assistant_usage_order
    CHECK (finished_at IS NULL OR finished_at >= started_at)
);

COMMENT ON TABLE private.content_assistant_usage IS
  'Uma linha por pergunta que foi a IA (ADR-033). Conta, instante, desfecho, provedor, modelo e tokens — NUNCA a pergunta nem a resposta. Base do limite por hora e da conta de custo. Apagada depois de 90 dias.';

-- O limite: "desta conta, na ultima hora". Cobre tambem a FK.
CREATE INDEX idx_content_assistant_usage_account_time
  ON private.content_assistant_usage (account_id, started_at DESC);

-- A limpeza, que filtra so por instante.
CREATE INDEX idx_content_assistant_usage_time
  ON private.content_assistant_usage (started_at);

-- RLS ligada e nenhuma politica, como em private.patient_link_attempts.
ALTER TABLE private.content_assistant_usage ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 3. Os limites, pelo painel
-- ============================================================

CREATE FUNCTION public.set_content_assistant_settings(
  p_enabled                 boolean,
  p_hourly_limit            integer,
  p_question_max_chars      integer,
  p_request_daily_limit     integer
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador altera o assistente de orientacoes'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Os CHECKs da tabela recusariam igual, com o nome da constraint. Aqui a
  -- recusa leva a faixa, que e o que a tela precisa mostrar.
  IF p_enabled IS NULL
     OR p_hourly_limit IS NULL OR p_hourly_limit NOT BETWEEN 1 AND 200
     OR p_question_max_chars IS NULL OR p_question_max_chars NOT BETWEEN 100 AND 2000
     OR p_request_daily_limit IS NULL OR p_request_daily_limit NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'invalid_assistant_settings'
      USING ERRCODE = 'invalid_parameter_value',
            HINT    = 'Perguntas por hora: 1 a 200. Tamanho da pergunta: 100 a 2000. Pedidos por dia: 1 a 50.';
  END IF;

  UPDATE public.clinic_settings
     SET ai_assistant_enabled            = p_enabled,
         ai_assistant_hourly_limit       = p_hourly_limit,
         ai_assistant_question_max_chars = p_question_max_chars,
         content_request_daily_limit     = p_request_daily_limit,
         updated_at                      = pg_catalog.clock_timestamp(),
         updated_by                      = auth.uid()
   WHERE id = 1;
END;
$$;

COMMENT ON FUNCTION public.set_content_assistant_settings(boolean, integer, integer, integer) IS
  'Administrador liga/desliga o assistente de orientacoes e ajusta os tres limites por conta. Grava na trilha pelo gatilho de clinic_settings. ADR-033.';


-- ============================================================
-- 4. Antes da IA — pode perguntar?
-- ============================================================
--
-- A Edge Function chama com o JWT de quem pergunta, ANTES de montar o
-- catalogo e de chamar o provedor. Recebe o TAMANHO da pergunta, nao o
-- texto: o banco nao precisa dele para decidir.
--
-- Publico: o mesmo da biblioteca (is_library_audience) — titular, ou
-- acompanhante com a area `resources`. A equipe nao usa o assistente: ela
-- escreve as orientacoes.
--
-- O trava por conta (advisory lock da transacao) fecha a corrida de duas
-- perguntas simultaneas que contariam a mesma vaga.

CREATE FUNCTION public.begin_content_assistant_query(p_question_chars integer)
RETURNS bigint
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_settings record;
  v_used     bigint;
  v_id       bigint;
BEGIN
  SELECT s.ai_assistant_enabled, s.ai_assistant_hourly_limit, s.ai_assistant_question_max_chars
    INTO v_settings
    FROM public.clinic_settings s
   WHERE s.id = 1;

  IF v_settings.ai_assistant_enabled IS NOT TRUE THEN
    RAISE EXCEPTION 'assistant_disabled' USING ERRCODE = '55000';
  END IF;

  IF v_uid IS NULL OR NOT private.is_library_audience() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_question_chars IS NULL OR p_question_chars < 3 THEN
    RAISE EXCEPTION 'question_too_short' USING ERRCODE = '22023';
  END IF;
  IF p_question_chars > v_settings.ai_assistant_question_max_chars THEN
    RAISE EXCEPTION 'question_too_long'
      USING ERRCODE = '22023',
            HINT    = pg_catalog.format('No maximo %s caracteres.', v_settings.ai_assistant_question_max_chars);
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('content_assistant:' || v_uid::text, 0));

  SELECT count(*) INTO v_used
    FROM private.content_assistant_usage u
   WHERE u.account_id = v_uid
     AND u.started_at > pg_catalog.now() - interval '1 hour';

  IF v_used >= v_settings.ai_assistant_hourly_limit THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  INSERT INTO private.content_assistant_usage (account_id)
  VALUES (v_uid)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.begin_content_assistant_query(integer) IS
  'Antes de a pergunta ir a IA: assistente ligado, publico da biblioteca (titular ou acompanhante com resources), tamanho dentro do limite e vaga na hora. Devolve o id do uso para finish_content_assistant_query. Recebe o tamanho, nunca o texto. ADR-033.';


-- ============================================================
-- 5. Depois da IA — o desfecho
-- ============================================================
--
-- So a propria conta fecha, e uma vez. Id alheio, inexistente ou ja fechado
-- respondem o mesmo erro.

CREATE FUNCTION public.finish_content_assistant_query(
  p_usage_id      bigint,
  p_outcome       text,
  p_provider      text   DEFAULT NULL,
  p_model         text   DEFAULT NULL,
  p_input_tokens  bigint DEFAULT NULL,
  p_output_tokens bigint DEFAULT NULL,
  p_latency_ms    bigint DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('answered', 'no_match', 'failed') THEN
    RAISE EXCEPTION 'invalid_outcome' USING ERRCODE = '22023';
  END IF;

  UPDATE private.content_assistant_usage
     SET finished_at   = pg_catalog.clock_timestamp(),
         outcome       = p_outcome,
         provider      = NULLIF(pg_catalog.left(btrim(p_provider), 40), ''),
         model         = NULLIF(pg_catalog.left(btrim(p_model), 100), ''),
         -- CASE e nao GREATEST(x, 0): GREATEST ignora NULL e devolveria 0,
         -- e "o provedor nao informou" viraria "zero tokens".
         input_tokens  = CASE WHEN p_input_tokens  < 0 THEN 0 ELSE p_input_tokens  END,
         output_tokens = CASE WHEN p_output_tokens < 0 THEN 0 ELSE p_output_tokens END,
         latency_ms    = CASE WHEN p_latency_ms    < 0 THEN 0 ELSE p_latency_ms    END
   WHERE id = p_usage_id
     AND account_id = auth.uid()
     AND finished_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'usage_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finish_content_assistant_query(bigint, text, text, text, bigint, bigint, bigint) IS
  'Fecha o uso aberto por begin_content_assistant_query: desfecho (answered, no_match, failed), provedor, modelo, tokens e latencia. So a propria conta, uma vez. ADR-033.';


-- ============================================================
-- 6. A limpeza
-- ============================================================

SELECT cron.schedule(
  'purge-content-assistant-usage',
  '41 3 * * *',
  $$DELETE FROM private.content_assistant_usage WHERE started_at < pg_catalog.now() - interval '90 days'$$
);


-- ============================================================
-- 7. Privilegios — no fim, e medidos
-- ============================================================

REVOKE ALL ON TABLE private.content_assistant_usage FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.set_content_assistant_settings(boolean, integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.begin_content_assistant_query(integer)                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.finish_content_assistant_query(bigint, text, text, text, bigint, bigint, bigint) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_content_assistant_settings(boolean, integer, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_content_assistant_query(integer)                            TO authenticated;
GRANT EXECUTE ON FUNCTION public.finish_content_assistant_query(bigint, text, text, text, bigint, bigint, bigint) TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.set_content_assistant_settings(boolean, integer, integer, integer)',
    'public.begin_content_assistant_query(integer)',
    'public.finish_content_assistant_query(bigint, text, text, text, bigint, bigint, bigint)'
  ];
  v_ruim text;
  v_role text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_rpcs) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio errado (authenticated sem EXECUTE ou anon com) em: %', v_ruim;
  END IF;

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_table_privilege(v_role, 'private.content_assistant_usage',
                                      'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION '% alcanca private.content_assistant_usage', v_role;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_table_privilege('postgres', 'private.content_assistant_usage', 'SELECT, INSERT, UPDATE') THEN
    RAISE EXCEPTION 'postgres perdeu acesso a private.content_assistant_usage';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.clinic_settings', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated ESCREVE clinic_settings direto: os limites seriam contornaveis';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-content-assistant-usage') THEN
    RAISE EXCEPTION 'rotina de limpeza do uso do assistente nao foi agendada';
  END IF;
END;
$$;
