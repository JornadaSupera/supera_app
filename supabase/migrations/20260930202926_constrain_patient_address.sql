-- O endereco do paciente ganha formato: sete chaves de texto, todas
-- opcionais, e o objeto vazio passa a limpar o campo.
-- Plano das pendencias do painel de 30/09/2026, Fase E, item E.7
-- (pergunta 3 do painel, decisao D10 de 30/09/2026).
-- Design e racional: supera-docs/ADRs/ADR-020 — Ativação da conta do paciente.md
--
-- COMO ESTAVA. patients.address era jsonb com um so CHECK: ser objeto. Sem
-- chaves definidas, cada tela gravaria o seu formato, e o espelhamento do
-- Gemed (que traz `endereco` no PacienteContract) teria de adivinhar qual. E
-- update_patient nao conseguia apagar o endereco: o coalesce trata nulo como
-- "nao mexer".
--
-- O FORMATO (D10). Objeto com as chaves
--   cep, logradouro, numero, complemento, bairro, cidade, uf
-- alinhadas ao `endereco` do PacienteContract do Gemed. Todas texto, todas
-- opcionais. `numero` e texto de proposito: "S/N", "120-A", "km 4". `uf` casa
-- ^[A-Z]{2}$. Chave fora da lista e recusada: e o que impede o formato de
-- derivar de novo.
--
-- O CHECK nao valida CEP nem a lista das 27 UFs: formato de CEP e mascara de
-- tela, e a UF errada com duas letras maiusculas e erro de digitacao que o
-- banco nao tem como distinguir de dado legitimo sem uma tabela que ninguem
-- pediu.
--
-- LIMPAR. create_patient e update_patient passam a:
--   - remover chaves com valor null (`{"complemento": null}` apaga o
--     complemento, em vez de ser recusado por nao ser texto);
--   - tratar o objeto que sobra vazio, `{}`, como "sem endereco" (NULL).
-- Em update_patient, argumento nulo continua significando "nao mexer".
--
-- A constraint nasce NOT VALID e valida em validate_phase_e_constraints.
-- ANTES DO db push, conferir em homologacao (so leitura) que nenhuma ficha
-- viola — a consulta esta no comentario de validate_phase_e_constraints.


-- ============================================================
-- 1. A constraint de formato
-- ============================================================
--
-- `address - ARRAY[...]` remove as chaves conhecidas: o que sobra tem de ser
-- vazio. jsonb_path_exists com a expressao sem `_tz` e IMMUTABLE, e por isso
-- cabe num CHECK. O CHECK antigo (ser objeto) fica: ele da o erro mais claro
-- para o caso mais grosseiro.
ALTER TABLE public.patients
  ADD CONSTRAINT ck_patients_address_shape
  CHECK (
    address IS NULL
    OR (
      jsonb_typeof(address) = 'object'
      AND (address - ARRAY['cep', 'logradouro', 'numero', 'complemento',
                           'bairro', 'cidade', 'uf']) = '{}'::jsonb
      AND NOT jsonb_path_exists(address, '$.* ? (@.type() != "string")')
      AND (NOT (address ? 'uf') OR (address ->> 'uf') ~ '^[A-Z]{2}$')
    )
  )
  NOT VALID;

COMMENT ON CONSTRAINT ck_patients_address_shape ON public.patients IS
  'Endereco: objeto com as chaves cep, logradouro, numero, complemento, bairro, cidade e uf, todas texto e opcionais; uf com duas letras maiusculas. Alinhado ao endereco do PacienteContract do Gemed (D10, 30/09/2026).';


-- ============================================================
-- 2. A normalizacao da entrada
-- ============================================================

