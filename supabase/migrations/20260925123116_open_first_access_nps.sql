-- Fase 2.4 das pendencias consolidadas (app #12, painel R-1): a pesquisa de
-- satisfacao do primeiro acesso passa a abrir sozinha.
--
-- Desde 11/09/2026 open_nps_survey existia e ninguem a chamava. Dos tres
-- marcos (#41), o de PRIMEIRO ACESSO e evento nosso: e o instante em que a
-- ficha ganha conta — accept_patient_invitation grava patients.account_id.
-- Os marcos de meio e fim do tratamento continuam INERTES: dependem de
-- current_cycle_number, que so a sincronizacao com o Gemed preenche.
--
-- POR QUE TRIGGER, e nao a rotina agendada: o evento tem instante exato e
-- nasce numa transacao nossa. Uma varredura periodica procuraria "fichas com
-- conta e sem pesquisa" para sempre, e a pesquisa abriria com atraso de ate
-- um ciclo do cron.
--
-- So UPDATE, e so NULL -> valor. O cadastro (register_patient) nasce sem
-- conta; a conta chega pelo aceite do convite. Uma ficha que um dia trocasse
-- de conta nao abre pesquisa nova — e a chave (paciente, marco) recusaria de
-- qualquer forma.
--
-- FORA DAQUI, e pendente de decisao da clinica (D.6): a administracao abrir a
-- pesquisa manualmente. open_nps_survey continua so de service_role.
--
-- SEM NOTIFICACAO: create_nps decidiu que NPS nao gera push (nenhuma fonte o
-- pede, e o quinto filtro da tela seria invencao). O app descobre a pesquisa
-- pendente lendo nps_surveys.


-- ============================================================
-- 1. O gatilho
-- ============================================================

CREATE FUNCTION private.open_first_access_nps()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.open_nps_survey(NEW.id, 'primeiro_acesso');
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.open_first_access_nps() IS
  'Abre a pesquisa do marco primeiro_acesso quando a ficha ganha conta. Idempotente pela chave (paciente, marco) de nps_surveys.';

CREATE TRIGGER trg_open_first_access_nps
AFTER UPDATE OF account_id ON public.patients
FOR EACH ROW
WHEN (OLD.account_id IS NULL AND NEW.account_id IS NOT NULL)
EXECUTE FUNCTION private.open_first_access_nps();


-- ============================================================
-- 2. As fichas que ja tinham conta
-- ============================================================
--
-- Quem ativou o app antes desta migration tambem teve primeiro acesso. Sem o
-- preenchimento, o indicador de adesao ao NPS mediria so quem entrou depois
-- de hoje. Idempotente: a chave recusa a segunda linha.

SELECT public.open_nps_survey(p.id, 'primeiro_acesso')
  FROM public.patients p
 WHERE p.account_id IS NOT NULL;


-- ============================================================
-- 3. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.open_first_access_nps() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('authenticated',
         'private.open_first_access_nps()', 'EXECUTE') THEN
    RAISE EXCEPTION 'open_first_access_nps alcancavel por authenticated';
  END IF;
  -- O disparo manual continua fechado ate a D.6: o titular nao escolhe quando
  -- ser perguntado.
  IF pg_catalog.has_function_privilege('authenticated',
         'public.open_nps_survey(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'open_nps_survey alcancavel por authenticated';
  END IF;
END;
$$;
