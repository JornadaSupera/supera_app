-- Conceder e revogar acesso passam a deixar linha na trilha.
-- Fecha os dois TODO(auditoria) de create_identity_core e bootstrap_first_admin.
-- Fonte: Requisitos/Seguranca e Dados/Auditoria e trilha de acesso (#12)
--
-- A ASSIMETRIA QUE O DEV DO PAINEL NOMEOU MELHOR DO QUE NOS: a trilha registra
-- bem quem LEU prontuario — cada `read_*` paga pedagio desde 28/08/2026 — e nao
-- registra nada de quem MUDOU PERMISSAO, que e a acao mais grave que existe no
-- painel administrativo. Ativar uma conta, desativar uma conta e promover
-- alguem a administrador eram, ate aqui, invisiveis: o rastro de `create_admin`
-- era um `RAISE LOG`, que vive no log do Postgres e nao na trilha consultavel.
--
-- TRIGGER, E NAO INSERT DENTRO DAS FUNCOES. As duas formas fechariam o TODO, e
-- so uma fecha o buraco: o que roda com `service_role` NAO PASSA pelas RPCs, e
-- `service_role` tem BYPASSRLS. Auditoria que so existe no caminho educado
-- registra exatamente os acessos que ninguem estava tentando esconder.


-- ============================================================
-- 1. accounts — so a mudanca de is_active
-- ============================================================
--
-- `WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)` nao e economia de
-- escrita: e a diferenca entre trilha e ruido. `accounts` recebe UPDATE a cada
-- correcao de nome e de telefone no onboarding e no perfil, e auditar tudo
-- afogaria a concessao de acesso no meio de milhares de linhas de "trocou o
-- sobrenome". Trilha que ninguem consegue ler deixa de ser trilha — e o mesmo
-- argumento que manteve a coluna de diagnostico fora da lista de pacientes.
--
-- O QUE A LINHA DIZ, e o que ela deliberadamente nao diz: `audit_log` guarda
-- ator, acao, tabela e id — nunca conteudo (ADR-003 §6, ADR-005). Nao ha
-- coluna para "de true para false", e nao se cria uma: como o trigger SO
-- dispara nessa transicao, a existencia da linha ja significa "o acesso desta
-- conta foi concedido ou revogado por este ator, nesta data". O sentido se le
-- no estado atual da conta mais a ordem das linhas.
CREATE TRIGGER trg_audit_write_is_active
  AFTER UPDATE ON public.accounts
  FOR EACH ROW
  WHEN (OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION private.audit_write('-');

COMMENT ON TRIGGER trg_audit_write_is_active ON public.accounts IS
  'So a transicao de is_active. A existencia da linha ja significa concessao ou revogacao de acesso; audit_log nao guarda o valor, por desenho.';


-- ============================================================
-- 2. admins — a promocao inteira
-- ============================================================
--
-- Aqui nao ha filtro: a tabela so tem linhas de promocao e desligamento, e
-- toda escrita nela e o evento que interessa. `protect_last_admin` ja impede o
-- desligamento do ultimo — o que faltava era saber quem desligou os outros.
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');

-- `caregivers` pela mesma razao: o perfil nasce no aceite do convite e da
-- acesso delegado a prontuario de terceiro.
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.caregivers
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 3. Os TODO saem do corpo das funcoes
-- ============================================================
--
-- CREATE OR REPLACE so para apagar o comentario: o corpo e identico ao
-- aplicado. A razao de nao deixar como estava e que o TODO afirma, para quem
-- ler a funcao, que a acao NAO e auditada — e a partir desta migration ela e.
-- Comentario obsoleto sobre auditoria e como asserção que passa sobre o estado
-- errado: da garantia falsa, e no sentido perigoso.

CREATE OR REPLACE FUNCTION public.set_account_active(p_account_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Auditado por trg_audit_write_is_active em accounts (11/09/2026), e nao
  -- aqui: o trigger alcanca tambem service_role, que nao passa por esta funcao.
  UPDATE public.accounts SET is_active = p_is_active WHERE id = p_account_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_admin(p_account_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- A linha que separa RPC administrativa de escalada de privilégio.
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Mensagem própria: sem ela, o erro que chega ao painel é violação de FK,
  -- que não diz a quem opera o que fazer a respeito.
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'conta % nao existe', p_account_id USING ERRCODE = '23503';
  END IF;

  -- Idempotente: repetir a promoção devolve o perfil existente em vez de
  -- estourar o UNIQUE. Reativar quem foi desligado NÃO acontece aqui — é
  -- decisão administrativa própria (set_account_active/painel), para não
  -- transformar "criar" em desfazer silencioso de um desligamento.
  SELECT id INTO v_id FROM public.admins WHERE account_id = p_account_id;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- Auditado por trg_audit_write em admins (11/09/2026). O RAISE LOG fica:
  -- ele serve ao operador de infraestrutura lendo log do Postgres, que e outro
  -- publico e outra janela de retencao.
  INSERT INTO public.admins (account_id)
  VALUES (p_account_id)
  RETURNING id INTO v_id;

  RAISE LOG 'admin % promovido por %', p_account_id, auth.uid();

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_admin(uuid) IS
  'Promove uma conta existente a administrador. Exige admin ativo na sessao. Auditado em audit_log desde 11/09/2026.';


-- ============================================================
-- 4. Privilegios
-- ============================================================
--
-- CREATE OR REPLACE PRESERVA o ACL da funcao — nao ha concessao nova a fazer.
-- As linhas abaixo existem porque REPLACE nao protege contra o default
-- privilege do Supabase ter sido alterado no intervalo, e porque repetir o
-- REVOKE e barato ao lado de descobrir depois que `anon` executa promocao a
-- administrador (ADR-016).
REVOKE EXECUTE ON FUNCTION public.set_account_active(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_admin(uuid)                FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_account_active(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_admin(uuid)                TO authenticated;
