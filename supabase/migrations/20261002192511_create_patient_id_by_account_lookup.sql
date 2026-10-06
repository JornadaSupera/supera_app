-- O administrador descobre qual ficha de paciente esta ligada a uma conta,
-- pela trilha, e so ele.
-- Pedido do painel administrativo de 02/10/2026.
-- Design e racional: supera-docs/ADRs/ADR-008 — Auditoria de leitura de dado clínico.md (emenda de 02/10/2026)
--
-- O QUE FALTAVA. O painel tem o account_id (da lista de usuarios, do Auth) e
-- precisa do patients.id para abrir a ficha. O caminho obvio,
-- .from('patients').eq('account_id', x), devolve vazio para o administrador:
-- patients_select_admin vale so para clinical_reader desde
-- create_clinical_read_audit, e e assim de proposito, porque leitura de ficha
-- pela equipe passa pelo pedagio da trilha. is_patient_account responde so
-- sim ou nao, sem trilha.
--
-- POR QUE NAO AS OUTRAS SAIDAS:
--   - devolver o id em is_patient_account: ela nao grava na trilha, e mudar o
--     tipo de retorno e DROP + CREATE em funcao que o painel ja chama;
--   - devolver a politica do administrador a authenticated: desfaz a ADR-008,
--     e toda leitura de patients pelo painel sairia da trilha;
--   - account_id em read_patient_list: entrega o vinculo conta -> ficha da
--     pagina inteira, quando o caso e de uma conta.
--
-- AS QUATRO BARREIRAS, de fora para dentro:
--   1. EXECUTE so para authenticated. Nem PUBLIC, nem anon, nem service_role:
--      a Edge Function com service_role ja le a tabela direto, e aqui ela
--      cairia em `forbidden` de qualquer jeito (auth.uid() nulo). Revogar do
--      service_role deixa a superficie igual ao uso.
--   2. Administrador ativo (is_active_admin: conta e papel ativos, papel nao
--      pendente). Profissional nao tem motivo para ir da conta a ficha: o
--      painel clinico chega ao paciente pela lista e pela ficha.
--   3. Sessao aal2 SEMPRE, com ou sem require_admin_mfa ligado — a mesma
--      regra de prepare_staff_account e da redefinicao do segundo fator. O
--      vinculo conta -> ficha e o que liga uma identidade de login a um
--      prontuario; e o que um token de administrador roubado procuraria.
--   4. Dono clinical_reader: a consulta passa pela RLS de patients. Ela NAO
--      substitui a guarda 2: patients_select_professional tambem vale para
--      clinical_reader, e sem a guarda o profissional receberia o id (medido
--      em 02/10/2026, apagando a guarda: a suite derrubou as nove recusas).
--      O que a politica segura sozinha e paciente, acompanhante e conta sem
--      perfil. A guarda 2 e a barreira; a RLS e o piso.
--
-- A TRILHA. Toda chamada que passa das guardas grava uma linha, ACHANDO OU
-- NAO: resource_table = 'patient_by_account', resource_id = a conta
-- consultada, patient_id = a ficha (ou nulo), row_count 1 ou 0. A falha e o
-- que importa para quem investiga: uma varredura de contas por tentativa e
-- erro tem de aparecer como dezenas de linhas com row_count 0 e a conta
-- tentada em resource_id. A recusa (forbidden, mfa_required) levanta erro e
-- nao deixa linha — a transacao desfaz —, o mesmo comportamento de todas as
-- read_*.
--
-- Devolve so o uuid. Os dados da ficha continuam vindo de read_patient, que
-- tem seu proprio pedagio e mascara CPF e contato.


-- ============================================================
-- 1. A funcao — dono clinical_reader
-- ============================================================

GRANT CREATE ON SCHEMA public TO clinical_reader;

SET LOCAL ROLE clinical_reader;

CREATE FUNCTION public.read_patient_id_by_account(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT private.session_meets_mfa() THEN
    RAISE EXCEPTION 'mfa_required'
      USING ERRCODE = '42501',
            HINT    = 'Localizar a ficha de uma conta exige sessao com segundo fator verificado (aal2).';
  END IF;

  IF p_account_id IS NULL THEN
    RAISE EXCEPTION 'account_required' USING ERRCODE = '22004';
  END IF;

  SELECT p.id INTO v_patient_id
    FROM public.patients p
   WHERE p.account_id = p_account_id;

  PERFORM private.log_clinical_read(
    'patient_by_account', v_patient_id,
    CASE WHEN v_patient_id IS NULL THEN 0 ELSE 1 END,
    p_account_id);

  RETURN v_patient_id;
END;
$$;

COMMENT ON FUNCTION public.read_patient_id_by_account(uuid) IS
  'Administrador ativo em sessao aal2 obtem o patients.id ligado a uma conta, ou NULL. Grava na trilha toda consulta, inclusive sem resultado (resource_table patient_by_account, resource_id = a conta). Nao-administrador: forbidden; sem aal2: mfa_required. Desde 02/10/2026, emenda a ADR-008.';

REVOKE EXECUTE ON FUNCTION public.read_patient_id_by_account(uuid) FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.read_patient_id_by_account(uuid) TO authenticated;

RESET ROLE;
SET LOCAL ROLE postgres;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;


-- ============================================================
-- 2. Privilegios — medidos pelo efeito
-- ============================================================

DO $$
DECLARE
  v_sig text := 'public.read_patient_id_by_account(uuid)';
BEGIN
  IF NOT pg_catalog.has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sem EXECUTE em %: o painel nao alcancaria a funcao', v_sig;
  END IF;
  IF pg_catalog.has_function_privilege('anon', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa %: a superficie sem login cresceu', v_sig;
  END IF;
  IF pg_catalog.has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role executa %: a revogacao nao pegou', v_sig;
  END IF;
  IF (SELECT pg_catalog.pg_get_userbyid(p.proowner)
        FROM pg_catalog.pg_proc p
       WHERE p.oid = v_sig::regprocedure) <> 'clinical_reader' THEN
    RAISE EXCEPTION '% nao pertence a clinical_reader: a RLS de patients nao a alcancaria', v_sig;
  END IF;
  IF NOT pg_catalog.has_function_privilege('clinical_reader', 'private.session_meets_mfa()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('clinical_reader', 'private.is_active_admin()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('clinical_reader',
              'private.log_clinical_read(text, uuid, integer, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'clinical_reader perdeu EXECUTE num helper da funcao: ela morreria em runtime';
  END IF;
  IF pg_catalog.has_schema_privilege('clinical_reader', 'public', 'CREATE') THEN
    RAISE EXCEPTION 'clinical_reader ficou com CREATE em public';
  END IF;
END;
$$;
