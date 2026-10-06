-- As escritas da agenda deixam de confirmar a existencia de um id e de
-- "dar certo" sobre compromisso inexistente, e o agendamento recusa a
-- especialidade sigilosa de outra pessoa.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.3a (painel #13).
-- Design e racional: supera-docs/ADRs/ADR-014 — Granularidade, autoria e corte do agregado Agenda.md
--
-- O QUE O PAINEL ENCONTROU (item 13), E O QUE ESTA MIGRATION FECHA
--
-- reschedule_appointment e set_appointment_status sao SECURITY DEFINER e so
-- checam can_manage_schedule(). A RLS de leitura — a que esconde a sessao de
-- Psicologia das outras areas — nao se aplica dentro delas. Tres defeitos:
--
--   a) set_appointment_status com id inexistente RETORNAVA SUCESSO. O UPDATE
--      nao casava linha e nada conferia. O painel mostraria "cancelado" sobre
--      um compromisso que nao existe. Mesmo caso de set_treatment_phase,
--      corrigido em guard_clinical_writes.
--   b) reschedule_appointment respondia "compromisso inexistente" com texto
--      livre e SQLSTATE generico. Passa a `appointment_not_found` (P0002), o
--      erro que as duas funcoes vao dar tambem para o compromisso que quem
--      chama nao pode alterar, quando a E.3b subir.
--   c) schedule_appointment aceitava QUALQUER p_origin_specialty_id. A
--      navegadora podia criar um compromisso "de Psicologia": o trigger o
--      fecharia como specialty_restricted, ele sumiria da agenda de quem o
--      criou, e o paciente teria uma sessao que a psicologa nao marcou.
--      Passa a recusar a especialidade SIGILOSA que nao e de quem agenda
--      (`origin_specialty_not_allowed`, 42501). Especialidade nao sigilosa
--      de outra area continua aceita: a navegadora agenda para a Nutricao.
--
-- O QUE FICA DE FORA, DE PROPOSITO: E.3b. Quem pode remarcar ou cancelar
-- sessao de Psicologia depende da resposta da CEON a pergunta enviada em
-- 30/09/2026 (D6). Ate la, a navegadora com `schedule.manage` continua
-- conseguindo remarcar e mudar o estado de um compromisso restrito se tiver
-- o id — as RPCs so devolvem o id novo, nunca o conteudo. A migration da
-- E.3b (restrict_confidential_appointment_writes) vem depois da resposta.


-- ============================================================
-- 1. schedule_appointment — especialidade sigilosa so a propria
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL.

CREATE OR REPLACE FUNCTION public.schedule_appointment(
  p_patient_id          uuid,
  p_appointment_type_id uuid,
  p_title               text,
  p_starts_at           timestamptz,
  p_ends_at             timestamptz,
  p_location_label      text,
  p_professional_id     uuid DEFAULT NULL,
  p_origin_specialty_id uuid DEFAULT NULL,
  p_patient_notes       text DEFAULT NULL,
  p_location_address    text DEFAULT NULL,
  p_location_phone      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id        uuid;
  v_scheduled uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo marca compromisso';
  END IF;

  -- E.3a (c). A checagem vem antes de qualquer escrita e nao distingue
  -- "especialidade sigilosa" de "especialidade de outra pessoa": so e
  -- recusado o par sigilosa + nao minha.
  IF p_origin_specialty_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.specialties s
                  WHERE s.id = p_origin_specialty_id AND s.is_confidential)
     AND NOT (p_origin_specialty_id = ANY (private.my_specialty_ids())) THEN
    RAISE EXCEPTION 'origin_specialty_not_allowed'
      USING ERRCODE = '42501',
            HINT    = 'Compromisso de especialidade sigilosa so e marcado por quem e da especialidade.';
  END IF;

  SELECT s.id INTO v_scheduled
    FROM public.appointment_statuses s WHERE s.code = 'scheduled';

  INSERT INTO public.appointments (
    patient_id, professional_id, appointment_type_id, status_id, title,
    starts_at, ends_at, location_label, location_address, location_phone,
    patient_notes, origin_specialty_id, created_by_account_id
  ) VALUES (
    p_patient_id, p_professional_id, p_appointment_type_id, v_scheduled, p_title,
    p_starts_at, p_ends_at, p_location_label, p_location_address, p_location_phone,
    p_patient_notes, p_origin_specialty_id, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 2. reschedule_appointment — appointment_not_found
-- ============================================================

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_reason_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old         public.appointments;
  v_new_id      uuid;
  v_scheduled   uuid;
  v_rescheduled uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo remarca compromisso';
  END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT s.id INTO v_scheduled   FROM public.appointment_statuses s WHERE s.code = 'scheduled';
  SELECT s.id INTO v_rescheduled FROM public.appointment_statuses s WHERE s.code = 'rescheduled';

  INSERT INTO public.appointments (
    patient_id, professional_id, appointment_type_id, status_id, title,
    starts_at, ends_at, location_label, location_address, location_phone,
    patient_notes, origin_specialty_id, rescheduled_from_id, created_by_account_id
  ) VALUES (
    v_old.patient_id, v_old.professional_id, v_old.appointment_type_id, v_scheduled, v_old.title,
    p_starts_at, p_ends_at, v_old.location_label, v_old.location_address, v_old.location_phone,
    v_old.patient_notes, v_old.origin_specialty_id, v_old.id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  UPDATE public.appointments
     SET status_id = v_rescheduled, status_reason_id = p_reason_id
   WHERE id = p_appointment_id;

  RETURN v_new_id;
END;
$$;


-- ============================================================
-- 3. set_appointment_status — confere o que fez
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_appointment_status(
  p_appointment_id uuid,
  p_status_code    text,
  p_reason_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_status_id uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo muda o estado do compromisso';
  END IF;

  -- 'rescheduled' nao se atribui a mao: e efeito de reschedule_appointment.
  IF p_status_code = 'rescheduled' THEN
    RAISE EXCEPTION 'use reschedule_appointment para remarcar';
  END IF;

  SELECT s.id INTO v_status_id
    FROM public.appointment_statuses s WHERE s.code = p_status_code AND s.is_active;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'estado inexistente: %', p_status_code;
  END IF;

  UPDATE public.appointments
     SET status_id = v_status_id, status_reason_id = p_reason_id
   WHERE id = p_appointment_id;

  -- E.3a (a). Sem isto, id inexistente "dava certo".
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


-- ============================================================
-- 4. Privilegios — repetidos por seguranca
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, uuid)                   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, uuid)                   TO authenticated;
