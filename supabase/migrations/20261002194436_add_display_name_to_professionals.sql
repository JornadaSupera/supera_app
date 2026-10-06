-- Fase K.2 das pendencias do banco ([35], 02/10/2026): o nome do profissional
-- chega junto do compromisso.
-- Design e racional: supera-docs/ADRs/ADR-014 — Granularidade, autoria e corte do agregado Agenda.md (emenda de 02/10/2026)
--
-- O QUE FALTAVA. O app mostra "Consulta com ___" e nao tinha como preencher:
-- o nome mora em accounts.full_name, e accounts so e legivel pela propria
-- conta, pela equipe e pelo administrador. O paciente (e o acompanhante) le o
-- compromisso e o professional_id, e para por ai.
--
-- QUEM LE O NOME. professionals_select_authenticated continua USING (true):
-- nome de membro da equipe nao e dado de paciente; especialidade e registro no
-- conselho ja estao abertos do mesmo jeito; e a RLS de appointments ja decide
-- QUAIS compromissos aparecem — o nome nao abre caminho para nenhum que o
-- paciente nao veja. Restringir a "quem tem compromisso com ele" quebraria a
-- escolha de profissional no agendamento sem proteger nada do paciente. Se a
-- CEON quiser restringir, e aditivo depois (ADR-003: uma politica por perfil).
--
-- POR QUE COLUNA MANTIDA POR GATILHO, e nao coluna calculada
-- (public.display_name(public.professionals)): a funcao teria de ser SECURITY
-- DEFINER para ler accounts, e funcao com argumento de linha e chamavel com
-- uma linha montada a mao — ROW(..., '<qualquer account_id>', ...) — e
-- entregaria o nome de qualquer conta, inclusive de paciente. A coluna fisica
-- nao tem essa superficie.
--
-- OS DOIS GATILHOS:
--   - em professionals, BEFORE: SOBRESCREVE display_name com o full_name da
--     conta em todo INSERT e em todo UPDATE que toque account_id ou
--     display_name. Escrita direta ou de service_role nao faz o nome divergir;
--   - em accounts, AFTER UPDATE OF full_name: quem troca o nome e o proprio
--     profissional, por accounts_update_own, e ele nao escreve em
--     professionals — por isso SECURITY DEFINER. O gatilho de cima confirma o
--     valor.
--
-- EFEITOS ACEITOS: display_name e NULL quando full_name e NULL (a conta aceita
-- nome nulo); cada troca de nome deixa uma linha `update` na trilha
-- (trg_audit_write de professionals), so com o id. Realtime: professionals
-- nao esta na publication.


-- ============================================================
-- 1. A coluna
-- ============================================================

ALTER TABLE public.professionals ADD COLUMN display_name text;

COMMENT ON COLUMN public.professionals.display_name IS
  'Nome que o paciente ve no compromisso. Copia de accounts.full_name mantida por gatilho; nunca escrita a mao (a escrita e sobrescrita). Pode ser NULL.';


-- ============================================================
-- 2. Gatilho em professionals — o nome vem sempre da conta
-- ============================================================

CREATE FUNCTION private.sync_professional_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  SELECT a.full_name INTO NEW.display_name
    FROM public.accounts a
   WHERE a.id = NEW.account_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_display_name
  BEFORE INSERT OR UPDATE OF account_id, display_name ON public.professionals
  FOR EACH ROW
  EXECUTE FUNCTION private.sync_professional_display_name();


-- ============================================================
-- 3. Gatilho em accounts — a troca de nome se propaga
-- ============================================================
--
-- Conta de paciente ou de acompanhante nao tem linha em professionals: o
-- UPDATE nao casa nada e nao deixa trilha.

CREATE FUNCTION private.propagate_account_name_to_professional()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.professionals
     SET display_name = NEW.full_name
   WHERE account_id = NEW.id;
  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$$;

CREATE TRIGGER trg_propagate_name_to_professional
  AFTER UPDATE OF full_name ON public.accounts
  FOR EACH ROW
  WHEN (OLD.full_name IS DISTINCT FROM NEW.full_name)
  EXECUTE FUNCTION private.propagate_account_name_to_professional();


-- ============================================================
-- 4. O passado
-- ============================================================
--
-- Com WHERE: o safeupdate recusa UPDATE sem ele na sessao do PostgREST, e a
-- regra do projeto e nao depender de onde o comando roda.

UPDATE public.professionals pr
   SET display_name = a.full_name
  FROM public.accounts a
 WHERE a.id = pr.account_id;


-- ============================================================
-- 5. Privilegios — no fim, e medidos
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.sync_professional_display_name()         FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.propagate_account_name_to_professional() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.professionals pr
      JOIN public.accounts a ON a.id = pr.account_id
     WHERE pr.display_name IS DISTINCT FROM a.full_name
  ) THEN
    RAISE EXCEPTION 'display_name diverge de accounts.full_name depois do preenchimento';
  END IF;
  IF pg_catalog.has_table_privilege('anon', 'public.professionals', 'SELECT') THEN
    RAISE EXCEPTION 'anon le professionals';
  END IF;
  IF pg_catalog.has_table_privilege('authenticated', 'public.professionals', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.professionals', 'UPDATE')
     OR pg_catalog.has_column_privilege('authenticated', 'public.professionals', 'display_name', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated escreve em professionals';
  END IF;
  IF NOT pg_catalog.has_column_privilege('authenticated', 'public.professionals', 'display_name', 'SELECT') THEN
    RAISE EXCEPTION 'authenticated nao le display_name: o app nao recebe o nome';
  END IF;
  IF pg_catalog.has_function_privilege('authenticated', 'private.sync_professional_display_name()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'private.propagate_account_name_to_professional()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'private.sync_professional_display_name()', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'private.propagate_account_name_to_professional()', 'EXECUTE') THEN
    RAISE EXCEPTION 'funcao de gatilho do nome ficou executavel pela API';
  END IF;
END;
$$;
