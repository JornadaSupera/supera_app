-- Como nasce um administrador: bootstrap do PRIMEIRO, e RPC para os demais.
-- Design e racional: supera-docs/Modelo de Dados/Identidade e acesso.md
-- Provisionamento: scripts/seed-admin.mjs · scripts/README.md
--
-- O PROBLEMA DO OVO E DA GALINHA. public.admins não tem política de INSERT para
-- authenticated (create_identity_core.sql): cadastrar admin é ato de admin, e o
-- painel administrativo exige um admin ativo. O primeiro acesso tem de vir de
-- fora — e o desafio é abrir essa porta SEM deixá-la aberta.
--
-- DUAS CONDIÇÕES, E AS DUAS IMPORTAM:
--
-- 1. A marca vive em raw_app_meta_data, nunca em raw_user_meta_data.
--    raw_user_meta_data é ESCRITO PELO PRÓPRIO USUÁRIO: o `data` do
--    /auth/v1/signup chega intacto na coluna (medido — um cadastro anônimo com
--    {"supera_role":"admin"} grava exatamente isso). Ler dali seria escalada de
--    privilégio por autocadastro: qualquer pessoa viraria admin pelo formulário
--    público. raw_app_meta_data só se escreve com service_role; no mesmo teste,
--    o app_metadata enviado pelo atacante foi descartado pelo GoTrue.
--
-- 2. A marca sozinha NÃO BASTA. Ela é inescrevível por quem autentica, mas é
--    trivial para qualquer portador do service_role — que existe em Edge
--    Function, em CI e em qualquer .env que vaze. Medido: cinco linhas de Node
--    criaram um administrador sem tocar no seed. Enquanto a marca for a única
--    condição, "só o script cria admin" é convenção, não garantia.
--
-- A TRAVA. A concessão exige uma condição que NÃO SE REPETE: public.admins
-- vazia. O primeiro admin fecha a porta atrás de si; a partir daí a marca é
-- inerte, nem service_role reabre. Os seguintes nascem por public.create_admin(),
-- que exige admin ativo na sessão.
--
-- CONSEQUÊNCIA ACEITA (decisão de 29/08/2026): perder o único administrador é
-- caso de migration nova, deliberada e versionada — não de reexecutar script.
-- É o preço de o bootstrap não ser caminho permanente: trava que se reabre
-- sozinha não é trava.
--
-- E-MAIL CONFIRMADO, NÃO CONVIDADO. A concessão pende da confirmação porque
-- e-mail digitado errado não gera erro nenhum: o convite sai, a API responde
-- 200 e o bounce acontece depois, no SMTP. Concedendo no convite, sobraria um
-- ADMIN FANTASMA — perfil ativo, e-mail nunca confirmado, ninguém entra, e o
-- endereço ocupado pelo UNIQUE de accounts.email. Medido no stack local.

-- ============================================================
-- 1. Bootstrap do primeiro administrador
-- ============================================================

