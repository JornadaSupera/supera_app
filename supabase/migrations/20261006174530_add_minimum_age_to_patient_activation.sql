-- A conta do app so se liga a ficha de quem tem 18 anos ou mais. Pendencia
-- [36] do time, Fase L (06/10/2026). Racional: ADR-020, emenda §9. A regra dos
-- 18 anos e PROVISORIA ate a CEON (controladora) confirmar (L-D1); o art. 14
-- da LGPD a reforca.
--
-- Quatro funcoes, todas por CREATE OR REPLACE com a MESMA assinatura (sem
-- DROP, o ACL e preservado), cada uma copiada da versao vigente e mudada so
-- no necessario:
--
--   a) link_patient_by_verified_phone(text, date) — de
--      20260929152633_add_contested_check_to_link_patient.sql. Devolve
--      {"linked": false, "error": "underage"} DEPOIS do grande
--      `invalid_invitation`, e nao antes. Hoje toda divergencia responde
--      `invalid_invitation` para a funcao nao ser oraculo de CPF; um `underage`
--      logo depois de achar a ficha diria que aquele CPF e de um menor de
--      idade. Depois que CPF, nascimento e celular conferem, quem chama ja
--      sabe a propria data. NAO grava em private.patient_link_attempts: nao e
--      erro de conhecimento.
--
--   b) accept_patient_invitation(text, text, date) — de
--      20260925115825_fix_patient_invitation_birth_date.sql (nenhuma migration
--      posterior a redefine; a do NPS do primeiro acesso so cria um gatilho).
--      A funcao retorna uuid e recusa com EXCECAO, e "recusa da mesma forma"
--      e excecao: `underage`, 42501, tambem depois da verificacao. O convite
--      fica `pending`: se a data da ficha for corrigida, ele volta a valer.
--
--   c) invite_patient(uuid, text, interval) — de
--      20260911210934_create_patient_registry.sql (nunca redefinida). NAO
--      ESTAVA NO PEDIDO: sem ela, a recepcao mandaria a um menor de idade um
--      codigo que nunca funcionaria. `underage`, 23514, depois de
--      `patient_inactive` e antes de `missing_destination`. Sem oraculo: quem
--      chama e administrador e ja ve a ficha.
--
--   d) issue_patient_sms_invite(uuid) — de
--      20260925133545_create_patient_sms_invite.sql. A mesma recusa, antes de
--      `invalid_phone`: "corrija o celular" nao resolveria nada.
--
-- O que NAO muda: a ligacao ja feita continua. Se o Gemed corrigir depois a
-- data e o paciente ficar com menos de 18 anos, nada se desliga sozinho (L-D3,
-- gatilho de revisao da ADR-020). E a ficha de menor de idade continua
-- existindo: so nao se liga ao app.


-- ============================================================
-- 1. Ligacao pelo celular confirmado
-- ============================================================

