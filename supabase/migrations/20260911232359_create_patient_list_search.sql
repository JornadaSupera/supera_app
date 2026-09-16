-- A lista de pacientes com busca, filtros, ordenacao e TOTAL.
-- Design e racional: supera-docs/ADRs/ADR-021 — Funcoes de resumo do painel.md
--
-- O QUE ESTA ERRADO HOJE, medido pelo dev do painel em 10/09/2026:
-- `read_patients(p_limit, p_offset)` aceita so paginacao, tem teto de 200, NAO
-- devolve o total e retorna `SETOF public.patients` — a linha inteira, com CPF.
-- O painel entao busca e pagina NO NAVEGADOR sobre esse recorte. Duas
-- consequencias, e as duas sao ruins:
--   1. a partir do paciente 201 a lista ESCONDE GENTE SEM AVISAR — a busca
--      parece dizer "nao existe" quando o que ela diz e "nao veio nesta pagina";
--   2. o CPF de 200 pessoas viaja ate o navegador so para que a busca funcione.
-- Reduzir exposicao e metade do ganho desta funcao; a outra metade e parar de
-- mentir sobre quem existe.
--
-- FUNCAO NOVA AO LADO DA ATUAL, NAO TROCA DE ASSINATURA. `read_patients` ja
-- esta no ar e o painel a chama; mudar a assinatura quebraria a tela que
-- funciona hoje. A antiga sai por migration posterior, quando o dev tiver
-- migrado. Custo: duas funcoes com proposito parecido conviventes por um tempo,
-- documentado no guia. E barato perto de quebrar a unica tela de pacientes que
-- existe.
--
-- O CPF SAI MASCARADO (`000.***.***-91`), e esta e a decisao com mais desenho
-- por tras. Ele precisa estar na lista: e como a recepcao confirma que achou a
-- pessoa certa entre dois homonimos. Mas o CPF completo de todo mundo que casou
-- com a busca nao serve a nenhuma tela — serve a coleta. A mascara mantem os
-- tres primeiros digitos e os dois ultimos, que e o bastante para conferir um
-- numero que o operador JA TEM em maos, e insuficiente para reconstruir um que
-- ele nao tem. O CPF inteiro continua disponivel em `read_patient`, um paciente
-- por vez, com o acesso registrado naquele titular.
--
-- FILTRO DE RISCO NAO ENTRA, e e decisao fechada, nao pendencia. A clinica
-- definiu "risco" como as etiquetas da sistematizacao de enfermagem que ja
-- existem no Gemed, e esse conjunto NAO esta no escopo de leitura contratado
-- (questao #39, resolvida em 31/08/2026 pela propria fonte contratual). A lista
-- nasce sem ele, e voltar depende de aditivo comercial, nao de migration.


-- ============================================================
-- 1. Busca textual — acento e caixa nao podem separar pessoas
-- ============================================================
--
-- Nome brasileiro tem acento e quem digita na recepcao, nao. "jose" precisa
-- achar "José", e "GONCALVES" precisa achar "Gonçalves" — senao o operador
-- conclui que o paciente nao existe e CADASTRA DE NOVO, que e como nasce
-- prontuario duplicado.
--
-- `unaccent(regdictionary, text)` — a forma de DOIS argumentos — e IMMUTABLE; a
-- de um argumento e so STABLE e nao serve a indice. O dicionario vai citado com
-- schema porque a funcao roda com `search_path = ''`.

CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA extensions;  -- similaridade por trigrama
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;  -- "José" = "jose"

-- MEDIDO EM 11/09/2026: sem isto, toda busca por nome morre com "permission
-- denied for schema extensions". `normalize_search_text` e SECURITY INVOKER, e
-- dentro de `read_patient_list` quem a invoca e `clinical_reader` — que tinha
-- USAGE em `public` e `private` e nunca precisou de `extensions` ate agora.
-- USAGE no schema e exigido ALEM do EXECUTE na funcao; so o EXECUTE nao basta,
-- e e a mesma lição que create_clinical_read_audit ja tinha anotado para o
-- schema `private`.
GRANT USAGE ON SCHEMA extensions TO clinical_reader;

CREATE FUNCTION public.normalize_search_text(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT pg_catalog.lower(
           extensions.unaccent('extensions.unaccent'::regdictionary, p_text));
$$;

COMMENT ON FUNCTION public.normalize_search_text(text) IS
  'Minusculiza e tira acento. IMMUTABLE de proposito: e expressao de indice, e a forma de 1 argumento de unaccent (STABLE) nao poderia ser indexada.';

-- GIN de trigrama sobre o nome normalizado: e o que faz `ILIKE '%termo%'` usar
-- indice em vez de varrer a tabela (advanced-full-text-search). Busca por
-- pedaco do meio do nome ("silva") e o caso comum na recepcao, e prefixo nao
-- resolveria.
CREATE INDEX idx_patients_name_search ON public.patients
  USING gin (public.normalize_search_text(full_name) extensions.gin_trgm_ops);

-- Prefixo de CPF: o indice UNIQUE de `patients.cpf` usa a colacao do banco e
-- NAO serve a `LIKE '123%'`. `text_pattern_ops` serve, e e o unico jeito de a
-- busca por digitos nao virar seq scan.
CREATE INDEX idx_patients_cpf_prefix ON public.patients (cpf text_pattern_ops);


-- ============================================================
-- 2. read_patient_list — busca, filtros, ordenacao e total
-- ============================================================
--
-- O TOTAL SAI POR `count(*) OVER ()`, repetido em cada linha. A janela e
-- avaliada ANTES do LIMIT, entao o numero e o do conjunto filtrado inteiro, nao
-- o da pagina — e o que permite a tela dizer "1–20 de 340" em vez de esconder
-- gente. Limitacao declarada: pagina VAZIA nao carrega total (nao ha linha onde
-- ele caiba). Se o offset passar do fim, a tela refaz a consulta do comeco.
--
-- ORDENACAO POR LISTA BRANCA, em CASE e nao em SQL dinamico: `format('%I')`
-- sobre nome de coluna vindo do cliente e uma superficie que nao precisa
-- existir numa funcao que le prontuario. O custo e que a ordenacao nao usa
-- indice — aceito: a lista e de milhares de linhas, nao de milhoes, e a
-- alternativa e injecao de identificador num SECURITY DEFINER.
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
  total_count           bigint
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
  IF p_order_by IS NULL OR p_order_by NOT IN ('full_name', 'birth_date', 'created_at') THEN
    RAISE EXCEPTION 'p_order_by aceita full_name, birth_date ou created_at'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Termo em branco e o mesmo que termo ausente: senao a primeira tecla apagada
  -- no campo de busca devolveria a lista filtrada por string vazia.
  v_termo := nullif(btrim(COALESCE(p_search, '')), '');

  -- Os digitos do termo, para o casamento por CPF. `patients.cpf` e guardado
  -- sem mascara (CHECK `^[0-9]{11}$`), entao "123.456" precisa virar "123456"
  -- antes de comparar — do contrario a busca so acha quem digita sem pontuacao.
  v_digits := nullif(pg_catalog.regexp_replace(COALESCE(v_termo, ''), '[^0-9]', '', 'g'), '');

  RETURN QUERY
    SELECT pt.id,
           pt.full_name,
           -- A mascara: tres primeiros digitos, dois ultimos. Confere um numero
           -- que ja se tem; nao entrega um que nao se tem.
           pg_catalog.substr(pt.cpf, 1, 3) || '.***.***-' || pg_catalog.substr(pt.cpf, 10, 2),
           pt.birth_date,
           pt.is_active,
           -- Nao sai `account_id`, sai o BOOLEANO: a tela precisa saber se o
           -- paciente ja ativou o app, e nao precisa do id da conta dele.
           (pt.account_id IS NOT NULL),
           pt.treatment_phase_id,
           ph.label,
           cur.protocol_name,
           cur.current_cycle_number,
           dx.code,
           dx.label,
           -- Avaliado antes do LIMIT: e o total do conjunto FILTRADO.
           count(*) OVER ()
      FROM public.patients pt
      LEFT JOIN public.treatment_phases ph ON ph.id = pt.treatment_phase_id
      -- O plano VIGENTE, na mesma ordem que `read_treatment_plans` ja usa
      -- (created_at DESC). Nulo enquanto o Gemed estiver desligado e ninguem
      -- tiver lancado o plano a mao — e nulo e o estado correto, nao erro.
      LEFT JOIN LATERAL (
        SELECT tp.protocol_name, tp.current_cycle_number
          FROM public.treatment_plans tp
         WHERE tp.patient_id = pt.id
         ORDER BY tp.created_at DESC
         LIMIT 1
      ) cur ON true
      -- O CID principal. LEFT, sempre: paciente sem diagnostico lancado e
      -- normal no cadastro inicial, e um INNER o sumiria da lista.
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
         -- So compara CPF se houver digito no termo: sem esta guarda, buscar
         -- por "ana" viraria `cpf LIKE '%'` e casaria a base inteira.
         OR (v_digits IS NOT NULL AND pt.cpf LIKE v_digits || '%')
         -- "CODIGO" E A CHAVE DE ORIGEM DO GEMED, e ela NAO e coluna de
         -- `patients`: a ADR-004 a tirou de la e a pos em `external_refs`,
         -- porque um sistema externo pode identificar a mesma pessoa por mais
         -- de um campo e uma coluna so nao comporta isso. A busca casa
         -- QUALQUER valor do objeto `external_key`, sem saber o formato dele —
         -- e o formato ainda nao existe: quem o define e o anexo tecnico do
         -- fornecedor (questao #15), e a tabela esta vazia ate a sincronizacao
         -- ligar. Escrever a busca agora custa tres linhas; descobrir depois
         -- que a lista nao acha ninguem pelo codigo custa uma migration.
         --
         -- A politica de `external_refs` e `TO clinical_reader` e exige
         -- ADMINISTRADOR: para o profissional este ramo nunca casa, em
         -- silencio. E o desenho da ADR-004, nao um efeito colateral daqui —
         -- quem confere vinculo e a administracao.
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
       -- Desempate estavel: sem ele, dois homonimos trocam de pagina entre duas
       -- consultas e a paginacao pula ou repete linha.
       pt.id
     -- LEAST sem qualificacao: gramatica SQL, nao funcao.
     LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM private.log_clinical_read('patients', NULL, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer) IS
  'Lista de pacientes com busca (nome sem acento, CPF por prefixo, chave de origem do Gemed), filtros, ordenacao e total. Retorno estreito e CPF mascarado — o completo so por read_patient. Convive com read_patients ate o painel migrar.';


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================

-- `normalize_search_text` e expressao de INDICE e entra na politica de nenhuma
-- RLS — mas o role que INSERE em `patients` precisa de EXECUTE para a
-- manutencao do indice, e o role que CONSULTA precisa dela no predicado. Mesma
-- familia de `uuid_generate_v7` como DEFAULT de coluna: EXECUTE e exigido em
-- runtime, nao so na criacao.
REVOKE EXECUTE ON FUNCTION public.normalize_search_text(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.normalize_search_text(text)
  TO authenticated, service_role, clinical_reader;

GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
  OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

-- ARMADILHA Nº 6 (ADR-016): REVOKE **e** GRANT de dentro do SET LOCAL ROLE.
DO $$
BEGIN
  SET LOCAL ROLE clinical_reader;

  REVOKE EXECUTE ON FUNCTION
    public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
    FROM PUBLIC, anon;
  GRANT EXECUTE ON FUNCTION
    public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
    TO authenticated, service_role;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END;
$$;

-- ASSERCAO DE EFEITO, nao de execucao (ADR-016). Os dois lados, mais o dono —
-- e mais `normalize_search_text`, que e a funcao de `public` que esta migration
-- cria fora do dominio do leitor auditado e que o default privilege do Supabase
-- entregaria a `anon` sem que nada reclamasse.
DO $$
DECLARE
  v_lista text := 'public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)';
  v_norm  text := 'public.normalize_search_text(text)';
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated', v_lista, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em read_patient_list: a lista de pacientes ficaria vazia no painel.';
  END IF;

  IF NOT pg_catalog.has_function_privilege('clinical_reader', v_norm, 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader ficou SEM EXECUTE em normalize_search_text: toda busca por nome falharia por privilegio.';
  END IF;

  IF pg_catalog.has_function_privilege('anon', v_lista, 'EXECUTE')
  OR pg_catalog.has_function_privilege('anon', v_norm,  'EXECUTE') THEN
    RAISE EXCEPTION 'anon AINDA EXECUTA a lista de pacientes ou o normalizador: cadastro alcancavel sem login.';
  END IF;

  IF (SELECT r.rolname
        FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
       WHERE p.oid = v_lista::regprocedure) <> 'clinical_reader' THEN
    RAISE EXCEPTION 'read_patient_list com dono errado: a RLS nao valeria dentro dela, e a lista devolveria a base inteira.';
  END IF;
END;
$$;
