-- Fase 4 das pendencias consolidadas — o convite do paciente sai por SMS.
-- Item 4.3 (app #31, painel T-4). Decisoes: ADR-026 §7.
--
-- A Edge Function send-patient-invite chama ESTA funcao com o JWT do
-- administrador, e ela chama invite_patient. O embrulho existe por tres coisas
-- que invite_patient nao da, e que a funcao precisaria adivinhar:
--
--   * o telefone em E.164, validado ANTES de emitir o token. invite_patient
--     aceita qualquer texto como destino (serve ao "mostrar uma vez", que nao
--     depende de telefone); para SMS, fixo e numero truncado tem de parar aqui,
--     e nao no provedor, com um token ja vivo;
--   * a validade, para o painel dizer "vale ate";
--   * os nomes de erro que a lista combinou com o painel: `patient_already_linked`
--     em vez de `patient_already_activated`.
--
-- O destino e SEMPRE o telefone da ficha. Mandar para outro numero e corrigir a
-- ficha em update_patient antes — o mesmo que invite_patient ja pede de quem
-- reenvia.
--
-- Como invite_patient, emitir cancela o convite pendente anterior.

CREATE FUNCTION public.issue_patient_sms_invite(p_patient_id uuid)
RETURNS TABLE (invitation_id uuid, token text, phone text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient public.patients;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  IF v_patient.account_id IS NOT NULL THEN
    RAISE EXCEPTION 'patient_already_linked' USING ERRCODE = '23505';
  END IF;

  phone := private.normalize_br_phone(v_patient.phone);
  IF phone IS NULL THEN
    RAISE EXCEPTION 'invalid_phone'
      USING ERRCODE = '22023',
            HINT    = 'Corrija o celular da ficha (update_patient). Fixo nao recebe SMS.';
  END IF;

  -- patient_inactive e o resto das recusas vem de invite_patient, que
  -- confere de novo o administrador — a checagem acima e so a ordem dos erros.
  SELECT i.invitation_id, i.token INTO invitation_id, token
    FROM public.invite_patient(p_patient_id, phone) i;

  SELECT pi.expires_at INTO expires_at
    FROM public.patient_invitations pi
   WHERE pi.id = invitation_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.issue_patient_sms_invite(uuid) IS
  'Convite para envio por SMS: valida o celular da ficha, chama invite_patient e devolve token, celular E.164 e validade. So para a Edge Function send-patient-invite, que nunca devolve o token ao painel.';

REVOKE EXECUTE ON FUNCTION public.issue_patient_sms_invite(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.issue_patient_sms_invite(uuid) TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.issue_patient_sms_invite(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca issue_patient_sms_invite';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.issue_patient_sms_invite(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu issue_patient_sms_invite';
  END IF;
END;
$$;
