-- Assumir e encaminhar conversa passam a usar a especialidade VIGENTE de quem
-- assume e de quem recebe, e a troca de especialidade deixa de carregar a
-- marca de primaria para a linha encerrada.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.1 (painel #2).
-- Design e racional: supera-docs/ADRs/ADR-012 — Granularidade e corte do agregado Comunicação.md
--
-- O DEFEITO, MEDIDO EM HOMOLOGACAO. Uma profissional de Oncologia passou a
-- Psicologia em 28/09. Em 29/09 assumiu tres conversas, e as tres ficaram em
-- Oncologia. Encerrar respondia 403 nas tres. A cadeia:
--
--   1. set_professional_specialties encerra a linha antiga (ended_at) SEM
--      desligar is_primary. A linha nova nasce is_primary = true. O indice
--      unico parcial (WHERE is_primary AND ended_at IS NULL) aceita as duas,
--      porque a antiga ja nao e vigente.
--   2. claim_conversation e transfer_conversation escolhiam a area por
--      `ORDER BY is_primary DESC LIMIT 1`, SEM `ended_at IS NULL`. As duas
--      linhas empatam em is_primary = true, e a ordem entre elas fica a
--      criterio do plano — a antiga ganhou.
--   3. resolve_conversation confere contra my_specialty_ids(), que filtra a
--      vigencia. A conversa esta em Oncologia, a pessoa nao: 42501.
--
-- A correcao ataca as duas pontas. As funcoes filtram a vigencia, e a
-- funcao de troca desliga is_primary ao encerrar — assim nenhuma leitura
-- futura de "a primaria" tropeca numa linha historica. A higiene do fim
-- corrige as linhas antigas, e nenhuma conversa e tocada por id: as tres de
-- homologacao voltam a fila pela RPC de create_conversation_queue_return,
-- pelo painel.
--
-- Desempate por started_at DESC depois de is_primary: com a vigencia
-- filtrada, so ha uma primaria vigente (o indice garante). O segundo criterio
-- so decide entre areas secundarias quando nenhuma e primaria — caso que
-- create_professional e set_professional_specialties nao produzem, mas que
-- uma escrita direta de service_role poderia. Determinismo barato.


-- ============================================================
-- 1. claim_conversation
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL: EXECUTE continua so para authenticated.

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

  -- Vigencia filtrada (E.1). Sem o `ended_at IS NULL`, a linha encerrada de
  -- uma troca de area empatava com a vigente e podia ganhar.
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
     AND c.origin_specialty_id IS NULL;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, ja resolvida ou ja roteada'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversations
     SET origin_specialty_id      = v_specialty_id,
         assigned_professional_id = v_professional_id
   WHERE id = p_conversation_id;

  INSERT INTO public.conversation_assignments (conversation_id, professional_id, specialty_id)
  VALUES (p_conversation_id, v_professional_id, v_specialty_id);
END;
$$;


-- ============================================================
-- 2. transfer_conversation
-- ============================================================

CREATE OR REPLACE FUNCTION public.transfer_conversation(
  p_conversation_id    uuid,
  p_to_professional_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_professional_id uuid := private.my_professional_id();
  v_to_specialty_id      uuid;
  v_conversation         public.conversations;
BEGIN
  IF v_from_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo encaminha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- So encaminha quem esta na especialidade da conversa — a mesma regra da
  -- escrita (#25). Sem isto, encaminhar seria a porta lateral para agir sobre
  -- conversa de outra area.
  SELECT c.* INTO v_conversation
    FROM public.conversations c
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())));

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, resolvida ou de outra especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A area do DESTINO e a vigente (E.1). Sem o filtro, encaminhar para um
  -- colega que trocou de area derrubava a conversa na area antiga dele, onde
  -- ele nao consegue encerrar.
  SELECT ps.specialty_id INTO v_to_specialty_id
    FROM public.professional_specialties ps
    JOIN public.professionals p ON p.id = ps.professional_id
    JOIN public.accounts     a ON a.id = p.account_id
   WHERE ps.professional_id = p_to_professional_id
     AND ps.ended_at IS NULL
     AND p.is_active AND a.is_active
   ORDER BY ps.is_primary DESC, ps.started_at DESC
   LIMIT 1;

  IF v_to_specialty_id IS NULL THEN
    RAISE EXCEPTION 'profissional destino inexistente, inativo ou sem especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversation_assignments
     SET released_at = now()
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;

  INSERT INTO public.conversation_assignments (conversation_id, professional_id, specialty_id)
  VALUES (p_conversation_id, p_to_professional_id, v_to_specialty_id);

  UPDATE public.conversations
     SET origin_specialty_id      = v_to_specialty_id,
         assigned_professional_id = p_to_professional_id
   WHERE id = p_conversation_id;

  -- Texto GENERICO: nomear a especialidade destino vazaria pelo corpo o que a
  -- visibility acabou de fechar (comentario original em create_conversations).
  INSERT INTO public.messages (conversation_id, author_kind, body)
  VALUES (p_conversation_id, 'system',
          'Sua conversa foi encaminhada para outro profissional da equipe.');
