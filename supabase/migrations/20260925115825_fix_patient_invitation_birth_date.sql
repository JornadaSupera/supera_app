-- Fase 1.1 das pendencias consolidadas (app #1): o aceite do convite do
-- paciente deixava de conferir a data de nascimento quando ela chegava nula.
--
-- O DEFEITO: a comparacao era `v_patient.birth_date <> p_birth_date`. Com
-- p_birth_date NULL, a expressao vale NULL, o OR inteiro vale NULL, e um IF
-- sobre NULL nao entra no ramo do erro. Token + CPF, sem nascimento, ativavam
-- a ficha — o segundo fator de conhecimento (ADR-020) caia pela metade sem
-- nenhum erro.
--
-- A CORRECAO e IS DISTINCT FROM nos dois termos, e nao so no da data: o CPF
-- nunca chega nulo hoje (normalize_cpf faz coalesce para ''), mas deixar um
-- `<>` ao lado de um IS DISTINCT FROM seria convidar a mesma regressao na
-- proxima vez que alguem mexer na normalizacao.
--
-- O erro continua o mesmo `invalid_invitation`, pelo mesmo motivo de antes:
-- distinguir "faltou a data" de "a data nao confere" e oraculo.
--
-- CREATE OR REPLACE: mesma assinatura, mesmo dono (postgres), ACL preservado.
-- Todo o resto do corpo e identico ao de create_patient_registry.

CREATE OR REPLACE FUNCTION public.accept_patient_invitation(
  p_token      text,
  p_cpf        text,
  p_birth_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_cpf        text := private.normalize_cpf(p_cpf);
  v_invitation public.patient_invitations;
  v_patient    public.patients;
BEGIN
  -- service_role chega com auth.uid() NULL. Ativar em nome de ninguem
  -- deixaria a ficha ligada a lugar nenhum.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_uid AND is_active) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- A conta nao pode ja exercer outro papel (ADR-020 §4) — ver
  -- create_patient_registry para o racional completo da escalada que isto fecha.
  IF EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.caregivers    WHERE account_id = v_uid) THEN
    RAISE EXCEPTION 'account_has_other_profile'
      USING ERRCODE = '42501',
            HINT    = 'A ativacao do app exige conta sem outro perfil na plataforma.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patients WHERE account_id = v_uid) THEN
    RAISE EXCEPTION 'account_already_linked' USING ERRCODE = '23505';
  END IF;

  -- FOR UPDATE fecha a corrida de dois aceites do mesmo token.
  SELECT * INTO v_invitation
    FROM public.patient_invitations
   WHERE token_hash = extensions.digest(p_token, 'sha256')
     AND status = 'pending'
     AND expires_at > pg_catalog.now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient
    FROM public.patients
   WHERE id = v_invitation.patient_id
     AND is_active
     AND account_id IS NULL
   FOR UPDATE;

  -- ERRO GENERICO E UNICO para token inexistente, usado ou vencido, CPF que nao
  -- corresponde, data que nao corresponde E DATA AUSENTE. IS DISTINCT FROM, e
  -- nao `<>`: com `<>`, um argumento nulo tornava o termo NULL e o IF deixava
  -- passar — foi o defeito que esta migration corrige.
  IF NOT FOUND
     OR v_patient.cpf        IS DISTINCT FROM v_cpf
     OR v_patient.birth_date IS DISTINCT FROM p_birth_date THEN
    RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
     SET account_id = v_uid
   WHERE id = v_patient.id;

  UPDATE public.patient_invitations
     SET status = 'accepted', accepted_at = pg_catalog.now()
   WHERE id = v_invitation.id;

  RETURN v_patient.id;
END;
$$;

COMMENT ON FUNCTION public.accept_patient_invitation(text, text, date) IS
  'Liga a ficha a conta autenticada. Dois fatores: token (posse) + CPF e nascimento (conhecimento), os dois OBRIGATORIOS — nulo nao passa (IS DISTINCT FROM, 25/09/2026). Erro sempre generico, para nao virar oraculo de CPF.';
