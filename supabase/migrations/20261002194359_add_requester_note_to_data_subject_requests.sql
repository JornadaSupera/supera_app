-- Fase K.1 das pendencias do banco ([34], 02/10/2026): o pedido do titular
-- carrega o texto que ele escreveu.
-- Design e racional: supera-docs/ADRs/ADR-025 — Ciclo do pedido do titular e exportacao.md (emenda de 02/10/2026)
--
-- O QUE FALTAVA. O app tem um formulario de correcao ("quais dados estao
-- errados, e o que deveria constar") e nao tinha onde guardar a resposta:
-- `request_data_subject_action` recebia so o tipo. O administrador deferia uma
-- retificacao sem saber o que retificar. O app ja manda o parametro e liga o
-- formulario quando a coluna aparece.
--
-- AS REGRAS DO TEXTO:
--   - opcional, e vale para todo tipo de pedido (o app usa na retificacao, mas
--     nada impede o titular de explicar um pedido de acesso);
--   - ate 1000 caracteres, depois de tirar das pontas espacos, tabs e quebras
--     de linha (vem de um textarea); texto so de brancos vira NULL;
--   - IMUTAVEL, como o tipo e o titular: o texto e o que o titular pediu, na
--     data em que pediu, e e isso que conta o prazo. Reescreve-lo seria outro
--     pedido. A unica escrita aceita e APAGAR (-> NULL): uma eliminacao futura
--     do texto, quando a janela de retencao da ADR-005 for decidida, nao pode
--     colidir com o guard;
--   - fora da trilha: `audit_write` grava so o id da linha. O texto e do
--     titular, pode ter dado pessoal, e trilha que copia nao se elimina.
--
-- POR QUE DROP + CREATE, e nao CREATE OR REPLACE: a lista de parametros muda.
-- CREATE OR REPLACE com um parametro a mais cria OUTRA funcao, e a chamada de
-- hoje (so p_request_type) ficaria ambigua no PostgREST entre as duas. O
-- DEFAULT NULL mantem essa chamada funcionando na assinatura nova.
--
-- Nada muda nas politicas (_select_own e _select_admin sao por linha: o texto
-- chega a quem ja le o pedido) nem em `export_my_data`, que usa to_jsonb(r):
-- o texto entra no pacote do proprio titular, o que e correto.


-- ============================================================
-- 1. A coluna
-- ============================================================
--
-- O CHECK nasce junto da coluna: ela e nula em todas as linhas, nao ha o que
-- validar (o mesmo raciocinio de close_data_subject_request_cycle).

ALTER TABLE public.data_subject_requests
  ADD COLUMN requester_note text
    CONSTRAINT ck_dsr_requester_note_length CHECK (pg_catalog.char_length(requester_note) <= 1000);

COMMENT ON COLUMN public.data_subject_requests.requester_note IS
  'Texto do titular ao abrir o pedido (ex.: o que corrigir na retificacao). Opcional, ate 1000 caracteres, sem brancos nas pontas. Imutavel: so pode ser apagado (-> NULL). Fora da trilha.';


-- ============================================================
-- 2. A funcao — assinatura nova
-- ============================================================

DROP FUNCTION public.request_data_subject_action(public.data_subject_request_type);

CREATE FUNCTION public.request_data_subject_action(
  p_request_type   public.data_subject_request_type,
  p_requester_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id   uuid;
  -- Espaco, tab e quebra de linha: o texto vem de um textarea do app.
  v_note text := NULLIF(pg_catalog.btrim(p_requester_note, E' \t\r\n'), '');
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Antecipa o CHECK com erro nomeado: o app mostra "texto longo demais", nao
  -- uma violacao de constraint. O CHECK continua sendo a garantia (vale para
  -- service_role e para o dono do banco).
  IF pg_catalog.char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'requester_note_too_long' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.data_subject_requests (account_id, request_type, requester_note)
  VALUES (auth.uid(), p_request_type, v_note)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.request_data_subject_action(public.data_subject_request_type, text) IS
  'Abre um pedido LGPD (art. 18) da conta que chama. p_requester_note opcional: ate 1000 caracteres apos tirar brancos das pontas (espaco, tab, quebra de linha); so brancos vira NULL; texto longo levanta requester_note_too_long (22023).';


-- ============================================================
-- 3. O guard — o texto e imutavel, salvo apagamento
-- ============================================================
--
-- Mesma assinatura, CREATE OR REPLACE: o gatilho continua apontando para ela,
-- e o ACL (sem EXECUTE para PUBLIC, anon, authenticated) se preserva —
-- conferido no fim.

CREATE OR REPLACE FUNCTION private.guard_data_subject_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- O pedido e do titular e tem tipo desde o primeiro instante. Trocar
  -- qualquer um dos dois seria outro pedido, com outra data de entrada — e a
  -- data de entrada e o que conta o prazo. O texto do titular tambem: so pode
  -- ser apagado, nunca reescrito (emenda de 02/10/2026 a ADR-025).
  IF NEW.account_id   IS DISTINCT FROM OLD.account_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at
     OR (NEW.requester_note IS DISTINCT FROM OLD.requester_note
         AND NEW.requester_note IS NOT NULL) THEN
    RAISE EXCEPTION 'data_subject_request_immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = OLD.status THEN
    -- Sem transicao, so a anotacao da rotina pode mudar. Decisao e datas sao
    -- fato consumado: reescreve-las apagaria o que a trilha precisa contar.
    IF NEW.decided_by    IS DISTINCT FROM OLD.decided_by
       OR NEW.decided_at    IS DISTINCT FROM OLD.decided_at
       OR NEW.decision_note IS DISTINCT FROM OLD.decision_note
       OR NEW.reviewed_at   IS DISTINCT FROM OLD.reviewed_at
       OR NEW.executed_at   IS DISTINCT FROM OLD.executed_at THEN
      RAISE EXCEPTION 'data_subject_request_immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'requested'    AND NEW.status IN ('under_review', 'granted', 'refused'))
    OR (OLD.status = 'under_review' AND NEW.status IN ('granted', 'refused'))
    OR (OLD.status = 'granted'      AND NEW.status = 'executed')
  ) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 4. Privilegios — no fim, e medidos
-- ============================================================
--
-- service_role fica com o EXECUTE do default privilege, como na assinatura
-- antiga; com auth.uid() nulo ele cai em `forbidden` de qualquer jeito.

REVOKE EXECUTE ON FUNCTION public.request_data_subject_action(public.data_subject_request_type, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_data_subject_action(public.data_subject_request_type, text) TO authenticated;

DO $$
BEGIN
  IF (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc p
        JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'request_data_subject_action') <> 1 THEN
    RAISE EXCEPTION 'request_data_subject_action tem mais de uma assinatura: a chamada do app fica ambigua';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.request_data_subject_action(public.data_subject_request_type, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon abre pedido LGPD';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.request_data_subject_action(public.data_subject_request_type, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'o titular perdeu o caminho do pedido';
  END IF;
  IF pg_catalog.has_column_privilege('authenticated', 'public.data_subject_requests', 'requester_note', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.data_subject_requests', 'requester_note', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated escreve requester_note sem passar pela funcao';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'private.guard_data_subject_request_transition()', 'EXECUTE') THEN
    RAISE EXCEPTION 'o guard do pedido ficou executavel por authenticated';
  END IF;
END;
$$;
