-- Cadastro do profissional e o vinculo com as especialidades.
-- Design e racional: supera-docs/Modelo de Dados/Identidade e acesso.md
-- Decisao sob teste:  ADR-020 §4 (ninguem edita o proprio perfil profissional)
-- Fonte: Requisitos/Painel Administrativo/Gestao de usuarios
--
-- Mesma lacuna de `patients`, medida pelo dev do painel em 10/09/2026:
-- `professionals` e `professional_specialties` tinham APENAS politica de
-- SELECT e nenhuma RPC. A tela de Usuarios era catalogo de quem ja existia, e
-- contratacao nova dependia de acesso tecnico ao banco.
--
-- ESTA E A PORTA MAIS LARGA DO SISTEMA. `professional_specialties` decide,
-- sozinha, quem le o que: `my_specialty_ids()` e o predicado de escrita
-- clinica, e `specialties.is_confidential` na psicologia e o que torna a
-- conversa dela invisivel ate para a administracao (#9, #23). Uma RPC de
-- cadastro sem guarda e uma escada de privilegio com degrau de tela.


-- ============================================================
-- 1. A guarda: ninguem mexe no proprio perfil profissional
-- ============================================================
--
-- O ataque concreto, que nao e hipotetico e nao exige nenhuma falha do codigo:
-- administrador ativo chama a RPC de cadastro apontando a PROPRIA conta,
-- pedindo a especialidade `psychology`. No instante seguinte ele le todo o
-- conteudo que a #23 decidiu, no sentido restritivo, que a administracao NAO
-- alcanca — e a decisao foi tomada porque "e o unico ponto do modelo em que
-- errar vaza dado sensivel".
--
-- A GUARDA NAO PROIBE A CLINICA DE TER QUEM ACUMULE OS DOIS PAPEIS. Ela exige
-- que OUTRA pessoa faca a concessao, que e a mesma forma da protecao do ultimo
-- administrador ja aplicada em protect_last_admin: o que se recusa e o ato
-- reflexivo, nao a configuracao resultante. Com dois administradores, o
-- cadastro legitimo acontece; o auto-servico, nao — e fica em audit_log com
-- dois nomes diferentes.
CREATE FUNCTION private.reject_self_professional_change(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_account_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_manage_own_professional_profile'
      USING ERRCODE = '42501',
            DETAIL  = 'Conceder especialidade a si mesmo e escalada de privilegio.',
            HINT    = 'Outro administrador precisa executar esta operacao.';
  END IF;
END;
$$;

COMMENT ON FUNCTION private.reject_self_professional_change(uuid) IS
  'Recusa o ato reflexivo no cadastro de profissional. A psicologia e o motivo: is_confidential decide sigilo para a plataforma inteira.';


-- ============================================================
-- 2. Cadastro e correcao
-- ============================================================

CREATE FUNCTION public.create_professional(
  p_account_id           uuid,
  p_council_registration text,
  p_specialty_ids        uuid[],
  p_primary_specialty_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id      uuid;
  v_primary uuid := p_primary_specialty_id;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM private.reject_self_professional_change(p_account_id);

  -- Mensagem propria em vez da violacao de FK, pela mesma razao de
  -- `create_admin`: erro de chave estrangeira nao diz a quem opera o que fazer.
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account_id) THEN
    RAISE EXCEPTION 'account_not_found'
      USING ERRCODE = '23503',
            HINT    = 'A pessoa precisa ter criado a conta antes de receber o perfil.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.professionals WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'professional_already_registered' USING ERRCODE = '23505';
  END IF;

  -- Obrigatorio desde 11/09/2026 (#14). A checagem aqui existe para dar erro
  -- legivel: sem ela o CHECK da tabela dispara e a tela mostra o nome da
  -- constraint. Formato continua fora — a clinica respondeu "obrigatorio",
  -- nao "validado", e regex por conselho rejeitaria cadastro legitimo.
  IF p_council_registration IS NULL OR length(btrim(p_council_registration)) = 0 THEN
    RAISE EXCEPTION 'council_registration_required' USING ERRCODE = '23514';
  END IF;

  -- SEM ESPECIALIDADE O PERFIL E INERTE: `my_specialty_ids()` devolveria '{}',
  -- e '{}' nega explicitamente toda escrita clinica. Um profissional cadastrado
  -- que nao consegue registrar nada e chamado de suporte, nao configuracao.
  IF p_specialty_ids IS NULL OR pg_catalog.cardinality(p_specialty_ids) = 0 THEN
    RAISE EXCEPTION 'specialty_required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(p_specialty_ids) AS s (id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.specialties sp WHERE sp.id = s.id AND sp.is_active
     )
  ) THEN
    RAISE EXCEPTION 'unknown_specialty' USING ERRCODE = '23503';
  END IF;

  -- Uma primaria, sempre: o indice unico parcial permite ZERO primarias, e
  -- "zero" deixaria a carteira sem area para agrupar. Na omissao, a primeira
  -- do array — escolha declarada, nao inferencia.
  v_primary := coalesce(v_primary, p_specialty_ids[1]);
  IF NOT (v_primary = ANY (p_specialty_ids)) THEN
    RAISE EXCEPTION 'primary_specialty_not_in_list' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.professionals (account_id, council_registration)
  VALUES (p_account_id, pg_catalog.btrim(p_council_registration))
  RETURNING id INTO v_id;

  INSERT INTO public.professional_specialties (professional_id, specialty_id, is_primary)
  SELECT v_id, s.id, (s.id = v_primary)
    FROM pg_catalog.unnest(p_specialty_ids) AS s (id);

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_professional(uuid, text, uuid[], uuid) IS
  'Cadastra o profissional sobre conta existente. Exige admin ativo, registro de conselho (#14), ao menos uma especialidade, e recusa o ato reflexivo.';

CREATE FUNCTION public.update_professional(
  p_professional_id      uuid,
  p_council_registration text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account_id
    FROM public.professionals WHERE id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING ERRCODE = '23503';
  END IF;

  -- A guarda vale tambem na correcao: sem ela, "editar o registro de conselho"
  -- seria a porta de entrada para editar o resto depois.
  PERFORM private.reject_self_professional_change(v_account_id);

  IF p_council_registration IS NULL OR length(btrim(p_council_registration)) = 0 THEN
    RAISE EXCEPTION 'council_registration_required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.professionals
     SET council_registration = pg_catalog.btrim(p_council_registration)
   WHERE id = p_professional_id;
END;
$$;

CREATE FUNCTION public.set_professional_active(p_professional_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account_id
    FROM public.professionals WHERE id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING ERRCODE = '23503';
  END IF;

  PERFORM private.reject_self_professional_change(v_account_id);

  -- Desativar o PERFIL, nao a conta: sao os dois `is_active` da regra de
  -- identidade, e desligar a conta (set_account_active) revoga tambem o app e
  -- os outros papeis. A #26 confirmou que desativar o cadastro E o mecanismo
  -- oficial de revogacao, e ele vale no instante seguinte porque a
  -- autorizacao e lookup, nunca claim (ADR-003 §1).
  UPDATE public.professionals SET is_active = p_is_active WHERE id = p_professional_id;
END;
$$;

COMMENT ON FUNCTION public.set_professional_active(uuid, boolean) IS
  'Revogacao oficial do acesso do profissional (#26). Vale no instante seguinte: autorizacao e lookup, nao claim.';


-- ============================================================
-- 3. As especialidades — juncao TEMPORAL, nunca DELETE
-- ============================================================
--
-- Mesma forma de `professional_permissions` (create_permission_grants) e pelo
-- mesmo motivo: a unica pergunta que uma auditoria faz e QUEM PODIA LER O QUE,
-- EM QUE DATA. Com DELETE, o fato de a pessoa ter tido acesso a psicologia
-- sairia da tabela e restaria so em audit_log.
--
-- `ended_at` preenchido = vigencia encerrada. `my_specialty_ids()` ja filtra
-- por `ended_at IS NULL`, entao encerrar a vigencia revoga a leitura no
-- instante seguinte, sem tocar em politica nenhuma.
CREATE FUNCTION public.set_professional_specialties(
  p_professional_id      uuid,
  p_specialty_ids        uuid[],
  p_primary_specialty_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
  v_primary    uuid := p_primary_specialty_id;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT account_id INTO v_account_id
    FROM public.professionals WHERE id = p_professional_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_not_found' USING ERRCODE = '23503';
  END IF;

  PERFORM private.reject_self_professional_change(v_account_id);

  IF p_specialty_ids IS NULL OR pg_catalog.cardinality(p_specialty_ids) = 0 THEN
    RAISE EXCEPTION 'specialty_required' USING ERRCODE = '23514';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_catalog.unnest(p_specialty_ids) AS s (id)
     WHERE NOT EXISTS (
       SELECT 1 FROM public.specialties sp WHERE sp.id = s.id AND sp.is_active
     )
  ) THEN
    RAISE EXCEPTION 'unknown_specialty' USING ERRCODE = '23503';
  END IF;

  v_primary := coalesce(v_primary, p_specialty_ids[1]);
  IF NOT (v_primary = ANY (p_specialty_ids)) THEN
    RAISE EXCEPTION 'primary_specialty_not_in_list' USING ERRCODE = '23514';
  END IF;

  -- 1. Encerra o que saiu da lista.
  --
  -- `clock_timestamp()` E NAO `now()`, e a suite encontrou o motivo: o CHECK
  -- de periodo exige `ended_at > started_at`, e `now()` e o instante da
  -- TRANSACAO, nao do comando. Vigencia aberta e encerrada na mesma transacao
  -- teria os dois valores IDENTICOS e a constraint recusaria — o que quebraria
  -- tanto o teste quanto o caso real de corrigir um cadastro errado antes de
  -- confirmar a tela. `clock_timestamp()` avanca dentro da transacao, e
  -- semanticamente e o que se quer: o instante em que a vigencia terminou.
  UPDATE public.professional_specialties
     SET ended_at = pg_catalog.clock_timestamp()
   WHERE professional_id = p_professional_id
     AND ended_at IS NULL
     AND NOT (specialty_id = ANY (p_specialty_ids));

  -- 2. A primaria muda sem encerrar vigencia: continuar na mesma area e ter
  --    outra como principal nao e revogacao, e encerrar a linha faria o
  --    historico afirmar uma interrupcao que nao houve.
  UPDATE public.professional_specialties
     SET is_primary = (specialty_id = v_primary)
   WHERE professional_id = p_professional_id
     AND ended_at IS NULL
     AND is_primary IS DISTINCT FROM (specialty_id = v_primary);

  -- 3. Abre vigencia para as novas.
  INSERT INTO public.professional_specialties (professional_id, specialty_id, is_primary)
  SELECT p_professional_id, s.id, (s.id = v_primary)
    FROM pg_catalog.unnest(p_specialty_ids) AS s (id)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.professional_specialties ps
      WHERE ps.professional_id = p_professional_id
        AND ps.specialty_id    = s.id
        AND ps.ended_at IS NULL
   );
END;
$$;

COMMENT ON FUNCTION public.set_professional_specialties(uuid, uuid[], uuid) IS
  'Define as areas vigentes. Encerra vigencia, nunca apaga linha — a auditoria pergunta quem podia ler o que, em que data.';


-- ============================================================
-- 4. Trilha de escrita
-- ============================================================
--
-- As duas tabelas decidem acesso a prontuario e ate aqui nao deixavam linha.
-- '-' porque nenhuma delas tem coluna de paciente.

CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.professionals
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.professional_specialties
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 5. Privilegios
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.reject_self_professional_change(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.reject_self_professional_change(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_professional(uuid, text, uuid[], uuid)      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_professional(uuid, text)                    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_professional_active(uuid, boolean)             FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_professional_specialties(uuid, uuid[], uuid)   FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.create_professional(uuid, text, uuid[], uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_professional(uuid, text)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_professional_active(uuid, boolean)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_professional_specialties(uuid, uuid[], uuid)    TO authenticated;
