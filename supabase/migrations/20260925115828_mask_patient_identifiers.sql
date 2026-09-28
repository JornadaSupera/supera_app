-- Fase 1.3 das pendencias consolidadas (painel P-5): a leitura da ficha
-- devolvia CPF, telefone e e-mail completos. Pre-requisito do primeiro
-- paciente real.
--
-- O QUE MUDA:
--   * read_patient e read_patients passam a devolver cpf, phone e email
--     MASCARADOS, e documents NULO. A assinatura nao muda (SETOF
--     public.patients): a tela que esta no ar continua funcionando, so deixa de
--     receber o identificador completo;
--   * nasce reveal_patient_identifiers(p_patient_id): o valor completo, um
--     paciente por vez, com linha PROPRIA na trilha (resource_table =
--     'patient_identifiers'). "Abriu a ficha" e "revelou o CPF" viram dois
--     eventos distinguiveis — o segundo e o que interessa numa investigacao;
--   * update_patient recusa valor mascarado. Sem isso, o formulario de edicao
--     que devolve o que recebeu gravaria "m***@gmail.com" por cima do e-mail.
--
-- POR QUE NAO UMA FUNCAO NOVA DE LEITURA DA FICHA, como foi feito com
-- read_patient_list (ADR-021 §6): la o retorno ESTREITO era metade do ganho,
-- e a antiga podia conviver. Aqui o ganho e justamente que a antiga pare de
-- expor — manter read_patient devolvendo o CPF inteiro "ate o painel migrar"
-- seria manter o defeito. Mesmo tipo de retorno, colunas com outro conteudo:
-- o painel so precisa de mudanca onde de fato mostra o valor completo.
--
-- A MASCARA segue a de read_patient_list: o bastante para CONFERIR um valor
-- que o operador ja tem em maos, insuficiente para COLETAR um que ele nao tem.
--   cpf    000.***.***-91        (3 primeiros e 2 ultimos digitos)
--   phone  (**) *****-4321       (4 ultimos digitos)
--   email  m***@dominio.com.br   (1a letra do usuario e o dominio)
--
-- ENDERECO FICA INTEIRO, de proposito: o pedido nomeia CPF, telefone e e-mail,
-- e o endereco e o campo que a recepcao le para conferir cadastro. `documents`
-- (hoje sempre nulo; vira de sincronizacao) sai nulo e so aparece no revelar,
-- porque e documento de identidade — a mesma familia do CPF.


-- ============================================================
-- 1. As mascaras
-- ============================================================
--
-- IMMUTABLE e SECURITY INVOKER: sao funcoes de texto, sem tabela nenhuma.

