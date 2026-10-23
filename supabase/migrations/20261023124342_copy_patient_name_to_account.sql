-- O nome da conta vem da ficha. Pendencia [42] do time (23/10/2026), emenda
-- §10 a ADR-020.
--
-- O cadastro do app deixou de pedir nome (pedido da clinica de 23/10/2026): a
-- conta nasce com accounts.full_name nulo, o que handle_new_auth_user ja
-- aceitava (create_identity_core). A saudacao da Inicio le accounts.full_name,
-- e sem ele o app teria de pedir o nome numa tela depois do vinculo — a tela
-- que a clinica quis tirar. A ficha ja tem o nome, NOT NULL, cadastrado pela
-- clinica.
--
-- POR QUE GATILHO, e nao duas linhas nas RPCs: a conta se liga a ficha por
-- DOIS caminhos, link_patient_by_verified_phone e accept_patient_invitation, e
-- os dois gravam patients.account_id. O gatilho na transicao NULL -> valor
-- cobre os dois, e o que vier depois, inclusive service_role. E a mesma forma
-- de trg_open_first_access_nps (open_first_access_nps).
--
-- SO QUANDO A CONTA ESTA SEM NOME. Um nome que a pessoa escreveu (no metadata
-- do signup ou pelo perfil, que tem UPDATE em full_name) e dela, e nao se
-- sobrescreve com o da ficha. Pela mesma razao, a copia e de uma vez so: a
-- correcao posterior do nome na ficha (update_patient) NAO propaga para a
-- conta. A pessoa troca o proprio nome pelo perfil.
--
-- Fora da trilha: a trilha de accounts registra so is_active
-- (audit_access_grants), e a ligacao ja fica na trilha de patients.


-- ============================================================
-- 1. O gatilho
-- ============================================================

CREATE FUNCTION private.copy_patient_name_to_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.accounts a
     SET full_name = NEW.full_name
   WHERE a.id = NEW.account_id
     AND a.full_name IS NULL;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.copy_patient_name_to_account() IS
  'Quando a ficha ganha conta, copia patients.full_name para accounts.full_name se a conta estiver sem nome. Uma vez so: nao sobrescreve nome existente nem propaga correcao posterior da ficha ([42], ADR-020 §10).';

CREATE TRIGGER trg_copy_patient_name_to_account
AFTER UPDATE OF account_id ON public.patients
FOR EACH ROW
WHEN (OLD.account_id IS NULL AND NEW.account_id IS NOT NULL)
EXECUTE FUNCTION private.copy_patient_name_to_account();


-- ============================================================
-- 2. As contas que ja estao ligadas e sem nome
-- ============================================================
--
-- Quem ativou o app antes desta migration sem mandar o nome no signup tambem
-- fica sem saudacao. Mesma regra do gatilho: so a conta sem nome.

UPDATE public.accounts a
   SET full_name = p.full_name
  FROM public.patients p
 WHERE p.account_id = a.id
   AND a.full_name IS NULL;


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.copy_patient_name_to_account() FROM PUBLIC, anon, authenticated;


-- ============================================================
-- Verificacao — o efeito, nao o comando
-- ============================================================

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('authenticated',
         'private.copy_patient_name_to_account()', 'EXECUTE')
  OR pg_catalog.has_function_privilege('anon',
         'private.copy_patient_name_to_account()', 'EXECUTE') THEN
    RAISE EXCEPTION 'copy_patient_name_to_account alcancavel pela API';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger t
     WHERE t.tgrelid = 'public.patients'::regclass
       AND t.tgname  = 'trg_copy_patient_name_to_account'
       AND t.tgenabled = 'O'
  ) THEN
    RAISE EXCEPTION 'trg_copy_patient_name_to_account ausente ou desligado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patients p
      JOIN public.accounts a ON a.id = p.account_id
     WHERE a.full_name IS NULL
  ) THEN
    RAISE EXCEPTION 'conta ligada a ficha continua sem nome depois do preenchimento';
  END IF;
END;
$$;
