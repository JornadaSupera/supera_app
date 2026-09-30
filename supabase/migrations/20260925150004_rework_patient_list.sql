-- A lista de pacientes ganha a data de cadastro e tres chaves de ordenacao, e a
-- lista antiga sai.
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md
-- Itens 6.1 e 6.3 da lista consolidada de pendencias (painel P-1 e P-3).
--
-- 6.1 — `created_at` NO FIM DA PROJECAO. O painel pediu assim, e a posicao
-- importa: quem le a linha por nome de coluna nao percebe a mudanca, e quem a
-- le por posicao continua achando as treze colunas de antes onde estavam.
--
-- `read_patients` SAI. Ela era a lista antiga, com teto de 200, sem busca e sem
-- total, e so continuava no ar porque o painel a chamava. A promessa registrada
-- em create_patient_list_search era tira-la quando o painel migrasse, e o que
-- impedia a migracao era a falta desta coluna. Com ela, nao sobra motivo, e a
-- funcao que esconde gente a partir do paciente 201 deixa de existir.
-- CONSEQUENCIA DE CONTRATO: se o painel ainda a chamar no dia do db push, a
-- tela quebra com "function not found" (PGRST202). O guia (§5.14) avisa.
--
-- 6.3 — ORDENAR POR DIAGNOSTICO, FASE E SITUACAO. Entram na mesma lista branca
-- de sempre (CASE, nunca SQL dinamico):
--   primary_cid10_code  o codigo do CID principal, o mesmo que a coluna mostra
--   treatment_phase     a ORDEM da fase no vocabulario (sort_order), nao o
--                       rotulo: "Ativo" antes de "Seguimento" e a ordem da
--                       jornada, e a alfabetica so coincidiria por acaso
--   is_active           situacao da ficha
-- Nulo vai sempre para o fim, nos dois sentidos: paciente sem diagnostico
-- lancado nao e "o primeiro da lista", e o estado de quase toda ficha nova.
--
-- A LISTA PEDIA INDICES PARA ESSAS CHAVES, E NAO ENTRA NENHUM. Nenhum indice de
-- `patients` alimenta esta ordenacao, e isso nao e escolha: a chave sai de um
-- CASE (a lista branca) e, no caso do CID, de uma juncao LATERAL. O planejador
-- ordena o resultado filtrado em memoria, com ou sem indice. A decisao de
-- trocar indice por lista branca ja estava escrita em create_patient_list_search
-- ("a alternativa e injecao de identificador num SECURITY DEFINER"), e vale
-- igual para as chaves novas. O que o indice serviria (a juncao por paciente)
-- ja tem indice: idx_patient_diagnoses_patient_id e idx_patients_treatment_phase.


-- ============================================================
-- 1. As duas funcoes sao de clinical_reader: troca-se de dentro do papel
-- ============================================================
--
-- `postgres` nao derruba nem recria funcao alheia ("must be owner"), e sob
-- `db push` a cadeia de SET ROLE nao lhe da o direito de administrar objeto de
-- clinical_reader (armadilha nº 6 da ADR-016). O caminho e o de
-- mask_patient_identifiers: emprestimo de CREATE, SET LOCAL ROLE, devolucao. A
-- funcao criada de dentro do papel ja nasce dele, e o dono e o que sustenta a
-- RLS dentro dela.
--
-- DROP e nao CREATE OR REPLACE: o tipo de retorno muda (coluna nova), e o
-- Postgres recusa trocar o retorno de funcao existente.

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

DROP FUNCTION public.read_patients(integer, integer);

DROP FUNCTION public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer);

