-- Tres resumos novos para o painel: protocolos, leituras de orientacao e o
-- resumo de sintomas com denominador.
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md
-- Itens 6.2, 6.5, 6.6, 6.7 e 6.8 da lista consolidada (painel P-2, C-1, R-3,
-- E-1, E-5, E-2).
--
-- A REGRA DO PREFIXO CONTINUA A MESMA (ADR-021): `summarize_*` so devolve
-- numero e rotulo, nunca identificador de paciente. As tres funcoes sao
-- SECURITY DEFINER com dono `clinical_reader`, entao a RLS vale dentro delas com
-- o auth.uid() de quem chamou: o agregado se forma sobre as linhas que o
-- chamador ja podia ler uma a uma, nunca sobre mais.
--
-- 6.7 — "ESPECIALIDADE DE ORIGEM" NAO ENTRA NO RESUMO DE SINTOMAS, e e decisao,
-- nao esquecimento. O diario e a excecao declarada ao contrato transversal da
-- ADR-003 (ADR-007 §4): quem escreve e o paciente, e o registro nao tem
-- `origin_specialty_id`. Nao existe especialidade de origem de um sintoma para
-- filtrar. Deduzir uma (pela especialidade do profissional que atende o
-- paciente, pelo `is_psychological` do sintoma) seria inventar um dado e, no
-- segundo caso, reabrir a leitura que a ADR-007 fechou: ansiedade e tristeza
-- nao sao conteudo do espaco de psicologia. O CID entra.
--
-- 6.8 — "APENAS PACIENTES ATIVOS" ENTRA como `p_active_only`, e "ativo" quer
-- dizer FICHA ATIVA HOJE (`patients.is_active`), a mesma situacao que a lista de
-- pacientes filtra. Nao e a fase clinica "ativo": essa e outra pergunta, e a
-- clinica ja disse que so paciente em tratamento ativo usa o app, entao quase
-- todo registro de diario ja vem de quem estava nela. Consequencia declarada:
-- o recorte e pela situacao de HOJE, nao pela da data do evento — um paciente
-- desativado ontem some do historico inteiro quando o filtro esta ligado. E o
-- que "so ativos" significa na tela, e o padrao continua sendo todos.


-- ============================================================
-- 1. As leituras de orientacao chegam ao leitor auditado (6.5)
-- ============================================================
--
-- `patient_content_states` nasceu SEM politica para equipe e administracao, e a
-- create_content_library escreveu o que fazer no dia em que uma tela pedisse:
-- "politica aditiva SOB auditoria". E isto. A politica e `TO clinical_reader`,
-- o papel que so existe dentro das funcoes auditadas: `.from()` continua
-- devolvendo zero linhas para a equipe, e a unica funcao que le a tabela hoje
-- devolve CONTAGEM. "Quem leu a orientacao" continua sem caminho: exigiria uma
-- `read_*` nova, que e migration e revisao, nao uma consulta do cliente.
--
-- O GRANT sozinho nao faria nada, e a politica sozinha tambem nao: privilegio
-- concedido a papel sob RLS nao vale sem politica que o nomeie
-- (fix_reader_catalog_policies), e politica sem privilegio morre em
-- "permission denied". Os dois entram juntos.

GRANT SELECT ON public.patient_content_states TO clinical_reader;

CREATE POLICY patient_content_states_select_staff ON public.patient_content_states
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) OR (SELECT private.is_active_professional()) );

-- A agregacao por orientacao: a FK nao tinha indice (a PK comeca por paciente),
-- e esta e a primeira consulta que atravessa a tabela por conteudo. NAO e
-- parcial, embora so leitura conte: o mesmo indice cobre a FK para
-- content_items, e um parcial em `read_at IS NOT NULL` deixaria de fora as
-- linhas so favoritadas (ver index_foreign_keys).
CREATE INDEX idx_patient_content_states_content_item
  ON public.patient_content_states (content_item_id, read_at);


-- ============================================================
-- 2. As funcoes — criadas de dentro do papel dono
-- ============================================================
--
-- Mesmo caminho de rework_patient_list: emprestimo de CREATE, SET LOCAL ROLE,
-- devolucao. A funcao nasce de clinical_reader, e o resumo antigo de sintomas,
-- que e dele, so ele derruba.

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