CREATE OR REPLACE FUNCTION public.link_patient_by_verified_phone(
  p_cpf        text,
  p_birth_date date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER              -- le auth.users e private.phone_confirmations, grava em private.patient_link_attempts
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_cpf           text := private.normalize_cpf(p_cpf);
  v_attempts      bigint;
  v_raw_phone     text;
  v_confirmed_at  timestamptz;
  v_contested     boolean;
  v_account_phone text;
  v_patient_phone text;
  v_patient       public.patients;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE na conta serializa as chamadas da mesma conta: sem ele, cinco
  -- chamadas simultaneas leriam, cada uma, "4 tentativas" e passariam juntas.
  PERFORM 1 FROM public.accounts WHERE id = v_uid AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Mesma guarda do convite (ADR-020 §4): a conta nao pode ja exercer outro
  -- papel, ou a ligacao seria escalada ao sigilo da psicologia.
  IF EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.caregivers    WHERE account_id = v_uid) THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'account_has_other_profile');
  END IF;

  IF EXISTS (SELECT 1 FROM public.patients WHERE account_id = v_uid) THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'account_already_linked');
  END IF;

  -- O limite vem ANTES de olhar a ficha: a sexta chamada da hora e recusada
  -- mesmo com os dados certos, ou o limite nao limitaria nada.
  SELECT pg_catalog.count(*) INTO v_attempts
    FROM private.patient_link_attempts
   WHERE account_id = v_uid
     AND attempted_at > pg_catalog.now() - interval '1 hour';

  IF v_attempts >= 5 THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'too_many_attempts');
  END IF;

  -- `phone_confirmed_at` e o carimbo que o Auth grava quando o codigo do SMS
  -- confere. Enquanto a troca de celular esta pendente, o numero novo mora em
  -- `phone_change` e `phone` segue o antigo (ou vazio) — por isso le-se `phone`.
  SELECT u.phone, u.phone_confirmed_at
    INTO v_raw_phone, v_confirmed_at
    FROM auth.users u
   WHERE u.id = v_uid;

  IF v_confirmed_at IS NULL OR pg_catalog.btrim(coalesce(v_raw_phone, '')) = '' THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'phone_not_verified');
  END IF;

  -- O carimbo so vale com o registro gravado pelo trigger no mesmo instante e
  -- para o mesmo numero (ADR-020 §8). Sem registro: fail-closed (D2).
  SELECT pc.contested INTO v_contested
    FROM private.phone_confirmations pc
   WHERE pc.account_id   = v_uid
     AND pc.confirmed_at = v_confirmed_at
     AND pc.phone        = v_raw_phone;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'phone_not_verified');
  END IF;

  -- Outra conta disputava o numero na confirmacao: o codigo pode ter sido o
  -- dela. Nao conta tentativa (D3) — nada aqui fala da ficha.
  IF v_contested THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'phone_contested');
  END IF;

  -- `cpf` e UNIQUE e guardado so com digitos. FOR UPDATE fecha a corrida de
  -- duas contas ligando a mesma ficha.
  SELECT * INTO v_patient
    FROM public.patients
   WHERE cpf = v_cpf
   FOR UPDATE;

  v_account_phone := private.normalize_br_phone(v_raw_phone);
  v_patient_phone := private.normalize_br_phone(v_patient.phone);

  -- Cada termo escrito para dar TRUE ou FALSE, nunca NULL: um NULL no meio
  -- de um OR em que nenhum outro termo e TRUE faz o IF nao entrar, e a
  -- ficha ligaria. Foi o defeito do nascimento em 25/09/2026.
  IF NOT FOUND
     OR v_patient.is_active IS NOT TRUE
     OR v_patient.account_id IS NOT NULL
     OR p_birth_date IS NULL
     OR v_patient.birth_date IS DISTINCT FROM p_birth_date
     OR v_account_phone IS NULL
     OR v_patient_phone IS NULL
     OR v_account_phone <> v_patient_phone THEN
    INSERT INTO private.patient_link_attempts (account_id) VALUES (v_uid);
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'invalid_invitation');
  END IF;

  -- A idade minima vem DEPOIS da verificacao, e a ordem e a correcao de
  -- seguranca (Fase L, ADR-020 §9). Se `underage` saisse logo depois de achar
  -- a ficha pelo CPF, a funcao diria a quem tenta que aquele CPF e de um
  -- paciente menor de idade. Aqui, CPF, nascimento e celular ja conferiram:
  -- quem chama sabe a propria data, e a resposta nao revela nada novo. Nao
  -- conta tentativa — nao e erro de conhecimento.
  IF private.is_of_minimum_age(v_patient.birth_date) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('linked', false, 'error', 'underage');
  END IF;

  -- trg_audit_write grava a ligacao na trilha; trg_open_first_access_nps abre
  -- a pesquisa do primeiro acesso. Os dois disparam aqui como no convite.
  UPDATE public.patients
     SET account_id = v_uid
   WHERE id = v_patient.id;

  -- O convite pendente perde o sentido: a ficha ja tem conta, e o token
  -- aceitaria de novo so para falhar em `invalid_invitation`. Cancelado, sai
  -- da fila de reenvio do painel.
  UPDATE public.patient_invitations
     SET status = 'cancelled', cancelled_at = pg_catalog.now()
   WHERE patient_id = v_patient.id
     AND status = 'pending';

  RETURN pg_catalog.jsonb_build_object('linked', true, 'patient_id', v_patient.id);