CREATE FUNCTION private.normalize_patient_address(p_address jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
           WHEN p_address IS NULL THEN NULL
           -- So objeto e normalizado. O resto segue como veio e o CHECK
           -- recusa com a mensagem da constraint.
           WHEN pg_catalog.jsonb_typeof(p_address) <> 'object' THEN p_address
           WHEN pg_catalog.jsonb_strip_nulls(p_address) = '{}'::jsonb THEN NULL
           ELSE pg_catalog.jsonb_strip_nulls(p_address)
         END;
$$;

COMMENT ON FUNCTION private.normalize_patient_address(jsonb) IS
  'Tira as chaves com valor null do endereco e transforma o objeto vazio em NULL. Usada por create_patient e update_patient.';


-- ============================================================
-- 3. create_patient
-- ============================================================
--
-- Unica mudanca: o endereco passa por normalize_patient_address.
-- CREATE OR REPLACE preserva o ACL.

CREATE OR REPLACE FUNCTION public.create_patient(
  p_full_name      text,
  p_cpf            text,
  p_birth_date     date,
  p_phone          text  DEFAULT NULL,
  p_email          text  DEFAULT NULL,
  p_address        jsonb DEFAULT NULL,
  p_insurance_name text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpf         text := private.normalize_cpf(p_cpf);
  v_id          uuid;
  v_existing    public.patients;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_cpf !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'invalid_cpf'
      USING ERRCODE = '22023',
            DETAIL  = 'CPF precisa ter 11 digitos.';
  END IF;

  -- Erro distinguivel em vez da violacao de UNIQUE (comentario original em
  -- create_patient_registry, ADR-020 §3).
  SELECT * INTO v_existing FROM public.patients WHERE cpf = v_cpf;
  IF FOUND THEN
    IF v_existing.is_active THEN
      RAISE EXCEPTION 'patient_cpf_already_registered'
        USING ERRCODE = '23505',
              DETAIL  = pg_catalog.format('patient_id=%s', v_existing.id),
              HINT    = 'Abra a ficha existente em vez de cadastrar de novo.';
    ELSE
      RAISE EXCEPTION 'patient_cpf_registered_inactive'
        USING ERRCODE = '23505',
              DETAIL  = pg_catalog.format('patient_id=%s', v_existing.id),
              HINT    = 'A ficha existe e esta desativada. Reative com set_patient_active.';
    END IF;
  END IF;

  INSERT INTO public.patients
    (full_name, cpf, birth_date, phone, email, address, insurance_name)
  VALUES
    (pg_catalog.btrim(p_full_name), v_cpf, p_birth_date,
     pg_catalog.btrim(p_phone), pg_catalog.btrim(p_email)::extensions.citext,
     private.normalize_patient_address(p_address), pg_catalog.btrim(p_insurance_name))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;


-- ============================================================
-- 4. update_patient — `{}` limpa
-- ============================================================
--
-- Parte da versao de mask_patient_identifiers (recusa do valor mascarado).

CREATE OR REPLACE FUNCTION public.update_patient(
  p_patient_id     uuid,
  p_full_name      text  DEFAULT NULL,
  p_cpf            text  DEFAULT NULL,
  p_birth_date     date  DEFAULT NULL,
  p_phone          text  DEFAULT NULL,
  p_email          text  DEFAULT NULL,
  p_address        jsonb DEFAULT NULL,
  p_insurance_name text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpf text := CASE WHEN p_cpf IS NULL THEN NULL ELSE private.normalize_cpf(p_cpf) END;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF pg_catalog.strpos(coalesce(p_cpf, '') || coalesce(p_phone, '') || coalesce(p_email, ''), '*') > 0 THEN
    RAISE EXCEPTION 'masked_value_rejected'
      USING ERRCODE = '22023',
            HINT    = 'CPF, telefone e e-mail chegam mascarados em read_patient. Envie NULL para manter o valor, ou o valor completo para troca-lo.';
  END IF;

  IF v_cpf IS NOT NULL AND v_cpf !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'invalid_cpf' USING ERRCODE = '22023';
  END IF;

  -- Argumento nulo = "nao mexer", como sempre. O endereco e a excecao que
  -- sabe limpar: p_address = '{}' (ou so com chaves nulas) grava NULL.
  UPDATE public.patients
     SET full_name      = coalesce(pg_catalog.btrim(p_full_name), full_name),
         cpf            = coalesce(v_cpf, cpf),
         birth_date     = coalesce(p_birth_date, birth_date),
         phone          = coalesce(pg_catalog.btrim(p_phone), phone),
         email          = coalesce(pg_catalog.btrim(p_email)::extensions.citext, email),
         address        = CASE WHEN p_address IS NULL THEN address
                               ELSE private.normalize_patient_address(p_address) END,
         insurance_name = coalesce(pg_catalog.btrim(p_insurance_name), insurance_name)
   WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text) IS
  'Corrige a ficha. Argumento nulo = coluna inalterada (logo, nao apaga contato). Endereco `{}` limpa o campo; chave fora das sete do formato e recusada (23514). Recusa valor mascarado (masked_value_rejected). CPF so muda antes da ativacao (trigger).';


-- ============================================================
-- 5. Privilegios — no fim
-- ============================================================
--
-- normalize_patient_address roda dentro de RPC SECURITY DEFINER (como o dono),
-- mas o default privilege do Supabase a abriria a anon: fecha e concede so a
-- quem chama as RPCs, como normalize_cpf.
REVOKE EXECUTE ON FUNCTION private.normalize_patient_address(jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.normalize_patient_address(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_patient(text, text, date, text, text, jsonb, text)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_patient(text, text, date, text, text, jsonb, text)       TO authenticated;
GRANT  EXECUTE ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text) TO authenticated;
