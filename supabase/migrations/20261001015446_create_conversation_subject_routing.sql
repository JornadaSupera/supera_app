-- O administrador liga um assunto do chat a uma especialidade, e a conversa
-- que nasce roteada passa a poder ser assumida por quem e da area.
-- Plano das pendencias do painel de 30/09/2026, Fase H, item H.1 (painel #7),
-- decisao D3.
-- Design e racional: supera-docs/ADRs/ADR-012 — Granularidade e corte do agregado Comunicação.md
--
-- DECIDIDO EM 30/09/2026 (D3): continua valendo o que a CEON disse em 31/08,
-- a navegadora atende tudo. O MAPEAMENTO NASCE VAZIO e nenhuma linha muda
-- aqui. Quem liga um assunto a uma area e o administrador, pelo painel, se a
-- clinica quiser. Nao ha carga inicial nem pergunta pendente.
--
-- start_conversation JA COPIA conversation_subjects.specialty_id para a
-- conversa (create_conversations) e nao muda. Faltavam duas coisas:
--
--   1. QUEM CONFIGURA. create_vocabulary_admin deixou o roteamento de fora de
--      proposito (rotear para area sigilosa fecha a conversa). Entra agora a
--      RPC de administrador, com a recusa da area sigilosa no corpo E num
--      gatilho da tabela — o gatilho vale tambem para service_role, que ignora
--      a RLS mas nao ignora trigger.
--
--   2. QUEM ASSUME A CONVERSA ROTEADA. claim_conversation so aceitava
--      `origin_specialty_id IS NULL`. No dia em que o administrador ligasse um
--      assunto, a conversa nasceria na area sem ninguem que a assumisse, nem
--      da propria area: a navegadora a veria e nao assumiria, nao encaminharia
--      e nao encerraria. Agora claim aceita tambem conversa aberta, AINDA SEM
--      RESPONSAVEL, da area de quem assume, e mantem a especialidade da
--      conversa (nao troca pela primaria da pessoa).
--
-- POR QUE A AREA SIGILOSA E RECUSADA COMO DESTINO. Conversa roteada a
-- Psicologia nasce `specialty_restricted` (enforce_conversation_confidentiality)
-- — desde o primeiro segundo, fora do alcance da navegadora, da administracao e
-- do acompanhante que a abriu (a politica do acompanhante exige `team`). O
-- acompanhante escreveria e a conversa sumiria da tela dele. O caminho para a
-- Psicologia continua sendo o encaminhamento, um ato de um profissional.
--
-- O QUE NAO MUDA COM O ROTEAMENTO: a conversa roteada a area nao sigilosa
-- nasce `team`, e a navegadora continua vendo-a. So nao assume (nao e da area).
-- Se ninguem da area atender, o administrador a devolve a fila geral com
-- return_conversation_to_queue (E.2), que aceita conversa roteada e sem
-- responsavel.
--
-- is_confidential DE UMA ESPECIALIDADE so muda por migration (specialties nao
-- tem escrita pelo app). A migration que um dia marcar uma area como sigilosa
-- precisa, junto, zerar as rotas que apontam para ela: o gatilho daqui recusa
-- a gravacao da rota, nao a mudanca na especialidade.


-- ============================================================
-- 1. A guarda da tabela — vale para todo caminho de escrita
-- ============================================================

CREATE FUNCTION private.guard_conversation_subject_route()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- le specialties sem depender da RLS de quem escreve
SET search_path = ''
AS $$
DECLARE
  v_confidential boolean;
  v_active       boolean;
BEGIN
  IF NEW.specialty_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.is_confidential, s.is_active INTO v_confidential, v_active
    FROM public.specialties s
   WHERE s.id = NEW.specialty_id;

  IF v_confidential THEN
    RAISE EXCEPTION 'confidential_specialty_not_routable'
      USING ERRCODE = '23514',
            HINT    = 'Conversa roteada a area sigilosa nasceria restrita e sumiria da tela do acompanhante que a abriu.';
  END IF;

  IF v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'unknown_specialty' USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_route
BEFORE INSERT OR UPDATE OF specialty_id ON public.conversation_subjects
FOR EACH ROW EXECUTE FUNCTION private.guard_conversation_subject_route();


-- ============================================================
-- 2. set_conversation_subject_specialty — a RPC do painel
-- ============================================================
--
-- NULL devolve o assunto a triagem da navegadora. A conversa ja aberta nao
-- muda: o roteamento vale para a proxima que nascer. Mudar a area de conversa
-- existente e encaminhamento, e encaminhamento e ato de profissional.
--
-- A trilha e automatica: conversation_subjects tem trg_audit_write desde
-- create_vocabulary_admin, e o ator gravado e o administrador.

CREATE FUNCTION public.set_conversation_subject_specialty(
  p_subject_id   uuid,
  p_specialty_id uuid
)
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

  -- A recusa da area sigilosa e da inexistente mora no gatilho, que levanta
  -- confidential_specialty_not_routable ou unknown_specialty.
  UPDATE public.conversation_subjects
     SET specialty_id = p_specialty_id
   WHERE id = p_subject_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'subject_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_conversation_subject_specialty(uuid, uuid) IS
  'Administrador liga o assunto a uma especialidade (conversa nova nasce na fila da area) ou, com NULL, devolve-o a triagem da navegadora. Area sigilosa: confidential_specialty_not_routable (23514). Nao toca conversa ja aberta.';

COMMENT ON COLUMN public.conversation_subjects.specialty_id IS
  'Roteamento assunto -> especialidade. Nasce NULL (a navegadora atende tudo, CEON 31/08; D3 de 30/09/2026). O administrador liga pelo set_conversation_subject_specialty. Area sigilosa recusada por gatilho.';


-- ============================================================
-- 3. claim_conversation — aceita a conversa roteada sem responsavel
-- ============================================================
--
-- Parte da versao de fix_conversation_specialty_lookup (E.1): a especialidade
-- de quem assume continua sendo a VIGENTE. O que muda:
--
--   * Conversa nao roteada: como antes, ganha a especialidade primaria
--     vigente de quem assume.
--   * Conversa roteada, aberta e SEM RESPONSAVEL, de uma area em que a pessoa
--     esta hoje: a pessoa assume e a conversa FICA na area dela. Usar a
--     primaria aqui moveria a conversa de Farmacia para a Oncologia de quem
--     tem as duas.
--   * Conversa com responsavel: recusada. Tomar a conversa de um colega e
--     encaminhamento (transfer_conversation), que deixa a mensagem de
--     transicao.
--
-- FOR UPDATE serializa duas pessoas assumindo ao mesmo tempo: a segunda espera,
-- reavalia o WHERE sobre a linha ja assumida e cai na recusa, em vez de
-- morrer no indice unico de conversation_assignments.

CREATE OR REPLACE FUNCTION public.claim_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := private.my_professional_id();
  v_specialty_id    uuid;
  v_conversation    public.conversations;
BEGIN
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo assume conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Vigencia filtrada (E.1).
  SELECT ps.specialty_id INTO v_specialty_id
    FROM public.professional_specialties ps
   WHERE ps.professional_id = v_professional_id
     AND ps.ended_at IS NULL
   ORDER BY ps.is_primary DESC, ps.started_at DESC
   LIMIT 1;

  IF v_specialty_id IS NULL THEN
    RAISE EXCEPTION 'profissional sem especialidade nao assume conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_conversation
    FROM public.conversations c
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND ( c.origin_specialty_id IS NULL
           OR ( c.assigned_professional_id IS NULL
                AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) ) )
     FOR UPDATE;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, resolvida, ja assumida ou de outra area'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- H.1: a conversa roteada fica na area dela.
  v_specialty_id := coalesce(v_conversation.origin_specialty_id, v_specialty_id);

  UPDATE public.conversations
     SET origin_specialty_id      = v_specialty_id,
         assigned_professional_id = v_professional_id
   WHERE id = p_conversation_id;

  INSERT INTO public.conversation_assignments (conversation_id, professional_id, specialty_id)
  VALUES (p_conversation_id, v_professional_id, v_specialty_id);
END;
$$;

COMMENT ON FUNCTION public.claim_conversation(uuid) IS
  'Assume conversa aberta e sem responsavel: a nao roteada ganha a especialidade primaria vigente de quem assume; a roteada (H.1) so por quem esta na area dela, e fica na area. Conversa com responsavel se toma por encaminhamento.';


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.guard_conversation_subject_route()           FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_conversation_subject_specialty(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.claim_conversation(uuid)                       FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_conversation_subject_specialty(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation(uuid)                       TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.set_conversation_subject_specialty(uuid, uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.claim_conversation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca uma RPC do roteamento do chat';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.set_conversation_subject_specialty(uuid, uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.claim_conversation(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu uma RPC do roteamento do chat';
  END IF;

  -- D3: o mapeamento nasce vazio. Esta migration nao roteia nada.
  IF EXISTS (SELECT 1 FROM public.conversation_subjects s
               JOIN public.specialties sp ON sp.id = s.specialty_id
              WHERE sp.is_confidential) THEN
    RAISE EXCEPTION 'ha assunto roteado a area sigilosa';
  END IF;
END;
$$;
