-- O administrador redefine o segundo fator de outra pessoa da equipe, pelo
-- painel, e a redefinicao fica na trilha.
-- Plano das pendencias do painel de 30/09/2026, Fase F, item F.2 (painel #4).
-- Design e racional: supera-docs/ADRs/ADR-031 — Provisionamento da equipe.md
--
-- O QUE FALTAVA. Nada no banco tocava auth.mfa_factors, e o unico caminho
-- era scripts/enroll-totp.mjs, pelo terminal, com service_role. Quem perdia o
-- celular do autenticador ficava sem acesso administrativo (com
-- require_admin_mfa ligado) ate alguem com a chave abrir um terminal.
--
-- A SEQUENCIA, na Edge Function reset-mfa-factor:
--   1. authorize_mfa_factor_reset(alvo), com o JWT do administrador;
--   2. auth.admin.mfa.deleteFactor para cada fator do alvo (Admin API: quem
--      apaga o fator e o Auth, dono da tabela);
--   3. record_mfa_factor_reset(alvo), com o JWT do administrador: encerra
--      as sessoes do alvo e grava a linha na trilha.
--
-- POR QUE A TRILHA DEPOIS, E NAO NA AUTORIZACAO. A trilha e append-only
-- (ADR-003 §6): uma linha "redefiniu" gravada antes de a Admin API responder
-- ficaria mentindo se a remocao falhasse, e nao ha como desfaze-la. Por isso
-- a autorizacao so confere, e o registro vem com o resultado.
--
-- POR QUE ENCERRAR AS SESSOES AQUI. Apagar o fator nao derruba a sessao que
-- ja passou por ele: o nivel `aal2` fica gravado em auth.sessions, e o
-- refresh continua emitindo token `aal2`. Se a redefinicao e porque o
-- celular foi perdido ou roubado, a sessao viva e justamente o que precisa
-- cair. A Admin API do supabase-js so encerra sessao a partir do JWT da
-- propria pessoa (auth.admin.signOut), que o administrador nao tem. O DELETE
-- em auth.sessions e o que o Auth faz no logout, e as FKs levam junto
-- refresh_tokens e mfa_amr_claims. O token de acesso ja emitido vale ate
-- expirar (jwt_expiry do projeto): o PostgREST so confere a assinatura.
--
-- O ALVO: so conta de equipe (profissional ou administrador, ativo ou nao),
-- e nunca a propria. A propria conta tem o caminho do proprio app (unenroll
-- com sessao aal2); redefinir a sua pelo painel seria tirar o segundo fator
-- sem provar o segundo fator.


-- ============================================================
-- 1. A checagem comum
-- ============================================================

CREATE FUNCTION private.assert_mfa_factor_reset_allowed(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- aal2 SEMPRE, com ou sem require_admin_mfa: quem tira o segundo fator de
  -- alguem prova, antes, que tem o seu.
  IF NOT private.session_meets_mfa() THEN
    RAISE EXCEPTION 'mfa_required'
      USING ERRCODE = '42501',
            HINT    = 'Redefinir o segundo fator de alguem exige sessao com segundo fator verificado (aal2).';
  END IF;

  IF p_account_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_reset_own_factor'
      USING ERRCODE = '42501',
            HINT    = 'Troque o seu autenticador pelo proprio perfil, ou peca a outro administrador.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.professionals WHERE account_id = p_account_id)
     AND NOT EXISTS (SELECT 1 FROM public.admins WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'staff_account_not_found' USING ERRCODE = 'P0002';
  END IF;
END;
$$;

COMMENT ON FUNCTION private.assert_mfa_factor_reset_allowed(uuid) IS
  'Administrador em sessao aal2, alvo de equipe e diferente da propria conta. Base de authorize_ e record_mfa_factor_reset.';


-- ============================================================
-- 2. authorize_mfa_factor_reset — antes da Admin API
-- ============================================================

CREATE FUNCTION public.authorize_mfa_factor_reset(p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM private.assert_mfa_factor_reset_allowed(p_account_id);
END;
$$;

COMMENT ON FUNCTION public.authorize_mfa_factor_reset(uuid) IS
  'Confere, sem gravar nada, se o administrador pode redefinir o segundo fator da conta. Chamada pela Edge Function reset-mfa-factor antes da Admin API. Desde 30/09/2026.';


-- ============================================================
-- 3. record_mfa_factor_reset — depois da remocao confirmada
-- ============================================================
--
-- Confere de novo: entre a autorizacao e o registro passou uma chamada de
-- rede, e a funcao e chamavel sozinha por qualquer `authenticated`.
--
-- Devolve quantas sessoes cairam, para a tela dizer "a pessoa foi
-- desconectada". Quantos fatores sairam nao vai para a trilha, que guarda o
-- ato, nao o detalhe.
--
-- Chamar de novo e seguro: a segunda chamada nao acha sessao e grava outra
-- linha. E o caminho de quem teve a Admin API respondendo e o registro
-- falhando na rede.

CREATE FUNCTION public.record_mfa_factor_reset(p_account_id uuid)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_sessions integer;
BEGIN
  PERFORM private.assert_mfa_factor_reset_allowed(p_account_id);

  DELETE FROM auth.sessions WHERE user_id = p_account_id;
  GET DIAGNOSTICS v_sessions = ROW_COUNT;

  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     origin, actor_capacity)
  VALUES
    (auth.uid(), 'delete', 'mfa_factors', p_account_id, NULL,
     private.request_origin(), private.actor_capacity());

  RETURN v_sessions;
END;
$$;

COMMENT ON FUNCTION public.record_mfa_factor_reset(uuid) IS
  'Encerra as sessoes da conta e grava na trilha a redefinicao do segundo fator (delete em mfa_factors, resource_id = conta alvo). Chamada pela Edge Function depois de a Admin API remover os fatores. Desde 30/09/2026.';


-- ============================================================
-- 4. Privilegios — no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.assert_mfa_factor_reset_allowed(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.authorize_mfa_factor_reset(uuid)       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_mfa_factor_reset(uuid)          FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.authorize_mfa_factor_reset(uuid)        TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_mfa_factor_reset(uuid)           TO authenticated;

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.authorize_mfa_factor_reset(uuid)',
    'public.record_mfa_factor_reset(uuid)'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated perdeu % — o painel quebraria', v_fn;
    END IF;
  END LOOP;

  -- O dono da funcao precisa apagar sessao do Auth. Medido no local; no
  -- remoto, se o Supabase um dia tirar o privilegio, o push falha aqui, e nao
  -- na primeira redefinicao de verdade.
  IF NOT pg_catalog.has_table_privilege(current_user, 'auth.sessions', 'DELETE') THEN
    RAISE EXCEPTION '% nao apaga auth.sessions — record_mfa_factor_reset nao encerraria sessao', current_user;
  END IF;
END;
$$;
