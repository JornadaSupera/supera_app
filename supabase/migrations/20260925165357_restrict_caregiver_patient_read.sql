-- O acompanhante deixa de ler a linha inteira de `patients` do tutelado.
-- Pendencia aberta desde a Fase 1 (mask_patient_identifiers), adiada para a
-- Fase 4 e deixada de fora dela. Decisao na ADR-029.
--
-- O DEFEITO: patients_select_caregiver liberava a LINHA, e RLS nao escolhe
-- coluna. O acompanhante lia CPF, telefone, e-mail, endereco, convenio,
-- documentos e account_id completos, com `.from('patients').select('*')` —
-- mais do que a equipe, que desde 25/09/2026 recebe CPF, telefone e e-mail
-- mascarados e paga linha na trilha para revelar.
--
-- POR QUE NAO PRIVILEGIO POR COLUNA: titular e acompanhante sao o MESMO papel
-- (`authenticated`). Tirar `cpf` do GRANT tiraria do titular tambem, e
-- export_my_data (SECURITY INVOKER, sob a RLS do titular) le a ficha inteira
-- para o pacote do art. 18. Nao ha como a RLS separar coluna por perfil.
--
-- O QUE MUDA:
--   * sai a politica patients_select_caregiver: `.from('patients')` do
--     acompanhante passa a devolver `[]`, como para quem nao tem vinculo;
--   * nasce get_my_ward(): o tutelado com vinculo `active`, so com o que a
--     tela do acompanhante usa — id, nome, fase da jornada e situacao da ficha.
--     Nenhum identificador (CPF, documentos), nenhum contato (telefone,
--     e-mail, endereco), nem nascimento, convenio ou account_id.
--
-- O QUE NAO MUDA: o escopo continua sendo private.my_ward_patient_ids(). Vinculo
-- `pending` (senha provisoria ainda nao trocada) devolve vazio, revogacao vale
-- na hora. As demais tabelas do tutelado (diario, plano, diagnostico,
-- historico, orientacoes, conversas e compromissos `team`) continuam lidas
-- direto: sao o objeto do acompanhamento, e a regra delas e outra (ADR-003).
--
-- Coluna que a tela precisar depois entra na projecao por migration nova, uma
-- de cada vez. Adicionar e barato; tirar de um contrato publicado nao e.


-- ============================================================
-- 1. A leitura escopada
-- ============================================================
--
-- SECURITY DEFINER, dono postgres: com a politica fora, e o unico caminho do
-- acompanhante ate a linha. O escopo vem do helper, que le auth.uid() da
-- sessao — nao ha argumento, logo nao ha como pedir o paciente de outro.
--
-- Nao paga pedagio de auditoria (ADR-008): o acompanhante le o tutelado
-- direto em todo o resto, e o que sai daqui e menos do que ele ja le no
-- plano e no diario.

CREATE FUNCTION public.get_my_ward()
RETURNS TABLE (
  patient_id         uuid,
  full_name          text,
  treatment_phase_id uuid,
  is_active          boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.full_name, p.treatment_phase_id, p.is_active
    FROM public.patients p
   WHERE p.id = ANY (private.my_ward_patient_ids())
   ORDER BY p.full_name;
$$;

COMMENT ON FUNCTION public.get_my_ward() IS
  'O tutelado do acompanhante (vinculo active): id, nome, fase e situacao. Sem CPF, contato, nascimento, convenio ou documentos. Substitui a leitura direta de patients, que o acompanhante perdeu em 25/09/2026 (ADR-029).';


-- ============================================================
-- 2. A politica sai
-- ============================================================

DROP POLICY patients_select_caregiver ON public.patients;


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================
--
-- A funcao nasce com EXECUTE para PUBLIC e, pelo default privilege do
-- Supabase, para anon (armadilhas 2, 3 e 5). anon nao tem vinculo, mas a
-- superficie anonima se mede em anon_surface.test.sql e so admite
-- get_clinic_presentation.

REVOKE EXECUTE ON FUNCTION public.get_my_ward() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_my_ward() TO authenticated, service_role;


-- ============================================================
-- 4. Assercao de efeito — mede o papel, nao os comandos acima
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'patients'
       AND policyname = 'patients_select_caregiver'
  ) THEN
    RAISE EXCEPTION 'patients_select_caregiver continua de pe';
  END IF;

  -- O titular nao pode perder a propria ficha junto.
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename  = 'patients'
       AND policyname = 'patients_select_own'
  ) THEN
    RAISE EXCEPTION 'patients_select_own sumiu: o titular ficaria sem a ficha';
  END IF;

  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_ward()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated ficou SEM EXECUTE em get_my_ward';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.get_my_ward()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca get_my_ward';
  END IF;
  -- O helper roda sob o dono (postgres), mas get_my_ward so e util se o
  -- escopo continuar vindo dele: nada de reescrever o predicado aqui.
  IF NOT pg_catalog.has_function_privilege('authenticated', 'private.my_ward_patient_ids()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated perdeu EXECUTE em my_ward_patient_ids — as outras politicas do acompanhante morreriam';
  END IF;
END;
$$;
