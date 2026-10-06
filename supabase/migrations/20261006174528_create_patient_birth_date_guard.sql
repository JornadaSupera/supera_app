-- A data de nascimento no futuro e recusada, e o banco ganha o helper da idade
-- minima. Pendencia [36] do time, Fase L (06/10/2026). Racional: ADR-020,
-- emenda §9.
--
-- TRES OBJETOS:
--
--   * private.clinic_today() — o "hoje" no fuso da clinica
--     (clinic_settings.time_zone), e nao no do servidor (UTC). Entre 21h e
--     meia-noite em Chapeco, o UTC ja esta no dia seguinte: quem faz 18 anos
--     amanha passaria hoje a noite. O fuso nao e escrito no codigo, como o
--     pedido sugeria: a configuracao ja existe e e da clinica. Sem a linha,
--     'America/Sao_Paulo', o mesmo default da coluna.
--
--   * private.is_of_minimum_age(date, date) — 18 anos completos no hoje da clinica.
--     `data + 18 anos <= hoje`, escrito como `data <= hoje - 18 anos`: quem faz
--     18 anos hoje passa; quem nasceu em 29/02 passa em 01/03 dos anos nao
--     bissextos (L-D2), porque `01/03/2026 - 18 anos` e `01/03/2008`, e
--     `28/02/2026 - 18 anos` e `28/02/2008`, antes do dia 29. NULL devolve
--     NULL: quem usa o helper testa `IS NOT TRUE`, e a falta da data reprova.
--     A regra dos 18 anos e PROVISORIA ate a CEON confirmar (L-D1).
--
--   * o gatilho trg_reject_future_birth_date em public.patients.
--
-- POR QUE GATILHO, E NAO SO NAS RPCs: a data tambem chega do Gemed, pela
-- sincronizacao com service_role, que nao passa por create_patient. O que roda
-- com service_role ignora RLS e RPC; a regra tem de estar no gatilho.
--
-- POR QUE NAO UM CHECK: `CHECK (birth_date <= current_date)` depende do
-- relogio. Nao e imutavel, e um restore poderia recusar a linha que o banco
-- aceitou ontem.
--
-- A ARMADILHA DO COALESCE: update_patient faz
-- `birth_date = coalesce(p_birth_date, birth_date)`, entao a coluna esta SEMPRE
-- no SET, e `UPDATE OF birth_date` dispara em TODO update_patient. Uma ficha
-- antiga com data no futuro ficaria impossivel de editar, ate no telefone. Por
-- isso o UPDATE so recusa quando a data MUDA. A data errada que ja esta la
-- continua errada, e o levantamento da homologacao a aponta (Fase L §5).
--
-- Ficha de menor de idade CONTINUA ACEITA: a clinica atende menores. So a
-- data no futuro e recusada. A idade minima vale para LIGAR a conta do app
-- (add_minimum_age_to_patient_activation), nao para existir.


-- ============================================================
-- 1. O hoje da clinica
-- ============================================================

CREATE FUNCTION private.clinic_today()
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT (pg_catalog.now() AT TIME ZONE coalesce(
            (SELECT s.time_zone FROM public.clinic_settings s WHERE s.id = 1),
            'America/Sao_Paulo'))::date
$$;

COMMENT ON FUNCTION private.clinic_today() IS
  'Hoje no fuso de clinic_settings.time_zone (linha 1), America/Sao_Paulo sem a linha. Helper interno: so chamado por funcoes SECURITY DEFINER de postgres (Fase L, ADR-020 §9).';


-- ============================================================
-- 2. A idade minima
-- ============================================================

-- `p_on` existe para o TESTE: o 29/02 so se prova contra um "hoje" construido
-- (28/02 e 01/03 de ano nao bissexto), e clinic_today() nao se simula. As
-- funcoes que aplicam a regra passam so a data de nascimento.
CREATE FUNCTION private.is_of_minimum_age(
  p_birth_date date,
  p_on         date DEFAULT private.clinic_today()
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT p_birth_date <= (p_on - interval '18 years')::date
$$;

COMMENT ON FUNCTION private.is_of_minimum_age(date, date) IS
  '18 anos completos em p_on (default: o hoje da clinica). Aniversario hoje passa; 29/02 passa em 01/03 nos anos nao bissextos. NULL devolve NULL: testar com IS NOT TRUE. Regra PROVISORIA ate a CEON confirmar (L-D1, ADR-020 §9).';


-- ============================================================
-- 3. A data no futuro
-- ============================================================

-- SECURITY DEFINER pelo mesmo motivo de reject_activated_cpf_change: quem
-- insere pode ser service_role (Gemed), que nao tem USAGE em `private` nem
-- EXECUTE nos helpers. A funcao so le e recusa; nao devolve dado.
CREATE FUNCTION private.reject_future_birth_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  -- O UPDATE que nao muda a data passa: e a armadilha do coalesce de
  -- update_patient (cabecalho). Sem isto, a ficha antiga com data no futuro
  -- ficaria sem edicao nenhuma.
  IF TG_OP = 'UPDATE' AND NEW.birth_date IS NOT DISTINCT FROM OLD.birth_date THEN
    RETURN NEW;
  END IF;

  IF NEW.birth_date > private.clinic_today() THEN
    RAISE EXCEPTION 'birth_date_in_future'
      USING ERRCODE = '23514',
            HINT    = 'A data de nascimento nao pode ser posterior a hoje.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.reject_future_birth_date() IS
  'Recusa nascimento depois do hoje da clinica (birth_date_in_future, 23514). Gatilho e nao RPC: o Gemed escreve com service_role. No UPDATE, so quando a data muda (armadilha do coalesce de update_patient).';

CREATE TRIGGER trg_reject_future_birth_date
  BEFORE INSERT OR UPDATE OF birth_date ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_future_birth_date();


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================
--
-- Os tres sao internos. As funcoes que os chamam sao SECURITY DEFINER de
-- postgres, e o EXECUTE e conferido contra o dono delas, nao contra quem
-- chama a RPC.

REVOKE EXECUTE ON FUNCTION private.clinic_today()              FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.is_of_minimum_age(date, date)     FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.reject_future_birth_date()  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'private.clinic_today()',
    'private.is_of_minimum_age(date, date)',
    'private.reject_future_birth_date()'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE')
       OR pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon ou authenticated alcanca %', v_fn;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.uuid_generate_v7()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu get_my_uid/uuid_generate_v7';
  END IF;

  IF pg_catalog.pg_get_userbyid(
       (SELECT p.proowner FROM pg_catalog.pg_proc p
         WHERE p.oid = 'private.reject_future_birth_date()'::pg_catalog.regprocedure)
     ) <> 'postgres' THEN
    RAISE EXCEPTION 'reject_future_birth_date precisa ser de postgres: e quem chama os helpers';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.patients'::pg_catalog.regclass
       AND tgname  = 'trg_reject_future_birth_date'
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'gatilho trg_reject_future_birth_date ausente ou desligado';
  END IF;
END;
$$;
