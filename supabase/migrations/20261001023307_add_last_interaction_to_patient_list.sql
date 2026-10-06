-- A lista de pacientes ganha a ULTIMA INTERACAO: a ultima mensagem que o
-- paciente ou o acompanhante mandou no chat.
-- Plano das pendencias do painel de 30/09/2026, Fase I, item I.4 (painel #18,
-- decisao D8).
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md (emenda de 30/09/2026)
--
-- O PAINEL PEDIU "ULTIMO ACESSO", E O QUE ENTRA E OUTRA COISA, POR DECISAO.
-- A questao #3 (31/08/2026) ja tinha definido "ultima interacao" a partir do
-- chat, e a D8 (30/09/2026) a manteve: o painel renomeia a coluna. Ultimo
-- acesso ao app de verdade exigiria o app registrar a abertura, e so entra se
-- a clinica pedir. `auth.users.last_sign_in_at` NAO serve: com biometria e
-- sessao guardada, ele mostra o ultimo LOGIN, que pode ter meses, e nao o
-- ultimo uso — um numero com cara de resposta certa.
--
-- SO MENSAGEM DO PACIENTE OU DO ACOMPANHANTE (`author_kind IN ('patient',
-- 'caregiver')`). `conversations.last_message_at` nao serve: ele sobe tambem
-- com a resposta da equipe e com a mensagem automatica (fora do horario,
-- transicao do encaminhamento), e a lista diria que o paciente "interagiu"
-- quando quem escreveu foi a clinica.
--
-- O SIGILO VALE NA COLUNA. A funcao e de `clinical_reader`, e a RLS de
-- `messages` passa pela de `conversations`: a mensagem numa conversa restrita
-- da Psicologia so entra na data de quem enxerga a conversa. Para o resto da
-- equipe e para o administrador, a ultima interacao e a ultima mensagem que
-- eles podem ver. Sem isso, "o paciente escreveu ontem" e "nao ha conversa
-- visivel de ontem" juntos revelariam a conversa sigilosa.
--
-- A COLUNA VEM NO FIM, depois de `created_at`, pelo mesmo motivo da 6.1: quem
-- le a linha por posicao continua achando as colunas de antes onde estavam. E
-- a lista branca de ordenacao ganha `last_interaction_at`. Nulo (paciente que
-- nunca escreveu) vai para o fim nos dois sentidos, como as demais chaves.
--
-- O CUSTO. A coluna e uma juncao LATERAL por paciente da pagina — e, quando a
-- ordenacao e por ela, por paciente do conjunto filtrado, antes do LIMIT. O
-- indice parcial abaixo responde "a ultima mensagem do paciente nesta
-- conversa" sem tocar nas mensagens da equipe e do sistema. Medido com
-- EXPLAIN na lista de 50 (ver o registro no vault, Fase I).


-- ============================================================
-- 1. O indice
-- ============================================================
--
-- (conversation_id, created_at DESC) com o filtro do autor: o LIMIT 1 por
-- conversa le uma entrada so. idx_messages_conversation serve tambem, mas
-- teria de pular as mensagens da equipe ate achar a do paciente.
CREATE INDEX idx_messages_last_patient_interaction
  ON public.messages (conversation_id, created_at DESC)
  WHERE author_kind IN ('patient', 'caregiver');


-- ============================================================
-- 2. A funcao e de clinical_reader: troca-se de dentro do papel
-- ============================================================
--
-- DROP e nao CREATE OR REPLACE: o tipo de retorno muda (coluna nova). A
-- assinatura de ENTRADA e a mesma, entao toda chamada existente continua
-- valendo.

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

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
  created_at            timestamptz,
  -- I.4: no fim, depois de created_at.
  last_interaction_at   timestamptz
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
       'primary_cid10_code', 'treatment_phase', 'is_active',
       'last_interaction_at') THEN
    RAISE EXCEPTION 'p_order_by aceita full_name, birth_date, created_at, primary_cid10_code, treatment_phase, is_active ou last_interaction_at'
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
           pt.created_at,
           li.last_at
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
      -- I.4: a ultima mensagem do paciente ou do acompanhante, entre as
      -- conversas que quem consulta enxerga (a RLS de conversations e de
      -- messages vale aqui dentro). Uma entrada do indice parcial por conversa.
      LEFT JOIN LATERAL (
        SELECT pg_catalog.max(lm.created_at) AS last_at
          FROM public.conversations cv
         CROSS JOIN LATERAL (
           SELECT m.created_at
             FROM public.messages m
            WHERE m.conversation_id = cv.id
              AND m.author_kind IN ('patient', 'caregiver')
            ORDER BY m.created_at DESC
            LIMIT 1
         ) lm
         WHERE cv.patient_id = pt.id
      ) li ON true
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
       -- I.4: quem nunca escreveu vai para o fim nos dois sentidos.
       (CASE WHEN p_order_by = 'last_interaction_at' AND NOT p_order_desc
             THEN li.last_at END) ASC  NULLS LAST,
       (CASE WHEN p_order_by = 'last_interaction_at' AND     p_order_desc
             THEN li.last_at END) DESC NULLS LAST,
       -- Dentro do mesmo CID, da mesma fase ou da mesma situacao, a ordem e a
       -- do nome.
       public.normalize_search_text(pt.full_name),
       -- Desempate estavel: sem ele a paginacao pula ou repete linha.
       pt.id
     LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  PERFORM private.log_clinical_read('patients', NULL, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer) IS
  'Lista de pacientes com busca, filtros, ordenacao (nome, nascimento, cadastro, CID principal, fase, situacao, ultima interacao), total, data de cadastro e, desde 30/09/2026, last_interaction_at no fim: a ultima mensagem do paciente ou do acompanhante entre as conversas que quem consulta enxerga. Nao e "ultimo acesso ao app". CPF mascarado; o completo so por reveal_patient_identifiers.';

-- Objeto de clinical_reader: quem revoga e concede e ele (armadilha nº 4).
REVOKE EXECUTE ON FUNCTION
  public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)
  TO authenticated, service_role;

RESET ROLE;
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 3. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_lista text := 'public.read_patient_list(text, text, text, uuid, boolean, text, boolean, integer, integer)';
BEGIN
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
