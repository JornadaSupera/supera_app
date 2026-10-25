-- A pre-checagem da ativacao: confere a ficha ANTES do SMS. Pendencia [44]
-- do time (07/10 e 24/10/2026). Racional: ADR-020, emenda §11.
--
-- O PROBLEMA: o app cria a conta, confirma o celular por SMS e so entao
-- chama link_patient_by_verified_phone. Quem nao tem ficha gasta um SMS antes
-- de ver `invalid_invitation`.
--
-- O PEDIDO ERA OUTRO, e foi recusado: uma funcao `anon`, so com o CPF,
-- limitada por IP lido de `x-forwarded-for`. Dois defeitos:
--   * CPF nao e segredo, e "este CPF e paciente de um centro de oncologia" e
--     dado de saude (LGPD art. 11). Seria o oraculo de CPF que a ADR-020
--     proibe desde a primeira versao.
--   * O primeiro elemento de `x-forwarded-for` e o que o cliente mandar
--     (medido na ADR-022 §3). O limite por IP nao limitaria ninguem.
--
-- O DESENHO: com login, os TRES dados que a ficha confere (CPF, nascimento e
-- o celular que a pessoa vai confirmar) e o MESMO contador da ligacao, 5
-- erros por hora por conta. So descobre que alguem e paciente quem ja sabe os
-- tres dados da ficha. O que se perde em relacao a hoje: testar o trio nao
-- exige mais ter o celular. O contador compartilhado e de proposito: um
-- `not_eligible` aqui e um `invalid_invitation` la somam no mesmo limite, e a
-- soma das duas portas continua 5 por hora.
--
-- As guardas sao copiadas, na mesma ordem, da versao vigente de
-- link_patient_by_verified_phone (20261006174530_add_minimum_age_to_patient_activation.sql),
-- que NAO muda. A suite confere que as duas concordam.


-- ============================================================
-- 1. A funcao
-- ============================================================

CREATE FUNCTION public.check_patient_activation(
  p_cpf        text,
  p_birth_date date,
  p_phone      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER              -- le patients e grava em private.patient_link_attempts
SET search_path = ''
AS $$
DECLARE
  v_uid           uuid := auth.uid();
  v_cpf           text := private.normalize_cpf(p_cpf);
  v_typed_phone   text := private.normalize_br_phone(p_phone);
  v_attempts      bigint;
  v_patient_phone text;
  v_patient       public.patients;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE na conta serializa as chamadas da mesma conta, aqui e na
  -- ligacao: sem ele, chamadas simultaneas leriam "4 tentativas" e passariam.
  PERFORM 1 FROM public.accounts WHERE id = v_uid AND is_active FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.caregivers    WHERE account_id = v_uid) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'account_has_other_profile');
  END IF;

  IF EXISTS (SELECT 1 FROM public.patients WHERE account_id = v_uid) THEN
    RETURN pg_catalog.jsonb_build_object('status', 'account_already_linked');
  END IF;

  -- O limite vem ANTES de olhar a ficha: a sexta chamada da hora e recusada
  -- mesmo com os dados certos, ou o limite nao limitaria nada.
  SELECT pg_catalog.count(*) INTO v_attempts
    FROM private.patient_link_attempts
   WHERE account_id = v_uid
     AND attempted_at > pg_catalog.now() - interval '1 hour';

  IF v_attempts >= 5 THEN
    RETURN pg_catalog.jsonb_build_object('status', 'too_many_attempts');
  END IF;

  -- So leitura: sem FOR UPDATE. A corrida de duas contas pela mesma ficha e
  -- da ligacao, que trava a linha.
  SELECT * INTO v_patient
    FROM public.patients
   WHERE cpf = v_cpf;

  v_patient_phone := private.normalize_br_phone(v_patient.phone);

  -- Cada termo escrito para dar TRUE ou FALSE, nunca NULL: um NULL no meio
  -- de um OR em que nenhum outro termo e TRUE faz o IF nao entrar, e a
  -- resposta seria `eligible`. Foi o defeito do nascimento em 25/09/2026.
  IF NOT FOUND
     OR v_patient.is_active IS NOT TRUE
     OR v_patient.account_id IS NOT NULL
     OR p_birth_date IS NULL
     OR v_patient.birth_date IS DISTINCT FROM p_birth_date
     OR v_typed_phone IS NULL
     OR v_patient_phone IS NULL
     OR v_typed_phone <> v_patient_phone THEN
    INSERT INTO private.patient_link_attempts (account_id) VALUES (v_uid);
    RETURN pg_catalog.jsonb_build_object('status', 'not_eligible');
  END IF;

  -- A idade minima DEPOIS da verificacao, como na ligacao (ADR-020 §9): antes,
  -- diria que aquele CPF e de um paciente menor de idade. Nao conta tentativa.
  IF private.is_of_minimum_age(v_patient.birth_date) IS NOT TRUE THEN
    RETURN pg_catalog.jsonb_build_object('status', 'underage');
  END IF;

  RETURN pg_catalog.jsonb_build_object('status', 'eligible');
END;
$$;

COMMENT ON FUNCTION public.check_patient_activation(text, date, text) IS
  'Pre-checagem da ativacao, ANTES do SMS (pendencia [44], ADR-020 §11). Conta autenticada, CPF + nascimento + o celular que vai confirmar. Devolve so {status}: eligible, not_eligible, underage, too_many_attempts, account_already_linked ou account_has_other_profile; so a falta de sessao e excecao. not_eligible e indistinguivel de proposito e conta no MESMO limite da ligacao (5 por hora por conta). Nao grava nada quando confere: a ligacao continua sendo link_patient_by_verified_phone.';

COMMENT ON TABLE private.patient_link_attempts IS
  'Uma linha por tentativa FRACASSADA de conferir a ficha: a ligacao pelo celular confirmado (invalid_invitation) e a pre-checagem antes do SMS (not_eligible), no mesmo limite. So conta e instante — nunca o CPF, a data ou o telefone tentados. Janela de 1 h; apagada depois de 1 dia.';


-- ============================================================
-- 2. Privilegios — SEMPRE no fim
-- ============================================================
--
-- `FROM PUBLIC, anon`: o default privilege do Supabase concede a `anon` toda
-- funcao nova em `public` (armadilha 5), e revogar so de um deixa o outro.

REVOKE EXECUTE ON FUNCTION public.check_patient_activation(text, date, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.check_patient_activation(text, date, text) TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'public.check_patient_activation(text, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa check_patient_activation: seria o oraculo de CPF sem login';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.check_patient_activation(text, date, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated nao executa check_patient_activation: o app nao conferiria ninguem';
  END IF;
END;
$$;
