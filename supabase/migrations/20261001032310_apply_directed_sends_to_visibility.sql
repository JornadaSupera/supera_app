-- A orientacao enviada abre no app, e a notificacao do envio passa pela
-- mesma peneira que as outras.
-- Plano das pendencias do painel de 30/09/2026, Fase G, item G.2 (painel #12).
-- Design e racional: supera-docs/ADRs/ADR-032 — Envio dirigido de orientação.md
--
-- Tres funcoes, todas com a mesma assinatura (CREATE OR REPLACE preserva dono
-- e ACL):
--
--   1. private.is_content_visible_to_me: a orientacao enviada ao paciente e
--      visivel a ele mesmo sem CID compativel — e o ponto do envio dirigido,
--      que existe justamente para a orientacao que a biblioteca automatica
--      nao mostraria. Continua exigindo versao publicada. Para o
--      acompanhante, o mesmo recorte da politica de content_directed_sends:
--      envio `team`, area `resources`, e `clinical_record` se a orientacao e
--      marcada por CID. Como a funcao ja entra nas politicas de
--      content_items, content_versions, content_attachments e do bucket
--      content-attachments, o anexo da orientacao enviada abre junto.
--   2. private.notification_area_allows: a regra "orientacao marcada por CID
--      exige clinical_record" valia so para alvo content_items. O alvo do
--      aviso do envio e content_directed_sends; a funcao resolve o item por
--      tras dele.
--   3. private.recipient_still_eligible: no envio do push, o envio restrito
--      nao sai para o acompanhante, e o envio inexistente nao sai para
--      ninguem. O corpo e o de create_conversation_transfer_notices (H.3),
--      com o ramo novo antes do da equipe.


-- ============================================================
-- 1. A orientacao enviada abre no app
-- ============================================================

CREATE OR REPLACE FUNCTION private.is_content_visible_to_me(p_content_item_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.content_versions v
            WHERE v.content_item_id = p_content_item_id
              AND v.status = 'published'
         )
     AND (
           -- Sem marcacao de CID = universal.
           NOT EXISTS (SELECT 1 FROM public.content_cid10 c
                        WHERE c.content_item_id = p_content_item_id)
           OR EXISTS (SELECT 1 FROM public.content_cid10 c
                       WHERE c.content_item_id = p_content_item_id
                         AND c.cid10_id = ANY (ARRAY(SELECT unnest(private.my_library_cid10_ids()))))
           -- G.2: enviada a mim (titular), ou ao meu tutelado (acompanhante),
           -- no recorte da politica content_directed_sends_select_caregiver.
           OR EXISTS (SELECT 1 FROM public.content_directed_sends s
                       WHERE s.content_item_id = p_content_item_id
                         AND ( s.patient_id = private.my_own_patient_id()
                               OR ( s.visibility = 'team'
                                    AND s.patient_id = ANY (private.my_ward_patient_ids_for('resources'))
                                    AND ( NOT EXISTS (SELECT 1 FROM public.content_cid10 c
                                                       WHERE c.content_item_id = p_content_item_id)
                                          OR s.patient_id = ANY (private.my_ward_patient_ids_for('clinical_record')) ) ) ))
         );
$$;

COMMENT ON FUNCTION private.is_content_visible_to_me(uuid) IS
  'Elegibilidade do paciente/cuidador a uma orientacao: existe versao publicada E (nao ha marcacao de CID OU ela cruza com o diagnostico OU ela foi enviada a ele — G.2, ADR-032). A regra mora AQUI, no banco — nao na query do front-end, onde viraria tres verdades.';


-- ============================================================
-- 2. A area do acompanhante enxerga o item por tras do envio
-- ============================================================

CREATE OR REPLACE FUNCTION private.notification_area_allows(
  p_account_id   uuid,
  p_patient_id   uuid,
  p_type_id      uuid,
  p_target_table text,
  p_target_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH areas AS (
    SELECT s.scope
      FROM public.patient_caregivers pc
      JOIN public.caregivers c ON c.id = pc.caregiver_id
      JOIN public.accounts   a ON a.id = c.account_id
      JOIN public.patients   p ON p.id = pc.patient_id
      JOIN public.patient_caregiver_scopes s
        ON s.link_id = pc.id
       AND s.enabled
     WHERE c.account_id  = p_account_id
       AND pc.patient_id = p_patient_id
       AND pc.status     = 'active'
       AND a.is_active
       AND c.is_active
       AND p.is_active
  ),
  -- O item da orientacao por tras do alvo: o proprio, ou o do envio dirigido.
  -- Outro alvo -> NULL, e a regra do CID nao se aplica.
  item AS (
    SELECT CASE p_target_table
             WHEN 'content_items' THEN p_target_id
             WHEN 'content_directed_sends' THEN
               (SELECT ds.content_item_id FROM public.content_directed_sends ds
                 WHERE ds.id = p_target_id)
           END AS id
  )
  SELECT coalesce((
    SELECT CASE
             WHEN t.caregiver_scope IS NULL THEN true
             ELSE t.caregiver_scope IN (SELECT scope FROM areas)
                  -- orientacao marcada por CID revela o diagnostico
                  AND ( t.caregiver_scope <> 'resources'
                        OR NOT EXISTS (SELECT 1 FROM public.content_cid10 cc, item
                                        WHERE cc.content_item_id = item.id)
                        OR 'clinical_record' IN (SELECT scope FROM areas) )
           END
      FROM public.notification_types t
     WHERE t.id = p_type_id
  ), false);
$$;

COMMENT ON FUNCTION private.notification_area_allows(uuid, uuid, uuid, text, uuid) IS
  'A conta, como acompanhante ativo do paciente, tem ligada a area que o tipo exige (e clinical_record, para orientacao marcada por CID, direta ou por envio dirigido)? Tipo sem area -> true. Para produtor e envio, que rodam sem a sessao do destinatario (ADR-030 §8, ADR-032).';


-- ============================================================
-- 3. No envio do push — o envio restrito nao sai para o acompanhante
-- ============================================================

CREATE OR REPLACE FUNCTION private.recipient_still_eligible(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n          record;
  v_titular    boolean;
  v_staff      boolean;
  v_caregiver  boolean;
  v_visibility public.clinical_visibility;
  v_status     text;
  v_specialty  uuid;
BEGIN
  SELECT n.recipient_account_id, n.patient_id, n.target_table, n.target_id,
         n.type_id, a.is_active AS account_active, t.code AS type_code
    INTO v_n
    FROM public.notifications n
    JOIN public.accounts a           ON a.id = n.recipient_account_id
    JOIN public.notification_types t ON t.id = n.type_id
   WHERE n.id = p_notification_id;

  IF NOT FOUND OR NOT v_n.account_active THEN
    RETURN false;
  END IF;

  IF v_n.patient_id IS NULL THEN
    RETURN true;
  END IF;

  v_titular := EXISTS (SELECT 1 FROM public.patients p
                        WHERE p.id = v_n.patient_id
                          AND p.account_id = v_n.recipient_account_id);
  -- A equipe: o vinculo dela nao e por paciente (resposta #10).
  v_staff := EXISTS (SELECT 1 FROM public.professionals pr
                      WHERE pr.account_id = v_n.recipient_account_id)
          OR EXISTS (SELECT 1 FROM public.admins ad
                      WHERE ad.account_id = v_n.recipient_account_id);
  -- O acompanhante: REAVALIADO agora, nao quando a linha nasceu.
  v_caregiver := NOT v_titular AND NOT v_staff
             AND EXISTS (SELECT 1
                           FROM public.patient_caregivers pc
                           JOIN public.caregivers c ON c.id = pc.caregiver_id
                          WHERE c.account_id = v_n.recipient_account_id
                            AND pc.patient_id = v_n.patient_id
                            AND pc.status = 'active');

  IF NOT (v_titular OR v_staff OR v_caregiver) THEN
    RETURN false;
  END IF;

  -- ADR-030 §8: a area tambem e reavaliada no envio.
  IF v_caregiver
     AND NOT private.notification_area_allows(v_n.recipient_account_id, v_n.patient_id,
                                              v_n.type_id, v_n.target_table, v_n.target_id) THEN
    RETURN false;
  END IF;

  IF v_n.target_table = 'appointments' THEN
    SELECT ap.visibility, s.code INTO v_visibility, v_status
      FROM public.appointments ap
      JOIN public.appointment_statuses s ON s.id = ap.status_id
     WHERE ap.id = v_n.target_id;

    IF v_caregiver AND v_visibility IS DISTINCT FROM 'team' THEN
      RETURN false;
    END IF;
    IF v_n.type_code IN ('appointment_reminder_24h', 'appointment_reminder_2h')
       AND v_status IS DISTINCT FROM 'scheduled' THEN
      RETURN false;
    END IF;

  ELSIF v_n.target_table = 'conversations' AND v_caregiver THEN
    IF NOT EXISTS (SELECT 1 FROM public.conversations c
                    WHERE c.id = v_n.target_id AND c.visibility = 'team') THEN
      RETURN false;
    END IF;

  -- G.2: o envio dirigido restrito (Psicologia, ou area que virou
  -- confidencial depois do envio) nunca chega ao acompanhante. O titular
  -- recebe sempre; o envio inexistente nao avisa ninguem.
  ELSIF v_n.target_table = 'content_directed_sends' THEN
    SELECT s.visibility INTO v_visibility
      FROM public.content_directed_sends s
     WHERE s.id = v_n.target_id;

    IF v_visibility IS NULL THEN
      RETURN false;
    END IF;
    IF v_caregiver AND v_visibility <> 'team' THEN
      RETURN false;
    END IF;

  -- H.3: a equipe so e avisada da conversa que enxerga. O mesmo recorte das
  -- politicas de leitura de conversations: o profissional ativo ve `team` e o
  -- que e da area vigente dele; o administrador, so `team`. O titular que
  -- tambem e da equipe cai aqui so se nao for o dono da ficha.
  ELSIF v_n.target_table = 'conversations' AND v_staff AND NOT v_titular THEN
    SELECT c.visibility, c.origin_specialty_id INTO v_visibility, v_specialty
      FROM public.conversations c
     WHERE c.id = v_n.target_id;

    IF v_visibility IS NULL THEN
      RETURN false;
    END IF;

    IF v_visibility <> 'team'
       AND NOT EXISTS (SELECT 1
                         FROM public.professionals pr
                         JOIN public.professional_specialties ps ON ps.professional_id = pr.id
                        WHERE pr.account_id = v_n.recipient_account_id
                          AND pr.is_active
                          AND ps.specialty_id = v_specialty
                          AND ps.ended_at IS NULL) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;


-- ============================================================
-- 4. Privilegios medidos — as tres funcoes mantem o ACL
-- ============================================================

DO $$
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated', 'private.is_content_visible_to_me(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu is_content_visible_to_me: a biblioteca do app morreria';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', 'private.recipient_still_eligible(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu recipient_still_eligible: a rotina de push morreria';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'private.is_content_visible_to_me(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'private.notification_area_allows(uuid, uuid, uuid, text, uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'private.recipient_still_eligible(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'private.notification_area_allows(uuid, uuid, uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'helper de notificacao ou de biblioteca alcancavel por quem nao deve';
  END IF;
END;
$$;