-- ------------------------------------------------------------
-- 2.1 summarize_treatment_protocols (6.2)
-- ------------------------------------------------------------
--
-- O filtro por protocolo da lista (P-2) precisava de uma lista de opcoes, e o
-- unico jeito de montar uma hoje seria ler plano por plano, paciente por
-- paciente. Sai o NOME e a CONTAGEM, nunca quem esta nele.
--
-- DUAS CONTAGENS, porque o filtro e o relatorio perguntam coisas diferentes:
-- `current_patient_count` e quantos pacientes tem esse protocolo como plano
-- VIGENTE (e o que o filtro da lista casa, porque ela filtra pelo plano
-- corrente); `plan_count` e quantas vezes o protocolo ja foi registrado, contando
-- os encerrados. Um protocolo que so aparece no historico tem vigente zero, e a
-- tela decide se o mostra.
--
-- O nome sai como foi gravado. `protocol_name` e texto livre (vem do Gemed ou
-- do cadastro manual), entao "FOLFOX" e "Folfox" sao duas linhas aqui, como sao
-- dois valores para o filtro da lista, que compara por igualdade. Juntar as duas
-- aqui faria o filtro oferecer uma opcao que nao casa ninguem.
CREATE FUNCTION public.summarize_treatment_protocols()
RETURNS TABLE (
  protocol_name         text,
  plan_count            bigint,
  current_patient_count bigint
)
LANGUAGE plpgsql
VOLATILE                        -- escreve na trilha
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    record;
  v_events bigint := 0;
