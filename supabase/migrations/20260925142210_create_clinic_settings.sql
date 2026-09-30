-- Fase 5 das pendencias consolidadas: a configuracao da clinica.
-- Itens 5.1 (horario e textos), 5.4 (identidade visual, a parte de dado) e
-- 5.5 (parametros operacionais). O Storage do logo e do avatar esta em
-- create_branding_and_avatar_storage; a mensagem fora do horario, em
-- create_chat_off_hours_reply.
-- Design e racional: supera-docs/ADRs/ADR-027 — Configuracao da clinica e vocabularios editaveis.md
-- Requisito: supera-docs/Requisitos/Painel Administrativo/Configurações da clínica.md
--
-- A LISTA SUGERIA UM BALDE `chave -> valor tipado`, E ELE NAO ENTRA. O proprio
-- `security_settings` ja registrou por que: um balde perde tipo, comentario e
-- constraint de todos os assuntos ao mesmo tempo, e `alert_rules`, motivos de
-- falta e termos de uso ja mostraram que cada assunto pede a sua forma. A
-- decisao da ADR-027 e partir pelo FORMATO do dado, nao pelo assunto:
--
--   * escalares da clinica (fuso, cores, logo, textos)  -> uma linha tipada;
--   * o horario, que e lista de intervalos               -> tabela;
--   * os parametros dos graficos, cujos codigos o painel
--     define e todos sao numero                          -> tabela de codigo.
--
-- O GRAO DO HORARIO (D.7) JA ESTAVA RESPONDIDO. A CEON disse em 31/08/2026:
-- "o horario de atendimento e o mesmo para toda a equipe", sem recorte por
-- especialidade — a nota do agregado Comunicacao ja registrava isso. A lista
-- consolidada o reabriu por nao ter lido o vault. Nao ha coluna de
-- especialidade nem de profissional, de proposito: acrescentar e aditivo.
--
-- UMA EXCECAO A ADR-016, NOMEADA. O carrossel de boas-vindas aparece ANTES do
-- login (o paciente ainda nao tem conta), e o painel edita o texto dele. Para
-- o texto chegar la, alguem sem sessao precisa le-lo. A saida e UMA funcao,
-- `get_clinic_presentation`, que devolve so o que a tela de entrada mostra:
-- slides, cores e caminho do logo. A tabela continua fechada a `anon`.


-- ============================================================
-- 1. A linha da clinica
-- ============================================================

