-- Duas regras sobre remover administrador: nem contra si mesmo, nem o último.
-- Design e racional: supera-docs/Modelo de Dados/Identidade e acesso.md
-- Complementa: bootstrap_first_admin.sql (que fechou o caminho de recriação).
--
-- O QUE ESTAVA ABERTO. Medido no stack local: o único administrador chamou
-- public.set_account_active(<ele mesmo>, false) com sucesso, e o sistema ficou
-- com ZERO admins ativos. Combinado com a trava do bootstrap, isso é
-- irrecuperável pelo produto — ninguém reativa (é preciso ser admin) e o
-- bootstrap não reabre (public.admins não está vazia). Um clique, e o painel
-- administrativo fica inacessível até alguém escrever uma migration.
--
-- DUAS REGRAS DISTINTAS, e a diferença importa:
--
--   1. AUTO-REMOÇÃO: um admin não desliga a si mesmo, mesmo havendo outros.
--      Não é sobre disponibilidade — é sobre o ato ser sempre de outra pessoa,
--      que é o que dá revisão a uma mudança de acesso privilegiado. Errar aqui
--      não tem desfazer: perdido o próprio acesso, não se corrige a si mesmo.
--
--   2. ÚLTIMO ADMIN: nem outro admin desliga o último ativo. Esta é sobre
--      disponibilidade, e vale para QUALQUER caminho, inclusive service_role.
--
-- POR QUE TRIGGER, E NÃO CHECAGEM NA RPC. O que roda com service_role ignora
-- RLS e não passa por set_account_active(): Edge Function, script de migração,
-- dashboard do Supabase. Regra de negócio que precisa valer sempre mora em
-- constraint/trigger — princípio já registrado no CLAUDE.md, e a lição que o
-- bootstrap ensinou quando a marca em app_metadata, sozinha, não bastou.
--
-- TRÊS CAMINHOS de sumiço, e o trigger cobre os três:
--   a. UPDATE public.admins  SET is_active = false
--   b. UPDATE public.accounts SET is_active = false   (a conta desliga o perfil)
--   c. DELETE FROM public.admins — inclusive por CASCATA, ao apagar a conta ou
--      o usuário do Auth (ambas as FKs são ON DELETE CASCADE, verificado).

-- ============================================================
-- Helper: conta administradores ativos, exceto um
-- ============================================================
--
-- "Ativo" aqui é a REGRA DOS DOIS is_active (create_identity_core.sql): a conta
-- precisa estar ativa E o perfil também. É a mesma definição de
-- private.is_active_admin(), e tem de continuar sendo — se divergirem, esta
-- proteção passa a contar administradores que não conseguem entrar.
--
-- SECURITY DEFINER porque roda dentro de trigger para qualquer papel, inclusive
-- authenticated, que não enxerga todas as linhas de admins sob RLS: a contagem
-- precisa ser do BANCO, não da visão do chamador. Contar sob RLS devolveria 1
-- para quem só se enxerga, e a proteção nunca dispararia.
CREATE FUNCTION private.count_other_active_admins(p_except_account uuid)
RETURNS bigint
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*)
  FROM public.admins ad
  JOIN public.accounts a ON a.id = ad.account_id
  WHERE ad.is_active
    AND a.is_active
    AND ad.account_id IS DISTINCT FROM p_except_account;
$$;

COMMENT ON FUNCTION private.count_other_active_admins(uuid) IS
  'Administradores ativos (regra dos dois is_active) excluindo uma conta. Base da proteção do último admin.';


-- ============================================================
-- 1. public.admins — UPDATE e DELETE
-- ============================================================

CREATE FUNCTION public.protect_admin_removal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target uuid := OLD.account_id;
  v_actor  uuid := auth.uid();
  v_losing boolean;