BEGIN
  FOR v_row IN
    SELECT tp.protocol_name                                               AS bucket_protocol,
           count(*)                                                       AS n_plans,
           count(DISTINCT tp.patient_id) FILTER (WHERE tp.ended_on IS NULL) AS n_current
      FROM public.treatment_plans tp
     GROUP BY tp.protocol_name
     ORDER BY tp.protocol_name
  LOOP
    v_events              := v_events + v_row.n_plans;
    protocol_name         := v_row.bucket_protocol;
    plan_count            := v_row.n_plans;
    current_patient_count := v_row.n_current;
    RETURN NEXT;
  END LOOP;

  -- row_count conta os PLANOS agregados, nao as linhas devolvidas (ADR-021).
  PERFORM private.log_clinical_read('treatment_plans', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_treatment_protocols() IS
  'Nomes de protocolo distintos, com quantos planos ja o registraram e quantos pacientes o tem como plano vigente. Nenhum identificador de paciente. Serve o filtro por protocolo da lista (read_patient_list.p_protocol).';

-- ------------------------------------------------------------
-- 2.2 summarize_content_reads (6.5)
-- ------------------------------------------------------------
--
-- UM NUMERO POR ORIENTACAO, nunca a lista de quem leu. Destrava a coluna de
-- leituras da tela de conteudo (C-1) e o relatorio de conteudo mais acessado
-- (R-3).
--
-- "Leitura" e o que o app marca: `read_at` preenchido. Conta PACIENTES, nao
-- aberturas — a tabela guarda um par paciente x orientacao, e reabrir nao cria
-- linha. A janela e opcional e se aplica a `read_at`: o painel pode perguntar
-- "quantos leram em setembro" sem que a funcao vire outra.
--
-- Sai o id da orientacao e nao o titulo: o titulo mora em content_versions, que
-- a equipe ja le direto (content_versions_select_staff), e trazer o rotulo
-- para ca exigiria abrir o catalogo editorial ao leitor auditado so para
-- repetir o que a tela ja tem.
--
-- Orientacao sem nenhuma leitura NAO aparece. A tela cruza com a lista de
-- orientacoes que ja carregou e mostra zero onde nao houver linha.
CREATE FUNCTION public.summarize_content_reads(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  content_item_id uuid,
  read_count      bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row    record;
  v_events bigint := 0;
  v_tz     text;
BEGIN
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_to < p_from THEN
    RAISE EXCEPTION 'janela invalida: p_to nao pode ser anterior a p_from'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- A janela e em DATA, no fuso da clinica: "setembro" e o setembro de
  -- Chapeco, nao o de UTC, e a leitura das 22h do dia 30 e de setembro.
  SELECT cs.time_zone INTO v_tz FROM public.clinic_settings cs WHERE cs.id = 1;
  -- Sem fuso, `AT TIME ZONE NULL` daria NULL e o filtro descartaria toda
  -- leitura em silencio: um zero com cara de resposta. Melhor falhar alto.
  IF v_tz IS NULL THEN
    RAISE EXCEPTION 'fuso da clinica ilegivel dentro do resumo de leituras';
  END IF;

  FOR v_row IN
    SELECT s.content_item_id AS bucket_item,
           count(*)          AS n_reads
      FROM public.patient_content_states s
     WHERE s.read_at IS NOT NULL
       AND (p_from IS NULL OR (s.read_at AT TIME ZONE v_tz)::date >= p_from)
       AND (p_to   IS NULL OR (s.read_at AT TIME ZONE v_tz)::date <= p_to)
     GROUP BY s.content_item_id
     ORDER BY count(*) DESC, s.content_item_id
  LOOP
    v_events        := v_events + v_row.n_reads;
    content_item_id := v_row.bucket_item;
    read_count      := v_row.n_reads;
    RETURN NEXT;
  END LOOP;

  PERFORM private.log_clinical_read('patient_content_states', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_content_reads(date, date) IS
  'Quantos pacientes marcaram cada orientacao como lida, opcionalmente numa janela de read_at (datas no fuso da clinica). So o numero: quem leu nao sai por funcao nenhuma. Orientacao sem leitura nao tem linha.';

-- ------------------------------------------------------------
-- 2.3 summarize_symptoms_by_protocol — o denominador (6.6), CID (6.7) e ativos (6.8)
-- ------------------------------------------------------------
--
-- DROP e nao CREATE OR REPLACE: o retorno ganha duas colunas e a assinatura
-- ganha dois parametros. Os parametros novos vem no FIM e com default, entao a
-- chamada antiga (so janela, protocolo e sintoma, por nome ou por posicao)
-- continua valendo; as colunas novas tambem vem no fim.
DROP FUNCTION public.summarize_symptoms_by_protocol(date, date, text, uuid);

-- AS DUAS COLUNAS NOVAS:
--
--   protocol_patient_count — o DENOMINADOR. Pacientes com plano DESTE protocolo
--     cuja vigencia toca a janela, sob os mesmos filtros de CID e de ficha ativa.
--     E o que transforma "12 pacientes relataram nausea" em "12 de 40". Vai na
--     linha, repetido, porque a tela calcula a prevalencia linha a linha. No
--     balde de protocolo NULO ele e NULO: "pacientes sem plano" nao e um
--     conjunto que a janela delimite (todo paciente sem plano registrado cairia
--     nele, inclusive quem nunca abriu o app), e um denominador inventado ali
--     produziria uma prevalencia com cara de medida.
--
--   patients_at_or_above — pacientes distintos, no mesmo protocolo e sintoma,
--     cujo PIOR grau na janela e maior ou igual ao grau do balde. E a pergunta
--     clinica ("quantos chegaram a grau 3 ou mais"), que `patient_count` nao
--     responde: ele conta quem relatou EXATAMENTE aquele grau, e somar os
--     baldes contaria duas vezes quem oscilou entre 3 e 4.
--
-- ATRIBUICAO TEMPORAL (ADR-006 P1) vale para as duas: o evento pertence ao
-- protocolo da data do evento, e o denominador conta a vigencia do plano, nao o
-- plano de hoje.
CREATE FUNCTION public.summarize_symptoms_by_protocol(
  p_from        date,
  p_to          date,
  p_protocol    text    DEFAULT NULL,
  p_symptom_id  uuid    DEFAULT NULL,
  p_cid10_code  text    DEFAULT NULL,
  p_active_only boolean DEFAULT false
)
RETURNS TABLE (
  protocol_name          text,
  symptom_id             uuid,
  symptom_label          text,
  grade                  smallint,
  report_count           bigint,
  patient_count          bigint,
  protocol_patient_count bigint,
  patients_at_or_above   bigint
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

  FOR v_row IN
    WITH elegiveis AS (
      -- O recorte de PACIENTES, aplicado ANTES da agregacao (E-5): CID e ficha
      -- ativa. Serve o numerador e o denominador, que precisam falar do mesmo
      -- conjunto de gente — senao a prevalencia divide coisas diferentes.
      SELECT pt.id
        FROM public.patients pt
       WHERE (NOT COALESCE(p_active_only, false) OR pt.is_active)
         AND (p_cid10_code IS NULL OR EXISTS (
                SELECT 1
                  FROM public.patient_diagnoses d
                  JOIN public.cid10 c ON c.id = d.cid10_id
                 WHERE d.patient_id = pt.id
                   AND c.code = p_cid10_code))
    ),
    eventos AS (
      SELECT tpl.protocol_name AS proto,
             r.symptom_id      AS sym,
             r.grade           AS grd,
             e.patient_id      AS pid
        FROM public.diary_symptom_reports r
        JOIN public.diary_entries e ON e.id = r.diary_entry_id
        JOIN elegiveis el ON el.id = e.patient_id
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
    ),
    baldes AS (
      SELECT ev.proto, ev.sym, ev.grd,
             count(*)               AS n_reports,
             count(DISTINCT ev.pid) AS n_patients
        FROM eventos ev
       GROUP BY ev.proto, ev.sym, ev.grd
    ),
    -- O pior grau de cada paciente, por protocolo e sintoma. E sobre ele que
    -- "grau >= g" conta cada pessoa uma vez so.
    pior AS (
      SELECT ev.proto, ev.sym, ev.pid, max(ev.grd) AS max_grd
        FROM eventos ev
       GROUP BY ev.proto, ev.sym, ev.pid
    ),
    -- O denominador: pacientes elegiveis com plano do protocolo vigente em
    -- algum ponto da janela. Plano sem started_on nao delimita vigencia e fica
    -- fora, pela mesma disciplina do numerador.
    denominador AS (
      SELECT tp.protocol_name AS proto,
             count(DISTINCT tp.patient_id) AS n_patients
        FROM public.treatment_plans tp
        JOIN elegiveis el ON el.id = tp.patient_id
       WHERE tp.started_on IS NOT NULL
         AND tp.started_on <= p_to
         AND (tp.ended_on IS NULL OR tp.ended_on >= p_from)
       GROUP BY tp.protocol_name
    )
    SELECT b.proto      AS bucket_protocol,
           b.sym        AS bucket_symptom,
           s.label      AS bucket_symptom_label,
           b.grd        AS bucket_grade,
           b.n_reports,
           b.n_patients,
           -- NULO no balde sem protocolo, de proposito (ver acima). Com
           -- protocolo, o COALESCE so cobre o caso impossivel de o evento ter
           -- protocolo e o denominador nao: seria defeito, e zero o denunciaria.
           CASE WHEN b.proto IS NULL THEN NULL
                ELSE COALESCE(dn.n_patients, 0) END AS n_denominator,
           (SELECT count(*)
              FROM pior p
             WHERE p.proto IS NOT DISTINCT FROM b.proto
               AND p.sym = b.sym
               AND p.max_grd >= b.grd)             AS n_at_or_above
      FROM baldes b
      -- LEFT: sintoma aposentado continua tendo rotulo, e o historico nao
      -- encolhe porque a clinica tirou um item do seletor.
      LEFT JOIN public.symptoms s ON s.id = b.sym
      LEFT JOIN denominador dn ON dn.proto = b.proto
     ORDER BY b.proto NULLS LAST, s.label, b.grd
  LOOP
    v_events               := v_events + v_row.n_reports;
    protocol_name          := v_row.bucket_protocol;
    symptom_id             := v_row.bucket_symptom;
    symptom_label          := v_row.bucket_symptom_label;
    grade                  := v_row.bucket_grade;
    report_count           := v_row.n_reports;
    patient_count          := v_row.n_patients;
    protocol_patient_count := v_row.n_denominator;
    patients_at_or_above   := v_row.n_at_or_above;
    RETURN NEXT;
  END LOOP;

  PERFORM private.log_clinical_read('diary_symptom_reports', NULL, v_events::integer);
END;
$$;

COMMENT ON FUNCTION public.summarize_symptoms_by_protocol(date, date, text, uuid, text, boolean) IS
  'Protocolo x sintoma x grau x quantidade, atribuido ao protocolo da DATA DO EVENTO (ADR-006 P1), com o denominador do protocolo na janela e os pacientes com pior grau >= o do balde. Filtra por CID e por ficha ativa antes de agregar. Nao filtra por especialidade: o diario nao tem especialidade de origem (ADR-007 §4). So devolve numeros.';

-- Objetos de clinical_reader: quem revoga e concede e ele (armadilha nº 4).
REVOKE EXECUTE ON FUNCTION public.summarize_treatment_protocols()                                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.summarize_content_reads(date, date)                                   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.summarize_symptoms_by_protocol(date, date, text, uuid, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.summarize_treatment_protocols()                                       TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.summarize_content_reads(date, date)                                   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.summarize_symptoms_by_protocol(date, date, text, uuid, text, boolean) TO authenticated, service_role;

RESET ROLE;
-- Explicito: no `db push` o RESET pode voltar ao papel de login da CLI, e nao
-- a postgres (ver mask_patient_identifiers §5).
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

-- summarize_content_reads le o fuso em clinic_settings, que nao era do leitor
-- auditado. A tabela e de linha unica, sem dado de paciente, e a politica dela
-- e `TO authenticated`: o GRANT vem com uma politica que nomeia o papel, pela
-- mesma regra de fix_reader_catalog_policies — senao o fuso vem NULO e a
-- funcao recusa (antes da guarda, o filtro descartaria tudo em silencio).
GRANT SELECT ON public.clinic_settings TO clinical_reader;

CREATE POLICY clinic_settings_select_reader ON public.clinic_settings
  FOR SELECT TO clinical_reader
  USING ( true );


-- ============================================================
-- 3. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_fn   text;
  v_dono text;
BEGIN
  IF pg_catalog.to_regprocedure('public.summarize_symptoms_by_protocol(date, date, text, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'a assinatura antiga do resumo de sintomas continua existindo ao lado da nova';
  END IF;

  FOREACH v_fn IN ARRAY ARRAY[
    'public.summarize_treatment_protocols()',
    'public.summarize_content_reads(date, date)',
    'public.summarize_symptoms_by_protocol(date, date, text, uuid, text, boolean)'
  ] LOOP
    SELECT r.rolname INTO v_dono
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
     WHERE p.oid = v_fn::regprocedure;
    -- Dono de tabela nao sofre RLS: com dono postgres o resumo somaria a base
    -- inteira para qualquer chamador, e o de leituras entregaria o comportamento
    -- de todo paciente a quem nao tem politica nenhuma.
    IF v_dono <> 'clinical_reader' THEN
      RAISE EXCEPTION '% saiu da migration com dono %', v_fn, v_dono;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em %', v_fn;
    END IF;
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_table_privilege('clinical_reader', 'public.patient_content_states', 'SELECT')
  OR NOT pg_catalog.has_table_privilege('clinical_reader', 'public.clinic_settings', 'SELECT') THEN
    RAISE EXCEPTION 'clinical_reader sem SELECT em patient_content_states ou clinic_settings: os resumos morreriam por privilegio';
  END IF;

  -- A abertura e SO para o papel auditado: se a equipe ganhasse SELECT direto,
  -- ninguem precisaria da funcao para listar quem leu.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_policies
              WHERE schemaname = 'public' AND tablename = 'patient_content_states'
                AND policyname <> 'patient_content_states_all_own'
                AND 'authenticated' = ANY (roles)) THEN
    RAISE EXCEPTION 'patient_content_states ganhou politica TO authenticated alem da do titular';
  END IF;

  IF pg_catalog.has_schema_privilege('clinical_reader', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'clinical_reader ficou com CREATE em public depois do emprestimo.';
  END IF;
END;
$$;