CREATE FUNCTION public.handle_auth_user_confirmed()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_granted uuid;
BEGIN
  -- Rede de segurança: a conta deveria existir pelo trigger de INSERT
  -- (handle_new_auth_user), mas se aquele INSERT falhou, conceder admin sem
  -- accounts violaria a FK e mataria a confirmação do e-mail.
  --
  -- coalesce/nullif SEM schema: são produções da gramática SQL, não funções —
  -- pg_catalog.coalesce() não existe. Sendo gramática, não é sequestrável por
  -- search_path. Mesmo caso do overlay posicional em add_shared_functions.
  INSERT INTO public.accounts (id, full_name, email, phone)
  VALUES (
    NEW.id,
    nullif(btrim(coalesce(NEW.raw_user_meta_data ->> 'full_name', '')), ''),
    NEW.email,
    NEW.phone
  )
  ON CONFLICT (id) DO NOTHING;

  -- A TRAVA. NOT EXISTS sem filtro de is_active: conta DESATIVADA também fecha
  -- o bootstrap. Se olhasse só admin ativo, quem consegue desativar
  -- administradores conseguiria reabrir a janela e forjar um novo pela caixa de
  -- e-mail — escalada por um caminho que ninguém audita.
  --
  -- Corrida entre duas confirmações simultâneas não é problema real aqui: o
  -- UNIQUE (account_id) barra a duplicata da mesma pessoa, e o INSERT ... SELECT
  -- lê e escreve no mesmo comando. Duas pessoas distintas confirmando no mesmo
  -- instante é cenário de bootstrap, onde o operador conhece os dois convites.
  INSERT INTO public.admins (account_id)
  SELECT NEW.id
  WHERE NOT EXISTS (SELECT 1 FROM public.admins)
  ON CONFLICT (account_id) DO NOTHING
  RETURNING id INTO v_granted;

  -- Silêncio aqui seria mentira operacional: o convidado confirmaria o e-mail,
  -- entraria no sistema e não seria admin, sem nada registrando por quê.
  -- WARNING, não NOTICE: NOTICE não retorna no output do `supabase db push`.
  IF v_granted IS NULL THEN
    RAISE WARNING
      'bootstrap ignorado para % (%): ja existe administrador. Use public.create_admin().',
      NEW.email, NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_auth_user_confirmed() IS
  'Bootstrap do PRIMEIRO admin: concede na confirmação do e-mail, e SÓ enquanto public.admins está vazia. Lê app_metadata (user_metadata é escrito pelo próprio usuário). Os demais nascem em public.create_admin().';

-- As condições vivem no WHEN, não no corpo: assim o Postgres nem chama a função
-- nas confirmações de paciente, profissional e cuidador — a imensa maioria.
--
-- OLD... IS NULL AND NEW... IS NOT NULL capta a TRANSIÇÃO, não o estado: sem
-- isso, todo UPDATE em auth.users de um usuário já confirmado (cada login
-- atualiza last_sign_in_at) reexecutaria o bloco.
CREATE TRIGGER trg_handle_auth_user_confirmed
AFTER UPDATE OF email_confirmed_at ON auth.users
FOR EACH ROW
WHEN (
  OLD.email_confirmed_at IS NULL
  AND NEW.email_confirmed_at IS NOT NULL
  AND NEW.raw_app_meta_data ->> 'supera_role' = 'admin'
)
EXECUTE FUNCTION public.handle_auth_user_confirmed();


-- ============================================================
-- 2. A outra metade: admin criando admin
-- ============================================================
--
-- Sem isto, travar o bootstrap deixaria o segundo administrador sem caminho — e
-- a saída de campo seria alguém mexer no banco com service_role, que é
-- exatamente o que esta migration existe para tirar do fluxo normal.
--
-- Recebe o account_id de quem JÁ EXISTE: criar usuário no Auth é do GoTrue, não
-- do Postgres. O painel convida por auth.admin (com a chave dele, no servidor),
-- a pessoa confirma o e-mail, e então um admin promove esta conta.

CREATE FUNCTION public.create_admin(p_account_id uuid)
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

  INSERT INTO public.admins (account_id)
  VALUES (p_account_id)
  RETURNING id INTO v_id;

  -- TODO(auditoria): registrar quem promoveu quem, junto de set_account_active
  -- (#12). Hoje o rastro é só o log do Postgres.
  RAISE LOG 'admin % promovido por %', p_account_id, auth.uid();

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_admin(uuid) IS
  'Promove uma conta existente a administrador. Exige admin ativo na sessão. Caminho normal depois do bootstrap.';


-- ============================================================
-- Privilégios — REVOKE no fim, GRANT cirúrgico
-- ============================================================
--
-- Defesa em profundidade contra o default privilege do Supabase, que concede
-- EXECUTE a anon/authenticated em toda função nova de public.

REVOKE EXECUTE ON FUNCTION public.create_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_admin(uuid) TO authenticated;

-- Função de trigger não é chamável por ninguém (retorna trigger, sem argumentos).
REVOKE EXECUTE ON FUNCTION public.handle_auth_user_confirmed() FROM PUBLIC, anon, authenticated;