CREATE FUNCTION private.mask_cpf(p_cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_cpf IS NULL THEN NULL
    ELSE pg_catalog.substr(p_cpf, 1, 3) || '.***.***-' || pg_catalog.substr(p_cpf, 10, 2)
  END;
$$;

CREATE FUNCTION private.mask_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  -- Telefone e texto livre (ADR-004: a forma vem de fora). So os digitos
  -- contam; com menos de quatro, nao ha o que mostrar sem mostrar tudo.
  SELECT CASE
    WHEN p_phone IS NULL THEN NULL
    WHEN pg_catalog.length(pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g')) < 4 THEN '(**) *****-****'
    ELSE '(**) *****-' || pg_catalog.right(pg_catalog.regexp_replace(p_phone, '[^0-9]', '', 'g'), 4)
  END;
$$;

CREATE FUNCTION private.mask_email(p_email text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT CASE
    WHEN p_email IS NULL THEN NULL
    WHEN pg_catalog.strpos(p_email, '@') = 0 THEN '***'
    ELSE pg_catalog.left(pg_catalog.split_part(p_email, '@', 1), 1) || '***@'
         || pg_catalog.split_part(p_email, '@', 2)
  END;
$$;

COMMENT ON FUNCTION private.mask_cpf(text) IS
  'Mascara de conferencia: 000.***.***-91. A mesma de read_patient_list.';
COMMENT ON FUNCTION private.mask_phone(text) IS
  'Mascara de conferencia: (**) *****-4321 (quatro ultimos digitos).';
COMMENT ON FUNCTION private.mask_email(text) IS
  'Mascara de conferencia: m***@dominio. Mostra o dominio, que nao identifica ninguem sozinho.';


-- ============================================================
-- 2. As leituras da ficha passam a mascarar
-- ============================================================
--
-- As duas pertencem a `clinical_reader` desde create_clinical_read_audit, e
-- `postgres` nao as substitui de fora ("must be owner of function"). Mesmo
-- caminho de enrich_audit_trail §5: emprestimo de CREATE, SET LOCAL ROLE,
-- devolucao. Substituidas DE DENTRO do papel, continuam dele — e o dono e o que
-- sustenta a RLS dentro delas.
--
-- LACO com RETURN NEXT em vez de listar colunas: a linha e public.patients
-- inteira, e listar colunas a mao quebraria em silencio na proxima coluna
-- nova da tabela. Aqui so as quatro que se mascaram sao nomeadas.

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

CREATE OR REPLACE FUNCTION public.read_patients(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.patients
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   public.patients;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT p.* FROM public.patients p
    ORDER BY p.full_name
    LIMIT LEAST(p_limit, 200) OFFSET p_offset
  LOOP
    v_row.cpf       := private.mask_cpf(v_row.cpf);
    v_row.phone     := private.mask_phone(v_row.phone);
    v_row.email     := private.mask_email(v_row.email::text);
    v_row.documents := NULL;
    v_count := v_count + 1;
    RETURN NEXT v_row;
  END LOOP;
  -- Lista: sem patient_id, com contagem. E a linha que denuncia varredura.
  PERFORM private.log_clinical_read('patients', NULL, v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.read_patient(p_patient_id uuid)
RETURNS SETOF public.patients
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row   public.patients;
  v_count integer := 0;
BEGIN
  FOR v_row IN
    SELECT p.* FROM public.patients p WHERE p.id = p_patient_id
  LOOP
    v_row.cpf       := private.mask_cpf(v_row.cpf);
    v_row.phone     := private.mask_phone(v_row.phone);
    v_row.email     := private.mask_email(v_row.email::text);
    v_row.documents := NULL;
    v_count := v_count + 1;
    RETURN NEXT v_row;
  END LOOP;
  PERFORM private.log_clinical_read('patients', p_patient_id, v_count, p_patient_id);
END;
$$;


-- ============================================================
-- 3. Revelar — o valor completo, com rastro proprio
-- ============================================================
--
-- Um paciente por vez, sem variante de lista: revelar em lote e coletar.
-- Mesma RLS de read_patient (o dono e clinical_reader), entao revela quem pode
-- abrir a ficha — nem mais, nem menos. O titular le os proprios dados direto e
-- nao passa por aqui.
--
-- A linha da trilha e escrita MESMO quando a RLS esvazia o retorno (row_count
-- 0): tentativa de revelar ficha alheia e exatamente o que a auditoria precisa
-- ver.

CREATE FUNCTION public.reveal_patient_identifiers(p_patient_id uuid)
RETURNS TABLE (
  patient_id uuid,
  cpf        text,
  phone      text,
  email      text,
  documents  jsonb
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT p.id, p.cpf, p.phone, p.email::text, p.documents
      FROM public.patients p
     WHERE p.id = p_patient_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('patient_identifiers', p_patient_id, v_count, p_patient_id);
END;
$$;

COMMENT ON FUNCTION public.reveal_patient_identifiers(uuid) IS
  'CPF, telefone, e-mail e documentos COMPLETOS de um paciente. Linha propria na trilha (resource_table = patient_identifiers), separada da abertura da ficha. read_patient/read_patients devolvem estes campos mascarados desde 25/09/2026.';

RESET ROLE;
-- Explicito: no `db push` o RESET pode voltar ao papel de login da CLI
-- (cli_login_postgres, NOINHERIT), e nao a postgres. Ver o bloco da secao 5.
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 4. A edicao recusa o valor mascarado
-- ============================================================
--
-- O CPF mascarado ja falhava (normalize_cpf deixa 5 digitos -> invalid_cpf),
-- mas com um erro que manda o operador procurar digito errado. Telefone e
-- e-mail mascarados PASSAVAM, e gravavam a mascara por cima do dado. O `*` nao
-- aparece em telefone e, na pratica, nao aparece em e-mail — a recusa troca um
-- caso teorico por um defeito certo.

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

  -- COALESCE, com a limitacao declarada em create_patient_registry: argumento
  -- nulo significa "nao mexer". O congelamento do CPF na ficha ativada e do
  -- trigger, nao daqui.
  UPDATE public.patients
     SET full_name      = coalesce(pg_catalog.btrim(p_full_name), full_name),
         cpf            = coalesce(v_cpf, cpf),
         birth_date     = coalesce(p_birth_date, birth_date),
         phone          = coalesce(pg_catalog.btrim(p_phone), phone),
         email          = coalesce(pg_catalog.btrim(p_email)::extensions.citext, email),
         address        = coalesce(p_address, address),
         insurance_name = coalesce(pg_catalog.btrim(p_insurance_name), insurance_name)
   WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text) IS
  'Corrige a ficha. Argumento nulo = coluna inalterada (logo, nao apaga contato). Recusa valor mascarado (masked_value_rejected). CPF so muda antes da ativacao (trigger).';


-- ============================================================
-- 5. Privilegios — SEMPRE no fim
-- ============================================================

-- As mascaras rodam DENTRO das read_*, cujo dono e clinical_reader. Ninguem
-- mais precisa chama-las.
REVOKE EXECUTE ON FUNCTION private.mask_cpf(text)   FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.mask_phone(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.mask_email(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION private.mask_cpf(text)   TO clinical_reader;
GRANT  EXECUTE ON FUNCTION private.mask_phone(text) TO clinical_reader;
GRANT  EXECUTE ON FUNCTION private.mask_email(text) TO clinical_reader;

-- Objeto de clinical_reader: quem revoga e concede tem de ser ele (armadilha
-- nº 4). A funcao nova nasce com EXECUTE para PUBLIC, e anon herdaria.
DO $$
BEGIN
  SET LOCAL ROLE clinical_reader;
  REVOKE EXECUTE ON FUNCTION public.reveal_patient_identifiers(uuid) FROM PUBLIC, anon;
  GRANT  EXECUTE ON FUNCTION public.reveal_patient_identifiers(uuid) TO authenticated, service_role;
  RESET ROLE;
  -- No `db push` (25/09/2026), o RESET dentro deste DO voltou a
  -- cli_login_postgres, que e NOINHERIT e nao tem USAGE em `private`: a
  -- assercao abaixo morreu com "permission denied for schema private". Local,
  -- a sessao e postgres e o defeito nao aparece. O papel de login pode
  -- SET ROLE postgres, entao a volta explicita vale nos dois ambientes.
  SET LOCAL ROLE postgres;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END;
$$;


-- ============================================================
-- 6. Asserção de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
DECLARE
  v_fn   text;
  v_dono text;
BEGIN
  -- Dono de tabela nao sofre RLS: se qualquer uma sair desta migration com
  -- outro dono, a ficha de todo paciente fica legivel a todo perfil.
  FOREACH v_fn IN ARRAY ARRAY[
    'public.read_patient(uuid)',
    'public.read_patients(integer, integer)',
    'public.reveal_patient_identifiers(uuid)'
  ] LOOP
    SELECT r.rolname INTO v_dono
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_roles r ON r.oid = p.proowner
     WHERE p.oid = v_fn::regprocedure;
    IF v_dono <> 'clinical_reader' THEN
      RAISE EXCEPTION '% saiu da migration com dono %', v_fn, v_dono;
    END IF;

    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em %', v_fn;
    END IF;
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
  END LOOP;

  IF NOT pg_catalog.has_function_privilege('clinical_reader', 'private.mask_cpf(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader sem EXECUTE em mask_cpf — read_patient morreria em runtime';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'private.mask_cpf(text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated alcanca mask_cpf';
  END IF;
END;
$$;