BEGIN
  -- O que caracteriza "perder este admin": ser apagado, ou deixar de estar ativo.
  -- UPDATE que não mexe em is_active (nunca há hoje, mas haverá) não é assunto
  -- deste trigger e sai barato pelo caminho de baixo.
  v_losing := (TG_OP = 'DELETE') OR (OLD.is_active AND NOT NEW.is_active);

  IF NOT v_losing THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- Só protege quem estava valendo: desligar um admin já inativo, ou apagar sua
  -- linha, é higiene — não tira acesso de ninguém.
  IF NOT OLD.is_active THEN
    RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- REGRA 1 — auto-remoção. v_actor IS NOT NULL exclui deliberadamente o
  -- service_role e a migration: sem JWT não há "si mesmo", e travar aí impediria
  -- justamente a manutenção legítima. Contra o admin logado, vale sempre.
  IF v_actor IS NOT NULL AND v_actor = v_target THEN
    RAISE EXCEPTION 'um administrador nao pode remover o proprio acesso'
      USING ERRCODE = '42501',
            HINT = 'Peca a outro administrador. Errar aqui nao tem desfazer.';
  END IF;

  -- REGRA 2 — último admin. Vale para todo caminho, service_role incluído: é
  -- disponibilidade do painel, não autorização de quem age.
  IF private.count_other_active_admins(v_target) = 0 THEN
    RAISE EXCEPTION 'nao e possivel remover o ultimo administrador ativo'
      USING ERRCODE = '23514',
            HINT = 'Promova outro administrador antes (public.create_admin).';
  END IF;

  RETURN CASE TG_OP WHEN 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

COMMENT ON FUNCTION public.protect_admin_removal() IS
  'Impede auto-remoção de administrador e a remoção do último ativo. Vale para qualquer papel, service_role incluído.';

CREATE TRIGGER trg_protect_admin_removal
BEFORE UPDATE OR DELETE ON public.admins
FOR EACH ROW EXECUTE FUNCTION public.protect_admin_removal();


-- ============================================================
-- 2. public.accounts — o mesmo pela porta da conta
-- ============================================================
--
-- set_account_active() escreve em accounts, não em admins: sem este trigger, a
-- proteção acima seria contornada por um caminho que o produto usa todo dia.
-- Foi exatamente assim que o furo apareceu na medição.
--
-- DELETE de accounts não precisa de trigger próprio: a FK admins -> accounts é
-- ON DELETE CASCADE, então o DELETE em admins dispara o trigger de cima e
-- aborta a transação inteira. Verificado; há asserção para isso na suíte, para
-- que a mudança da FK para SET NULL não passe despercebida.

CREATE FUNCTION public.protect_admin_account_deactivation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  -- Só interessa a transição ativo -> inativo de quem É admin ativo.
  IF NOT (OLD.is_active AND NOT NEW.is_active) THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.admins WHERE account_id = OLD.id AND is_active
  ) THEN
    RETURN NEW;
  END IF;

  IF v_actor IS NOT NULL AND v_actor = OLD.id THEN
    RAISE EXCEPTION 'um administrador nao pode desativar a propria conta'
      USING ERRCODE = '42501',
            HINT = 'Peca a outro administrador. Errar aqui nao tem desfazer.';
  END IF;

  IF private.count_other_active_admins(OLD.id) = 0 THEN
    RAISE EXCEPTION 'nao e possivel desativar a conta do ultimo administrador'
      USING ERRCODE = '23514',
            HINT = 'Promova outro administrador antes (public.create_admin).';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_admin_account_deactivation() IS
  'Espelha protect_admin_removal() pela porta de accounts.is_active, que é por onde set_account_active() escreve.';

-- WHEN no trigger: accounts recebe UPDATE a cada edição de nome e telefone.
-- Sem o filtro, toda essas escritas pagariam a chamada da função à toa.
CREATE TRIGGER trg_protect_admin_account_deactivation
BEFORE UPDATE OF is_active ON public.accounts
FOR EACH ROW
WHEN (OLD.is_active AND NOT NEW.is_active)
EXECUTE FUNCTION public.protect_admin_account_deactivation();


-- ============================================================
-- Privilégios
-- ============================================================
--
-- Funções de trigger não são chamáveis (retornam trigger, sem argumentos), mas
-- o default privilege do Supabase concede EXECUTE a anon/authenticated em toda
-- função nova de public — limpar é defesa em profundidade.

REVOKE EXECUTE ON FUNCTION public.protect_admin_removal()               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_admin_account_deactivation()  FROM PUBLIC, anon, authenticated;

-- private.count_other_active_admins é lookup interno e SECURITY DEFINER: fica
-- fechado a quem autentica. Os triggers a chamam como donos, não como o usuário.
REVOKE EXECUTE ON FUNCTION private.count_other_active_admins(uuid) FROM PUBLIC, anon, authenticated;
