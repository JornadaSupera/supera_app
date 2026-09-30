-- As escritas da ficha clinica recusam paciente inexistente com o mesmo erro
-- das escritas de cadastro, e desfazer a confirmacao de compromisso passa a
-- avisar quando nao fez nada.
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md
-- Itens 6.4 (painel P-4) e 6.11 (app #19) da lista consolidada.
--
-- 6.4 — O PAINEL PEDIU A GUARDA SO NO HISTORICO CLINICO, E ELA ENTRA NAS QUATRO
-- ESCRITAS DA FICHA. As escritas de cadastro (update_patient, set_patient_active,
-- invite_patient, issue_patient_sms_invite, reveal_patient_identifiers) ja
-- respondiam `patient_not_found` (23503). As quatro da ficha nao conferiam nada,
-- e cada uma falhava de um jeito:
--   add_patient_clinical_history   violacao de FK, com o nome da constraint na
--   upsert_patient_diagnosis       mensagem — mesmo SQLSTATE, texto que a tela
--   set_treatment_plan             nao sabe traduzir
--   set_treatment_phase            NADA: o UPDATE nao casa linha nenhuma e a
--                                  chamada "da certo". O painel mostraria "fase
--                                  alterada" sobre uma ficha que nao existe.
-- O quarto caso e o pior, porque parece sucesso, e o pedido do painel so o
-- descobriria na hora em que alguem estranhasse. Guarda igual nas quatro.
--
-- A guarda vem DEPOIS da checagem de perfil, como nas escritas de cadastro:
-- quem nao pode escrever recebe `forbidden` e nao aprende se a ficha existe.
--
-- A existencia e conferida sem olhar `is_active`. Ficha desativada continua
-- recebendo escrita clinica hoje, e mudar isso seria outra regra, nao esta.


-- ============================================================
-- 1. As quatro escritas da ficha (6.4)
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_patient_clinical_history(
  p_patient_id  uuid,
  p_kind        public.clinical_history_kind,
  p_description text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id) THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.patient_clinical_history (patient_id, kind, description, recorded_by)
  VALUES (p_patient_id, p_kind, p_description, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_patient_diagnosis(
  p_patient_id   uuid,
  p_cid10_id     uuid,
  p_staging      text DEFAULT NULL,
  p_tnm          text DEFAULT NULL,
  p_diagnosed_on date DEFAULT NULL,
  p_is_primary   boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id) THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  IF p_is_primary THEN
    UPDATE public.patient_diagnoses
       SET is_primary = false
     WHERE patient_id = p_patient_id
       AND is_primary;
  END IF;

  INSERT INTO public.patient_diagnoses
    (patient_id, cid10_id, staging, tnm, diagnosed_on, is_primary, source, recorded_by)
  VALUES
    (p_patient_id, p_cid10_id, p_staging, p_tnm, p_diagnosed_on, p_is_primary, 'local', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_treatment_plan(
  p_patient_id     uuid,
  p_protocol_name  text,
  p_cycles_planned smallint DEFAULT NULL,
  p_intent         text     DEFAULT NULL,
  p_started_on     date     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_start date := COALESCE(p_started_on, (pg_catalog.now())::date);
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id) THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  UPDATE public.treatment_plans
     SET ended_on = GREATEST(v_start, COALESCE(started_on, v_start))
   WHERE patient_id = p_patient_id
     AND ended_on IS NULL;

  INSERT INTO public.treatment_plans
    (patient_id, protocol_name, cycles_planned, intent, started_on, source, recorded_by)
  VALUES
    (p_patient_id, p_protocol_name, p_cycles_planned, p_intent, v_start, 'local', auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_treatment_phase(
  p_patient_id uuid,
  p_phase_code text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_phase_id uuid;
BEGIN
  IF NOT (private.is_active_admin() OR private.is_active_professional()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Antes do vocabulario: ficha inexistente e o erro mais especifico, e
  -- respondê-lo depois de "fase desconhecida" mandaria corrigir o codigo da
  -- fase numa chamada que nunca daria certo.
  IF NOT EXISTS (SELECT 1 FROM public.patients p WHERE p.id = p_patient_id) THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  SELECT id INTO v_phase_id
  FROM public.treatment_phases
  WHERE code = p_phase_code
    AND axis = 'clinical'
    AND is_active;

  IF v_phase_id IS NULL THEN
    RAISE EXCEPTION 'unknown_treatment_phase' USING ERRCODE = '22023';
  END IF;

  UPDATE public.patients SET treatment_phase_id = v_phase_id WHERE id = p_patient_id;
END;
$$;


-- ============================================================
-- 2. unconfirm_appointment confere o que fez (6.11)
-- ============================================================
--
-- `confirm_appointment` ja conferia ROW_COUNT; a irma nao, e desfazer a
-- confirmacao de um compromisso que ja comecou "dava certo" sem mudar nada. O
-- app mostrava "confirmacao desfeita" e o painel continuava vendo confirmado.
--
-- Desfazer sobre compromisso NAO confirmado continua valendo (e idempotente):
-- a linha casa, e gravar NULL sobre NULL nao e erro. So o compromisso que ja
-- comecou fica de fora, pela mesma regra do UPDATE de sempre.
CREATE OR REPLACE FUNCTION public.unconfirm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated bigint;
BEGIN
  IF NOT private.can_confirm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'apenas o titular ou quem o acompanha desfaz a confirmacao';
  END IF;

  UPDATE public.appointments a
     SET confirmed_at = NULL, confirmed_by_account_id = NULL
   WHERE a.id = p_appointment_id
     AND a.starts_at > now();

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'compromisso ja comecou';
  END IF;
END;
$$;


-- ============================================================
-- 3. Asserção de efeito
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL, e nenhuma funcao nova nasce aqui. Mede-se
-- mesmo assim, porque o caro seria descobrir no painel que a ficha parou.
DO $$
DECLARE
  v_ruim text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_ruim
    FROM pg_catalog.unnest(ARRAY[
      'public.add_patient_clinical_history(uuid, public.clinical_history_kind, text)',
      'public.upsert_patient_diagnosis(uuid, uuid, text, text, date, boolean)',
      'public.set_treatment_plan(uuid, text, smallint, text, date)',
      'public.set_treatment_phase(uuid, text)',
      'public.unconfirm_appointment(uuid)'
    ]) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio errado (authenticated sem EXECUTE ou anon com) em: %', v_ruim;
  END IF;
END;
$$;