CREATE TABLE public.clinic_settings (
  -- Linha unica pelo mesmo mecanismo de security_settings: PK constante com
  -- CHECK. Duas linhas divergentes fariam a tela mostrar uma e a regra do
  -- chat usar a outra.
  id                smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  -- O fuso em que o horario de atendimento e lido. Chapeco fica em
  -- America/Sao_Paulo. A validade do nome se confere na RPC contra
  -- pg_timezone_names: CHECK nao pode consultar catalogo.
  time_zone         text NOT NULL DEFAULT 'America/Sao_Paulo',

  -- Minusculas sempre: a RPC normaliza, e o CHECK garante que so entra a
  -- forma normalizada. Duas grafias da mesma cor sao dois valores para a
  -- tela de pre-visualizacao comparar.
  primary_color     text CHECK (primary_color   ~ '^#[0-9a-f]{6}$'),
  secondary_color   text CHECK (secondary_color ~ '^#[0-9a-f]{6}$'),

  -- Caminho DENTRO do bucket clinic-branding. So o nome do arquivo, sem
  -- barra: o bucket tem um dono so, e pasta ali seria convencao sem funcao.
  logo_path         text CHECK (logo_path ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'),

  -- O carrossel de boas-vindas. JSONB porque a forma exata de cada slide e
  -- do app, e a fonte diz so "tres slides". Array vazio = o app usa o texto
  -- que ja traz embutido. A forma de cada elemento se confere na RPC.
  onboarding_slides jsonb NOT NULL DEFAULT '[]'::jsonb
                    CHECK (pg_catalog.jsonb_typeof(onboarding_slides) = 'array'),

  -- O texto da mensagem automatica fora do horario. NULL = desligada. Nasce
  -- NULL porque o texto e da clinica (D.12): texto inventado por engenharia
  -- falaria em nome da equipe sobre urgencia, que e o pior assunto para isso.
  off_hours_message text CHECK (off_hours_message IS NULL
                                OR length(btrim(off_hours_message)) BETWEEN 1 AND 1000),

  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid REFERENCES public.accounts (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.clinic_settings IS
  'Linha unica. Escalares configuraveis da clinica: fuso, identidade visual, carrossel de boas-vindas e texto fora do horario. Escrita so por RPC; leitura por todo usuario autenticado; anon so pelo recorte de get_clinic_presentation (ADR-027).';
COMMENT ON COLUMN public.clinic_settings.onboarding_slides IS
  'Array de {title, body}, no maximo 5. Vazio = o app usa o texto embutido. Lido SEM login por get_clinic_presentation: nunca pode conter dado pessoal.';
COMMENT ON COLUMN public.clinic_settings.off_hours_message IS
  'Texto da mensagem automatica fora do horario (5.2). NULL desliga a resposta. Texto da clinica (D.12), nunca semeado.';

INSERT INTO public.clinic_settings (id) VALUES (1);

ALTER TABLE public.clinic_settings ENABLE ROW LEVEL SECURITY;

-- Todo autenticado le: o app mostra o banner de horario, a cor e o logo; o
-- acompanhante tambem. Nada aqui e dado de alguem.
CREATE POLICY clinic_settings_select_authenticated ON public.clinic_settings
  FOR SELECT TO authenticated
  USING ( true );

-- Gatilho proprio, e nao `audit_write`: a PK e smallint. O gatilho de
-- security_settings ja resolve exatamente isso (grava tabela, ator e origem,
-- sem resource_id), e e reaproveitado em vez de copiado.
CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_settings
FOR EACH ROW EXECUTE FUNCTION private.audit_security_settings();


-- ============================================================
-- 2. O horario de atendimento
-- ============================================================

CREATE TABLE public.clinic_business_hours (
  id        uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- 0 = domingo, a mesma convencao de date_part('dow'), que e quem le.
  weekday   smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  opens_at  time NOT NULL,
  closes_at time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Intervalo que atravessa a meia-noite fica de fora: o chat da clinica nao
  -- tem plantao noturno, e aceitar o caso dobraria a regra de "esta aberto".
  CONSTRAINT ck_clinic_business_hours_interval CHECK (closes_at > opens_at),
  CONSTRAINT uq_clinic_business_hours_start UNIQUE (weekday, opens_at)
);

COMMENT ON TABLE public.clinic_business_hours IS
  'Horario de atendimento do chat, o MESMO para toda a equipe (CEON, 31/08/2026). Varios intervalos por dia (ex.: almoco). Tabela vazia = horario nao configurado, e a mensagem fora do horario nao dispara. Escrita so por set_clinic_business_hours, que troca a semana inteira.';

ALTER TABLE public.clinic_business_hours ENABLE ROW LEVEL SECURITY;

CREATE POLICY clinic_business_hours_select_authenticated ON public.clinic_business_hours
  FOR SELECT TO authenticated
  USING ( true );

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.clinic_business_hours
FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 3. Parametros operacionais (5.5)
-- ============================================================
--
-- "Meta mensal" e "capacidade instalada" sao os exemplos do painel, e o
-- painel e quem sabe quais linhas de referencia desenha. Por isso os codigos
-- nao sao semeados: o administrador cria pelo painel, e o codigo e o
-- contrato entre a tela e o dado.

CREATE TABLE public.operational_parameters (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code       text NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z0-9_]*$'),
  label      text NOT NULL CHECK (length(btrim(label)) > 0),
  value      numeric(14, 2) NOT NULL CHECK (value >= 0),
  -- Aposentar esconde a linha de referencia sem perder o historico da
  -- trilha. Mesma regra de todo vocabulario do projeto.
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.accounts (id) ON DELETE RESTRICT
);

COMMENT ON TABLE public.operational_parameters IS
  'Numeros de referencia dos graficos do painel (meta mensal, capacidade instalada). Codigo criado pelo painel, nunca semeado. Sem historico por vigencia: a trilha guarda quem mudou e quando.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.operational_parameters
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.operational_parameters ENABLE ROW LEVEL SECURITY;

-- So a administracao: e numero de gestao, e as telas que o usam sao do painel
-- administrativo. Abrir a equipe clinica e politica aditiva.
CREATE POLICY operational_parameters_select_admin ON public.operational_parameters
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.operational_parameters
FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 4. "A clinica esta fechada desde quando?"
-- ============================================================
--
-- NULL = aberta agora, ou horario nao configurado. Senao, o instante em que o
-- periodo fechado corrente comecou: o ultimo fechamento antes de p_at. E a
-- CHAVE da janela da mensagem automatica — duas mensagens do paciente na
-- mesma madrugada caem no mesmo fechamento, e a resposta sai uma vez so.
--
-- A conta e feita no fuso da clinica, nao no do servidor (UTC) nem no do
-- paciente: "fora do horario" e sobre quando a equipe esta la.

CREATE FUNCTION private.clinic_closed_since(p_at timestamptz)
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_tz    text;
  v_local timestamp;
  v_dow   smallint;
  v_since timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.clinic_business_hours) THEN
    RETURN NULL;
  END IF;

  SELECT s.time_zone INTO v_tz FROM public.clinic_settings s WHERE s.id = 1;
  v_local := p_at AT TIME ZONE v_tz;
  v_dow   := pg_catalog.date_part('dow', v_local)::smallint;

  IF EXISTS (
    SELECT 1 FROM public.clinic_business_hours h
     WHERE h.weekday = v_dow
       AND v_local::time >= h.opens_at
       AND v_local::time <  h.closes_at
  ) THEN
    RETURN NULL;
  END IF;

  -- Oito dias para tras cobrem a semana inteira mais o proprio dia: com ao
  -- menos um intervalo cadastrado, sempre ha um fechamento na janela.
  SELECT pg_catalog.max((d.day + h.closes_at) AT TIME ZONE v_tz)
    INTO v_since
    -- O cast para `timestamp` e a correcao de um defeito medido: com `date`
    -- nos dois extremos, o Postgres escolhe a versao `timestamptz` da
    -- generate_series, a meia-noite vira meia-noite UTC, e o AT TIME ZONE
    -- abaixo passa a converter no sentido contrario. O resultado saia seis
    -- horas errado, sem erro nenhum.
    FROM pg_catalog.generate_series(
           (v_local::date - 7)::timestamp, v_local::date::timestamp,
           interval '1 day') AS d(day)
    JOIN public.clinic_business_hours h
      ON h.weekday = pg_catalog.date_part('dow', d.day)::smallint
   WHERE d.day + h.closes_at <= v_local;

  RETURN v_since;
END;
$$;

COMMENT ON FUNCTION private.clinic_closed_since(timestamptz) IS
  'NULL se a clinica esta aberta em p_at ou nao ha horario cadastrado; senao, o inicio do periodo fechado corrente, no fuso da clinica. Chave da janela da mensagem automatica.';


-- ============================================================
-- 5. As RPCs de escrita — uma por aba do painel
-- ============================================================
--
-- Uma por aba, e nao uma com vinte parametros opcionais: a aba salva o que
-- mostra, inteiro, depois da pre-visualizacao. Com NULL significando "nao
-- mexe", nao haveria como APAGAR um valor — e apagar a cor ou o texto da
-- mensagem automatica e operacao legitima.

-- --- Identidade visual ------------------------------------------------------

CREATE FUNCTION public.set_clinic_branding(
  p_primary_color   text,
  p_secondary_color text,
  p_logo_path       text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_primary   text := pg_catalog.lower(btrim(p_primary_color));
  v_secondary text := pg_catalog.lower(btrim(p_secondary_color));
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador altera a identidade visual'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_primary !~ '^#[0-9a-f]{6}$' OR v_secondary !~ '^#[0-9a-f]{6}$' THEN
    RAISE EXCEPTION 'cor invalida: use #rrggbb'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- O logo precisa JA estar no bucket: aqui a ordem e "sobe, depois
  -- registra", o inverso do anexo clinico. O logo e publico e nao tem
  -- elegibilidade a derivar da linha; registrar antes deixaria a tela de
  -- entrada apontando para um arquivo que talvez nunca chegue.
  IF p_logo_path IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.bucket_id = 'clinic-branding' AND o.name = p_logo_path
  ) THEN
    RAISE EXCEPTION 'logo nao encontrado no bucket clinic-branding: envie o arquivo antes de salvar'
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.clinic_settings
     SET primary_color   = v_primary,
         secondary_color = v_secondary,
         logo_path       = p_logo_path,
         updated_at      = pg_catalog.clock_timestamp(),
         updated_by      = auth.uid()
   WHERE id = 1;
END;
$$;

-- --- Mensagens --------------------------------------------------------------

CREATE FUNCTION public.set_clinic_messages(
  p_onboarding_slides jsonb,
  p_off_hours_message text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_slides  jsonb := COALESCE(p_onboarding_slides, '[]'::jsonb);
  v_message text  := NULLIF(btrim(p_off_hours_message), '');
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador altera os textos da clinica'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A forma do slide e conferida aqui porque ele sai SEM LOGIN: o que
  -- passar por esta porta e servido a qualquer um. So title e body, texto,
  -- com teto — um campo a mais seria um lugar para alguem colar o que nao
  -- devia estar publico.
  --
  -- IS DISTINCT FROM e nao `<>`, E NAO E ESTILO: com `<>`, o slide `{}` faz
  -- cada comparacao devolver NULL, o OR inteiro devolve NULL, o WHERE descarta
  -- a linha — e o objeto vazio passa. E o NULL de tres valores desligando uma
  -- barreira, a mesma familia do `aal` da ADR-022.
  IF pg_catalog.jsonb_typeof(v_slides) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'slides invalidos: esperado um array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF pg_catalog.jsonb_array_length(v_slides) > 5
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(v_slides) AS e(slide)
        WHERE pg_catalog.jsonb_typeof(e.slide) IS DISTINCT FROM 'object'
           OR (SELECT pg_catalog.array_agg(k ORDER BY k)
                 FROM pg_catalog.jsonb_object_keys(e.slide) AS k)
                IS DISTINCT FROM ARRAY['body', 'title']
           OR pg_catalog.jsonb_typeof(e.slide -> 'title') IS DISTINCT FROM 'string'
           OR pg_catalog.jsonb_typeof(e.slide -> 'body')  IS DISTINCT FROM 'string'
           OR COALESCE(length(btrim(e.slide ->> 'title')), 0) NOT BETWEEN 1 AND 80
           OR COALESCE(length(btrim(e.slide ->> 'body')),  0) NOT BETWEEN 1 AND 400
     ) THEN
    RAISE EXCEPTION 'slides invalidos: ate 5 objetos {title, body}, texto nao vazio, titulo ate 80 e corpo ate 400 caracteres'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF v_message IS NOT NULL AND length(v_message) > 1000 THEN
    RAISE EXCEPTION 'mensagem fora do horario: no maximo 1000 caracteres'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.clinic_settings
     SET onboarding_slides = v_slides,
         off_hours_message = v_message,
         updated_at        = pg_catalog.clock_timestamp(),
         updated_by        = auth.uid()
   WHERE id = 1;
END;
$$;

-- --- Atendimento ------------------------------------------------------------
--
-- Troca a SEMANA INTEIRA numa transacao: a aba edita a grade toda, e trocar
-- intervalo por intervalo deixaria, entre duas chamadas, uma grade que
-- ninguem desenhou — com a mensagem automatica respondendo por ela.

CREATE FUNCTION public.set_clinic_business_hours(
  p_time_zone text,
  p_hours     jsonb
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hours jsonb := COALESCE(p_hours, '[]'::jsonb);
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador altera o horario de atendimento'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names z WHERE z.name = p_time_zone) THEN
    RAISE EXCEPTION 'fuso horario desconhecido: %', p_time_zone
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF pg_catalog.jsonb_typeof(v_hours) <> 'array' THEN
    RAISE EXCEPTION 'horario: esperado um array de {weekday, opens_at, closes_at}'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- `WHERE true` nao e enfeite: o Supabase carrega o `safeupdate` na sessao
  -- do PostgREST, e DELETE sem WHERE e recusado ali mesmo dentro de RPC.
  DELETE FROM public.clinic_business_hours WHERE true;

  -- O cast de time e de smallint falha com 22P02/22007 em entrada malformada,
  -- e o CHECK do intervalo com 23514: o painel recebe o erro do Postgres, que
  -- ja diz qual campo. Nao vale reescrever cada mensagem.
  INSERT INTO public.clinic_business_hours (weekday, opens_at, closes_at)
  SELECT (e.h ->> 'weekday')::smallint,
         (e.h ->> 'opens_at')::time,
         (e.h ->> 'closes_at')::time
    FROM pg_catalog.jsonb_array_elements(v_hours) AS e(h);

  -- Sobreposicao no mesmo dia. Nao quebraria a regra de "esta aberto", mas
  -- quase sempre e erro de digitacao, e a tela mostraria dois blocos
  -- encavalados sem dizer por que.
  IF EXISTS (
    SELECT 1
      FROM public.clinic_business_hours a
      JOIN public.clinic_business_hours b
        ON a.weekday = b.weekday AND a.id <> b.id
       AND a.opens_at < b.closes_at AND b.opens_at < a.closes_at
  ) THEN
    RAISE EXCEPTION 'horario: dois intervalos se sobrepoem no mesmo dia'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.clinic_settings
     SET time_zone  = p_time_zone,
         updated_at = pg_catalog.clock_timestamp(),
         updated_by = auth.uid()
   WHERE id = 1;
END;
$$;

-- --- Parametros operacionais ------------------------------------------------

CREATE FUNCTION public.set_operational_parameter(
  p_code      text,
  p_label     text,
  p_value     numeric,
  p_is_active boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador altera parametro operacional'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_code IS NULL OR p_code !~ '^[a-z][a-z0-9_]*$' THEN
    RAISE EXCEPTION 'codigo do parametro aceita apenas minusculas, digitos e underscore'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_label IS NULL OR length(btrim(p_label)) = 0 THEN
    RAISE EXCEPTION 'o rotulo do parametro nao pode ser vazio'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_value IS NULL OR p_value < 0 THEN
    RAISE EXCEPTION 'o valor do parametro e um numero nao negativo'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Upsert pela chave de negocio: o codigo e o contrato com a tela, e
  -- "salvar a meta" e o mesmo ato na primeira vez e nas seguintes.
  INSERT INTO public.operational_parameters (code, label, value, is_active, updated_by)
  VALUES (p_code, btrim(p_label), p_value, COALESCE(p_is_active, true), auth.uid())
  ON CONFLICT (code) DO UPDATE
     SET label      = EXCLUDED.label,
         value      = EXCLUDED.value,
         is_active  = EXCLUDED.is_active,
         updated_by = EXCLUDED.updated_by
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 6. A unica leitura sem login do projeto
-- ============================================================
--
-- Emenda nomeada a ADR-016: ate aqui nenhuma funcao de `public` era
-- executavel por `anon`, e o teste de superficie anonima dizia isso sem
-- excecao. A partir daqui diz "so esta". O recorte e fechado por lista de
-- colunas, nao por `SELECT *`: o que entrar na tabela amanha nao sai por aqui
-- sem alguem escrever o nome.

CREATE FUNCTION public.get_clinic_presentation()
RETURNS TABLE (
  onboarding_slides jsonb,
  primary_color     text,
  secondary_color   text,
  logo_path         text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.onboarding_slides, s.primary_color, s.secondary_color, s.logo_path
    FROM public.clinic_settings s
   WHERE s.id = 1;
$$;

COMMENT ON FUNCTION public.get_clinic_presentation() IS
  'UNICA funcao de public executavel por anon (ADR-027, emenda a ADR-016). Devolve so o que a tela de entrada mostra antes do login. O logo sai como caminho no bucket PUBLICO clinic-branding.';

COMMENT ON FUNCTION public.set_clinic_branding(text, text, text) IS
  'Aba Identidade Visual. Salva as duas cores e o logo de uma vez; NULL apaga. O logo precisa estar no bucket antes (sobe, depois registra).';
COMMENT ON FUNCTION public.set_clinic_messages(jsonb, text) IS
  'Aba Mensagens. Slides do carrossel (servidos sem login: nunca dado pessoal) e o texto fora do horario; NULL no texto desliga a resposta automatica.';
COMMENT ON FUNCTION public.set_clinic_business_hours(text, jsonb) IS
  'Aba Atendimento. Troca o fuso e a semana inteira numa transacao. Array vazio = sem horario, e a resposta automatica nao dispara.';
COMMENT ON FUNCTION public.set_operational_parameter(text, text, numeric, boolean) IS
  'Cria ou atualiza um numero de referencia pelo codigo. O codigo e da tela e nao se renomeia; p_is_active = false aposenta.';


-- ============================================================
-- 7. Privilegios — SEMPRE no fim
-- ============================================================

-- Escrita so por RPC, tambem para service_role: nenhuma rotina escreve
-- configuracao, e a validacao do slide publico vive na RPC.
REVOKE INSERT, UPDATE, DELETE ON public.clinic_settings        FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.clinic_business_hours  FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.operational_parameters FROM PUBLIC, anon, authenticated, service_role;
-- A tabela fecha a anon; so a funcao abre, e so o recorte dela.
REVOKE ALL ON public.clinic_settings        FROM anon;
REVOKE ALL ON public.clinic_business_hours  FROM anon;
REVOKE ALL ON public.operational_parameters FROM anon;

REVOKE EXECUTE ON FUNCTION private.clinic_closed_since(timestamptz)                         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_clinic_branding(text, text, text)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_clinic_messages(jsonb, text)                          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_clinic_business_hours(text, jsonb)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_operational_parameter(text, text, numeric, boolean)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_clinic_presentation()                                 FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.set_clinic_branding(text, text, text)                      TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_clinic_messages(jsonb, text)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_clinic_business_hours(text, jsonb)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_operational_parameter(text, text, numeric, boolean)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_clinic_presentation()                                  TO anon, authenticated;

DO $$
DECLARE
  v_escrita text[] := ARRAY[
    'public.set_clinic_branding(text, text, text)',
    'public.set_clinic_messages(jsonb, text)',
    'public.set_clinic_business_hours(text, jsonb)',
    'public.set_operational_parameter(text, text, numeric, boolean)'
  ];
  v_faltando text;
  v_aberto   text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_faltando
    FROM pg_catalog.unnest(v_escrita || 'public.get_clinic_presentation()'::text) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE');
  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em: %', v_faltando;
  END IF;

  SELECT pg_catalog.string_agg(sig, ', ') INTO v_aberto
    FROM pg_catalog.unnest(v_escrita) AS sig
   WHERE pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_aberto IS NOT NULL THEN
    RAISE EXCEPTION 'anon EXECUTA escrita de configuracao: %', v_aberto;
  END IF;

  IF NOT pg_catalog.has_function_privilege('anon', 'public.get_clinic_presentation()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon SEM EXECUTE em get_clinic_presentation: o carrossel antes do login nao teria texto';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.clinic_settings', 'SELECT') THEN
    RAISE EXCEPTION 'anon LE clinic_settings direto: o recorte da funcao nao valeria nada';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.clinic_settings', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated ESCREVE clinic_settings direto: a validacao do slide publico seria contornavel';
  END IF;
END;
$$;
