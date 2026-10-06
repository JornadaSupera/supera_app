-- O administrador devolve uma conversa a fila geral: sem area e sem
-- responsavel, para que qualquer profissional a assuma de novo.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.2 (painel #2).
-- Design e racional: supera-docs/ADRs/ADR-012 — Granularidade e corte do agregado Comunicação.md
--
-- POR QUE EXISTE. O defeito corrigido em fix_conversation_specialty_lookup
-- deixou tres conversas de homologacao numa area onde quem as assumiu nao
-- esta. Corrigir o defeito nao as solta: elas continuam roteadas a Oncologia.
-- A remediacao e esta RPC, chamada PELO PAINEL, uma vez por conversa — e nao
-- um UPDATE por id numa migration, que gravaria em todo ambiente (inclusive
-- num banco de producao que nunca teve o defeito) um conserto de dado de
-- homologacao.
--
-- A RPC fica, porque o caso se repete: a pessoa que assumiu sai de ferias,
-- e desligada, ou assumiu por engano. Hoje a unica saida seria alguem da
-- area encerrar a conversa, o que fecha o atendimento sem resposta.
--
-- REGRAS
--   - So administrador ativo (is_active_admin, que ja exige aal2 quando
--     require_admin_mfa esta ligado).
--   - So conversa `open`, JA ROTEADA e `visibility = 'team'`. A conversa de
--     Psicologia nao e alcancada: o administrador nao a enxerga (#11, #23), e
--     devolve-la a fila a exporia a equipe inteira. Nunca afrouxa sigilo.
--   - Inexistente, resolvida, nao roteada e restrita respondem IGUAL,
--     `conversation_not_found`. Um erro distinto para a restrita confirmaria
--     que o id existe e e de area sigilosa — o oraculo que a ADR-003 proibe.
--   - A trilha e automatica: conversations tem trg_audit_write, e o ator
--     gravado e o administrador (auth.uid()). conversation_assignments NAO
--     tem gatilho de trilha; a devolucao fica registrada pela linha de
--     conversations.
--   - Nenhuma mensagem ao paciente. Para ele nada mudou: a conversa segue
--     aberta, na mesma thread.


CREATE FUNCTION public.return_conversation_to_queue(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.conversations c
     SET origin_specialty_id      = NULL,
         assigned_professional_id = NULL
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.visibility = 'team'
     AND c.origin_specialty_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found'
      USING ERRCODE = 'P0002',
            HINT    = 'So conversa aberta, ja assumida e visivel a administracao volta a fila.';
  END IF;

  -- Encerra a designacao aberta. O historico (quem atendeu, e ate quando)
  -- fica em conversation_assignments.
  UPDATE public.conversation_assignments
     SET released_at = now()
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.return_conversation_to_queue(uuid) IS
  'Administrador devolve conversa aberta, roteada e team a fila geral (origin_specialty_id e assigned_professional_id nulos) e encerra a designacao aberta. Conversa restrita, resolvida, nao roteada ou inexistente: conversation_not_found (P0002), igual para todas.';


-- ============================================================
-- Privilegios — no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.return_conversation_to_queue(uuid) TO authenticated;