END;
$$;


-- ============================================================
-- 3. set_professional_specialties — encerrar desliga a primaria
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_professional_specialties(
  p_professional_id      uuid,
  p_specialty_ids        uuid[],
  p_primary_specialty_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
  v_primary    uuid := p_primary_specialty_id;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account_id
    FROM public.professionals WHERE id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING ERRCODE = '23503';
  END IF;

  PERFORM private.reject_self_professional_change(v_account_id);

  IF p_specialty_ids IS NULL OR pg_catalog.cardinality(p_specialty_ids) = 0 THEN
    RAISE EXCEPTION 'specialty_required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(p_specialty_ids) AS s (id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.specialties sp WHERE sp.id = s.id AND sp.is_active
     )
  ) THEN
    RAISE EXCEPTION 'unknown_specialty' USING ERRCODE = '23503';
  END IF;

  v_primary := coalesce(v_primary, p_specialty_ids[1]);
  IF NOT (v_primary = ANY (p_specialty_ids)) THEN
    RAISE EXCEPTION 'primary_specialty_not_in_list' USING ERRCODE = '23514';
  END IF;

  -- 1. Encerra o que saiu da lista, e DESLIGA a primaria junto (E.1). Linha
  --    encerrada nao e primaria de nada: manter o true fazia a linha
  --    historica empatar com a vigente em qualquer `ORDER BY is_primary`.
  --
  --    clock_timestamp() e nao now(): o CHECK de periodo exige
  --    ended_at > started_at, e now() e o instante da transacao (comentario
  --    original em create_professional_registry).
  UPDATE public.professional_specialties
     SET ended_at   = pg_catalog.clock_timestamp(),
         is_primary = false
   WHERE professional_id = p_professional_id
     AND ended_at IS NULL
     AND NOT (specialty_id = ANY (p_specialty_ids));

  -- 2. A primaria muda sem encerrar vigencia.
  UPDATE public.professional_specialties
     SET is_primary = (specialty_id = v_primary)
   WHERE professional_id = p_professional_id
     AND ended_at IS NULL
     AND is_primary IS DISTINCT FROM (specialty_id = v_primary);

  -- 3. Abre vigencia para as novas.
  INSERT INTO public.professional_specialties (professional_id, specialty_id, is_primary)
  SELECT p_professional_id, s.id, (s.id = v_primary)
    FROM pg_catalog.unnest(p_specialty_ids) AS s (id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.professional_specialties ps
      WHERE ps.professional_id = p_professional_id
        AND ps.specialty_id    = s.id
        AND ps.ended_at IS NULL
   );
END;
$$;


-- ============================================================
-- 4. Higiene unica
-- ============================================================
--
-- Corrige o ESQUEMA, nao as conversas: toda linha encerrada deixa de se dizer
-- primaria. Cada linha tocada passa pelo trg_audit_write da tabela, e a
-- correcao fica na trilha com o ator da migration.
UPDATE public.professional_specialties
   SET is_primary = false
 WHERE ended_at IS NOT NULL
   AND is_primary;


-- ============================================================
-- 5. Privilegios — repetidos por seguranca
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL. A repeticao protege contra o default
-- privilege do Supabase ter sido alterado no intervalo (ADR-016).
REVOKE EXECUTE ON FUNCTION public.claim_conversation(uuid)                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_professional_specialties(uuid, uuid[], uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_conversation(uuid)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid)               TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_professional_specialties(uuid, uuid[], uuid) TO authenticated;