CREATE FUNCTION public.read_patient_list(
  p_search             text    DEFAULT NULL,
  p_protocol           text    DEFAULT NULL,
  p_cid10_code         text    DEFAULT NULL,
  p_treatment_phase_id uuid    DEFAULT NULL,
  p_is_active          boolean DEFAULT true,
  p_order_by           text    DEFAULT 'full_name',
  p_order_desc         boolean DEFAULT false,
  p_limit              integer DEFAULT 50,
  p_offset             integer DEFAULT 0
)
RETURNS TABLE (
  patient_id            uuid,
  full_name             text,
  cpf_masked            text,
  birth_date            date,
  is_active             boolean,
  has_account           boolean,
  treatment_phase_id    uuid,
  treatment_phase_label text,
  protocol_name         text,
  current_cycle_number  smallint,
  primary_cid10_code    text,
  primary_cid10_label   text,
  total_count           bigint,
  -- 6.1: no fim, como pedido.
  created_at            timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count  integer;
  v_termo  text;
  v_digits text;
BEGIN
  IF p_order_by IS NULL OR p_order_by NOT IN (
       'full_name', 'birth_date', 'created_at',
       'primary_cid10_code', 'treatment_phase', 'is_active') THEN
    RAISE EXCEPTION 'p_order_by aceita full_name, birth_date, created_at, primary_cid10_code, treatment_phase ou is_active'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_termo  := nullif(btrim(COALESCE(p_search, '')), '');
  v_digits := nullif(pg_catalog.regexp_replace(COALESCE(v_termo, ''), '[^0-9]', '', 'g'), '');

  RETURN QUERY
    SELECT pt.id,
           pt.full_name,
           pg_catalog.substr(pt.cpf, 1, 3) || '.***.***-' || pg_catalog.substr(pt.cpf, 10, 2),
           pt.birth_date,
           pt.is_active,
           (pt.account_id IS NOT NULL),
           pt.treatment_phase_id,
           ph.label,
           cur.protocol_name,
           cur.current_cycle_number,
           dx.code,
           dx.label,
           count(*) OVER (),
           pt.created_at
      FROM public.patients pt
      LEFT JOIN public.treatment_phases ph ON ph.id = pt.treatment_phase_id
      LEFT JOIN LATERAL (
        SELECT tp.protocol_name, tp.current_cycle_number
          FROM public.treatment_plans tp
         WHERE tp.patient_id = pt.id
         ORDER BY tp.created_at DESC
         LIMIT 1
      ) cur ON true
      LEFT JOIN LATERAL (
        SELECT c.code, c.label
          FROM public.patient_diagnoses d
          JOIN public.cid10 c ON c.id = d.cid10_id
         WHERE d.patient_id = pt.id
         ORDER BY d.is_primary DESC, d.created_at
         LIMIT 1
      ) dx ON true
     WHERE (p_is_active IS NULL OR pt.is_active = p_is_active)
       AND (p_treatment_phase_id IS NULL OR pt.treatment_phase_id = p_treatment_phase_id)
       AND (p_protocol IS NULL OR cur.protocol_name = p_protocol)
       AND (p_cid10_code IS NULL OR EXISTS (
              SELECT 1
                FROM public.patient_diagnoses d2
                JOIN public.cid10 c2 ON c2.id = d2.cid10_id
               WHERE d2.patient_id = pt.id
                 AND c2.code = p_cid10_code))
       AND (
         v_termo IS NULL
         OR public.normalize_search_text(pt.full_name)
              ILIKE '%' || public.normalize_search_text(v_termo) || '%'
         OR (v_digits IS NOT NULL AND pt.cpf LIKE v_digits || '%')
         -- A chave de origem do Gemed mora em external_refs (ADR-004); o
         -- racional inteiro esta em create_patient_list_search.
         OR EXISTS (
              SELECT 1
                FROM public.external_refs er
               WHERE er.entity_type = 'patient'
                 AND er.local_id = pt.id
                 AND EXISTS (SELECT 1
                               FROM pg_catalog.jsonb_each_text(er.external_key) kv
                              WHERE kv.value = v_termo))
       )
     ORDER BY
       (CASE WHEN p_order_by = 'full_name'  AND NOT p_order_desc
             THEN public.normalize_search_text(pt.full_name) END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'full_name'  AND     p_order_desc
             THEN public.normalize_search_text(pt.full_name) END) DESC NULLS LAST,
       (CASE WHEN p_order_by = 'birth_date' AND NOT p_order_desc
             THEN pt.birth_date END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'birth_date' AND     p_order_desc
             THEN pt.birth_date END) DESC NULLS LAST,
       (CASE WHEN p_order_by = 'created_at' AND NOT p_order_desc
             THEN pt.created_at END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'created_at' AND     p_order_desc
             THEN pt.created_at END) DESC NULLS LAST,
       -- 6.3 — as tres chaves novas.
       (CASE WHEN p_order_by = 'primary_cid10_code' AND NOT p_order_desc
             THEN dx.code END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'primary_cid10_code' AND     p_order_desc
             THEN dx.code END) DESC NULLS LAST,
       (CASE WHEN p_order_by = 'treatment_phase' AND NOT p_order_desc
             THEN ph.sort_order END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'treatment_phase' AND     p_order_desc
             THEN ph.sort_order END) DESC NULLS LAST,
       (CASE WHEN p_order_by = 'is_active' AND NOT p_order_desc
             THEN pt.is_active END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'is_active' AND     p_order_desc
             THEN pt.is_active END) DESC NULLS LAST,
       -- Dentro do mesmo CID, da mesma fase ou da mesma situacao, a ordem e a
       -- do nome: sem isto o empate cairia direto no id, e a tela mostraria
       -- os pacientes de uma fase numa ordem que parece aleatoria.
       public.normalize_search_text(pt.full_name),
       -- Desempate estavel: sem ele a paginacao pula ou repete linha.
       pt.id
     LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM private.log_clinical_read('patients', NULL, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer) IS
  'Lista de pacientes com busca, filtros, ordenacao (nome, nascimento, cadastro, CID principal, fase, situacao), total e data de cadastro no fim. CPF mascarado; o completo so por reveal_patient_identifiers. Substitui read_patients, removida em 25/09/2026.';

-- Objeto de clinical_reader: quem revoga e concede e ele (armadilha nº 4). A
-- funcao nova nasce com EXECUTE para PUBLIC, e anon herdaria.
REVOKE EXECUTE ON FUNCTION
  public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
  TO authenticated, service_role;

RESET ROLE;
-- Explicito: no `db push` o RESET pode voltar ao papel de login da CLI, e nao
-- a postgres (ver mask_patient_identifiers §5).
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 2. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_lista text := 'public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)';
BEGIN
  IF pg_catalog.to_regprocedure('public.read_patients(integer, integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'read_patients continua existindo: a lista que esconde gente depois do paciente 200 nao saiu.';
  END IF;

  IF (SELECT r.rolname
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
       WHERE p.oid = v_lista::regprocedure) <> 'clinical_reader' THEN
    RAISE EXCEPTION 'read_patient_list com dono errado: a RLS nao valeria dentro dela, e a lista devolveria a base inteira.';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', v_lista, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em read_patient_list: a lista de pacientes ficaria vazia no painel.';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_lista, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa read_patient_list: cadastro alcancavel sem login.';
  END IF;

  IF pg_catalog.has_schema_privilege('clinical_reader', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'clinical_reader ficou com CREATE em public depois do emprestimo.';
  END IF;
END;
$$;