END;
$$;

COMMENT ON FUNCTION public.link_patient_by_verified_phone(text, date) IS
  'Liga a ficha a conta autenticada pelo celular confirmado no Auth (posse) + CPF e nascimento (conhecimento). Devolve jsonb {linked, patient_id} ou {linked:false, error}; so a falta de sessao e excecao. 5 erros invalid_invitation por hora por conta, depois too_many_attempts (decisao B-1, 29/09/2026). Confirmacao sem registro em private.phone_confirmations: phone_not_verified; confirmacao contestada por outra conta: phone_contested, sem contar tentativa (ADR-020 §8). Ficha de menor de 18 anos: underage, so DEPOIS de CPF, nascimento e celular conferirem, sem contar tentativa (ADR-020 §9).';


-- ============================================================
-- 2. Aceite do convite
-- ============================================================

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

  -- Idade minima DEPOIS do token, do CPF e do nascimento: antes, seria oraculo
  -- (Fase L, ADR-020 §9). O convite fica `pending`: se a data da ficha estava
  -- errada e for corrigida, o mesmo convite volta a funcionar.
  IF private.is_of_minimum_age(v_patient.birth_date) IS NOT TRUE THEN
    RAISE EXCEPTION 'underage'
      USING ERRCODE = '42501',
            HINT    = 'Para usar o app e preciso ter 18 anos ou mais.';
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
  'Liga a ficha a conta autenticada. Dois fatores: token (posse) + CPF e nascimento (conhecimento), os dois OBRIGATORIOS — nulo nao passa (IS DISTINCT FROM, 25/09/2026). Erro sempre generico, para nao virar oraculo de CPF. Ficha de menor de 18 anos: excecao underage (42501), so DEPOIS de os dois fatores conferirem; o convite segue pendente (ADR-020 §9).';


-- ============================================================
-- 3. Emissao do convite
-- ============================================================

