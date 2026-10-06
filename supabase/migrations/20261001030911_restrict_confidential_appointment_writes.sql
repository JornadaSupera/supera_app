-- So quem ve o compromisso o altera: a sessao de Psicologia deixa de ser
-- remarcavel e cancelavel por quem nao e da especialidade.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.3b (painel #13,
-- decisao D6).
-- Design e racional: supera-docs/ADRs/ADR-014 — Granularidade, autoria e corte do agregado Agenda.md
--
-- >>> PROVISORIO. Aguarda a resposta da CEON a pergunta 1, enviada em
-- >>> 30/09/2026: "Quando uma sessao de Psicologia precisa ser remarcada ou
-- >>> cancelada, quem pode fazer isso? a) so a psicologa; b) a enfermagem
-- >>> navegadora tambem, mesmo sem ver os detalhes". A recomendacao e (a).
-- >>> Enquanto a resposta nao chega, vale o RESTRITIVO, pela regra do plano
-- >>> para as decisoes pendentes com risco de sigilo (D6 e D1b): a G.1b
-- >>> (forbid_self_review) subiu do mesmo jeito.
--
-- O FURO (item 13). reschedule_appointment e set_appointment_status sao
-- SECURITY DEFINER e so checavam can_manage_schedule(). A RLS de leitura — a
-- que faz a sessao de Psicologia sumir da agenda das outras areas — nao vale
-- dentro delas. A navegadora com `schedule.manage` remarcava e cancelava a
-- sessao que ela nao enxerga, bastando ter o id. A E.3a
-- (guard_appointment_writes) fechou o id inexistente e deixou este caso de
-- fora, esperando a CEON; esta migration o fecha no modo restritivo.
--
-- O QUE MUDA:
--   1. private.can_write_appointment(p_appointment_id): o predicado de
--      ESCRITA sobre um compromisso que ja existe. E o espelho da politica
--      appointments_select_professional: `visibility = 'team'` OU a
--      especialidade de origem e uma das vigentes de quem chama. A regra mora
--      num lugar so, e por isso a resposta (b) e uma linha aqui.
--   2. reschedule_appointment e set_appointment_status passam a exigir o
--      helper, alem de can_manage_schedule(). O compromisso que quem chama
--      nao ve responde `appointment_not_found` (P0002), o MESMO erro do id
--      inexistente: a recusa nao confirma que o id existe. Em
--      reschedule_appointment a checagem vem antes da de bloqueio (J.1), para
--      que `slot_blocked` tambem nao vire oraculo de existencia.
--
-- O QUE CONTINUA IGUAL:
--   * can_manage_schedule() (schedule.manage) continua exigido. A psicologa
--     remarca a propria sessao se tiver `schedule.manage` — a mesma condicao
--     que ela ja precisa para marca-la (schedule_appointment, E.3a);
--   * o compromisso `team` de qualquer area segue alteravel por quem tem
--     `schedule.manage`: a navegadora remarca a consulta da Nutricao;
--   * schedule_appointment nao muda: a E.3a ja recusa especialidade sigilosa
--     alheia na criacao;
--   * confirm_appointment/unconfirm_appointment (titular e acompanhante) nao
--     mudam: o titular ve a propria agenda inteira.
--
-- SE A CEON RESPONDER (b): migration nova que troca o corpo do helper por
--   `... OR private.has_permission('schedule.manage')`. A navegadora passa a
--   remarcar e cancelar SEM ver o compromisso, porque as duas RPCs so
--   devolvem o id (reschedule) ou nada (set_appointment_status). As
--   funcoes de agenda nao mudam.
-- SE RESPONDER (a): nada muda no banco; tira-se a marca de provisorio do
--   comentario do helper e do guia, e a ADR-014 recebe a emenda com a data.


-- ============================================================
-- 1. O predicado de escrita
-- ============================================================
--
-- SECURITY DEFINER: chamado de dentro das duas RPCs (tambem definer), le
-- appointments sem passar pelo pedagio da leitura clinica. Devolve so um
-- booleano. Id inexistente da false, e as RPCs nao distinguem os dois casos.

CREATE FUNCTION private.can_write_appointment(p_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.id = p_appointment_id
       AND ( a.visibility = 'team'
             OR a.origin_specialty_id = ANY (private.my_specialty_ids()) )
  );
$$;

COMMENT ON FUNCTION private.can_write_appointment(uuid) IS
  'PROVISORIO (D6, aguarda a CEON desde 30/09/2026): so quem ve o compromisso o altera — visibility team ou especialidade de origem vigente de quem chama, espelho de appointments_select_professional. Resposta (b): acrescentar OR has_permission(''schedule.manage''). Fase E.3b, ADR-014.';


-- ============================================================
-- 2. reschedule_appointment — o invisivel e inexistente
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL. O corpo e o de enforce_professional_blocks
-- (J.1), com a condicao nova no appointment_not_found.

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
  -- E.3b (provisorio, D6). Antes da checagem de bloqueio: o compromisso que
  -- quem chama nao ve nao pode responder slot_blocked.
  IF NOT FOUND OR NOT private.can_write_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- J.1.
  IF private.is_slot_blocked(v_old.professional_id, p_starts_at, p_ends_at) THEN
    RAISE EXCEPTION 'slot_blocked'
      USING ERRCODE = '23P01',
            HINT    = 'O profissional bloqueou este horario. Escolha outro (read_professional_busy_intervals).';
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
-- 3. set_appointment_status — idem
-- ============================================================
--
-- O corpo e o de guard_appointment_writes (E.3a). O helper entra no WHERE do
-- UPDATE: o compromisso invisivel nao casa linha e cai no mesmo IF NOT FOUND
-- do id inexistente.

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
   WHERE id = p_appointment_id
     AND private.can_write_appointment(p_appointment_id);  -- E.3b (provisorio, D6)

  -- E.3a (a) e E.3b: inexistente e invisivel respondem o mesmo.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;


-- ============================================================
-- 4. Privilegios — no fim, e medidos
-- ============================================================

-- So as duas RPCs definer chamam o helper: ninguem mais o executa.
REVOKE EXECUTE ON FUNCTION private.can_write_appointment(uuid) FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, uuid)                   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, uuid)                   TO authenticated;

DO $$
DECLARE
  v_rpcs text[] := ARRAY[
    'public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid)',
    'public.set_appointment_status(uuid, text, uuid)'
  ];
  v_ruim text;
BEGIN
  SELECT pg_catalog.string_agg(sig, ', ') INTO v_ruim
    FROM pg_catalog.unnest(v_rpcs) AS sig
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE')
      OR pg_catalog.has_function_privilege('anon', sig, 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'privilegio errado (authenticated sem EXECUTE ou anon com) em: %', v_ruim;
  END IF;

  SELECT pg_catalog.string_agg(r, ', ') INTO v_ruim
    FROM pg_catalog.unnest(ARRAY['anon', 'authenticated']) AS r
   WHERE pg_catalog.has_function_privilege(r, 'private.can_write_appointment(uuid)', 'EXECUTE');
  IF v_ruim IS NOT NULL THEN
    RAISE EXCEPTION 'can_write_appointment executavel por: %', v_ruim;
  END IF;
END;
$$;