CREATE OR REPLACE FUNCTION public.invite_patient(
  p_patient_id  uuid,
  p_destination text     DEFAULT NULL,
  p_valid_for   interval DEFAULT interval '7 days'
)
RETURNS TABLE (invitation_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient     public.patients;
  v_destination text;
  v_token       text;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  -- ORDEM DAS RECUSAS, e ela nao e estetica: a checagem de destino vinha antes
  -- e mascarava as duas abaixo. Convidar ficha JA ATIVADA cujo telefone esta em
  -- branco devolvia "falta o destino", mandando quem opera preencher um
  -- telefone que nao resolveria nada. O erro mais especifico vem primeiro.
  IF v_patient.account_id IS NOT NULL THEN
    RAISE EXCEPTION 'patient_already_activated'
      USING ERRCODE = '23505',
            HINT    = 'Desvincule a conta antes de convidar de novo (unlink_patient_account).';
  END IF;

  IF NOT v_patient.is_active THEN
    RAISE EXCEPTION 'patient_inactive' USING ERRCODE = '42501';
  END IF;

  -- Ficha de menor de 18 anos existe (a clinica atende menores), mas nao se
  -- liga ao app (Fase L, ADR-020 §9). Sem esta recusa, a recepcao mandaria um
  -- codigo que nunca funcionaria. Sem risco de oraculo: quem chama e
  -- administrador e ja ve a ficha. Antes de `missing_destination`, pela ordem
  -- das recusas acima: preencher o telefone nao resolveria nada.
  IF private.is_of_minimum_age(v_patient.birth_date) IS NOT TRUE THEN
    RAISE EXCEPTION 'underage'
      USING ERRCODE = '23514',
            HINT    = 'Ficha de menor de 18 anos nao pode ser ligada ao app.';
  END IF;

  v_destination := pg_catalog.btrim(coalesce(p_destination, v_patient.phone, ''));
  IF v_destination = '' THEN
    RAISE EXCEPTION 'missing_destination'
      USING ERRCODE = '23514',
            HINT    = 'Preencha o telefone da ficha ou informe o destino do convite.';
  END IF;

  -- REENVIO CANCELA O ANTERIOR, e nao e cortesia: o indice unico parcial
  -- recusaria o segundo pendente, e o motivo de fundo e que o convite antigo
  -- continuaria aceitavel. Quem reenvia costuma estar corrigindo o telefone —
  -- deixar o token anterior vivo manteria valido exatamente o convite que foi
  -- para o numero errado.
  UPDATE public.patient_invitations
     SET status = 'cancelled', cancelled_at = pg_catalog.now()
   WHERE patient_id = p_patient_id
     AND status = 'pending';

  -- 32 bytes de CSPRNG, 64 caracteres em hex.
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.patient_invitations
    (patient_id, destination, token_hash, expires_at, invited_by_account)
  VALUES
    (p_patient_id,
     v_destination,
     extensions.digest(v_token, 'sha256'),
     pg_catalog.now() + p_valid_for,
     auth.uid())
  RETURNING id INTO invitation_id;

  token := v_token;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.invite_patient(uuid, text, interval) IS
  'Emite o convite de ativacao e devolve o token uma unica vez. Reenviar cancela o pendente anterior. Janela default de 7 dias e NOSSA, declarada — trocar e parametro, nao migration. Ficha de menor de 18 anos: underage (23514), nenhum convite emitido (ADR-020 §9).';

CREATE OR REPLACE FUNCTION public.issue_patient_sms_invite(p_patient_id uuid)
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

  -- Antes de `invalid_phone`, pela ordem das recusas: a ficha de menor de
  -- idade sem celular responderia "corrija o celular", e a correcao nao
  -- resolveria nada. invite_patient confere de novo (Fase L, ADR-020 §9).
  IF private.is_of_minimum_age(v_patient.birth_date) IS NOT TRUE THEN
    RAISE EXCEPTION 'underage'
      USING ERRCODE = '23514',
            HINT    = 'Ficha de menor de 18 anos nao pode ser ligada ao app.';
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
  'Convite para envio por SMS: valida o celular da ficha, chama invite_patient e devolve token, celular E.164 e validade. So para a Edge Function send-patient-invite, que nunca devolve o token ao painel. Ficha de menor de 18 anos: underage (23514), antes de invalid_phone (ADR-020 §9).';


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================
--
-- CREATE OR REPLACE preserva o ACL; repetir custa pouco e asserta o efeito.

REVOKE EXECUTE ON FUNCTION public.link_patient_by_verified_phone(text, date)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_patient_invitation(text, text, date)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_patient(uuid, text, interval)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.issue_patient_sms_invite(uuid)               FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.link_patient_by_verified_phone(text, date)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_patient_invitation(text, text, date)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_patient(uuid, text, interval)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_patient_sms_invite(uuid)                TO authenticated;

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.link_patient_by_verified_phone(text, date)',
    'public.accept_patient_invitation(text, text, date)',
    'public.invite_patient(uuid, text, interval)',
    'public.issue_patient_sms_invite(uuid)'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated sem EXECUTE em %', v_fn;
    END IF;
    -- Dono postgres: e contra ele que o EXECUTE dos helpers privados e
    -- conferido, e e ele que le auth.users na ligacao pelo celular.
    IF pg_catalog.pg_get_userbyid(
         (SELECT p.proowner FROM pg_catalog.pg_proc p
           WHERE p.oid = v_fn::pg_catalog.regprocedure)
       ) <> 'postgres' THEN
      RAISE EXCEPTION '% precisa ser de postgres', v_fn;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;

  -- Os helpers continuam internos: chamados so de dentro das funcoes acima.
  IF pg_catalog.has_function_privilege('authenticated', 'private.is_of_minimum_age(date, date)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'private.clinic_today()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated alcanca os helpers da idade minima';
  END IF;
END;
$$;
