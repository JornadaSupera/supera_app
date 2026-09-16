-- Concessao e revogacao de permissao profissional — a costura que faltava.
-- Design e racional: supera-docs/ADRs/ADR-017 — A enfermagem navegadora no catalogo de permissoes.md
-- Decisao ja tomada:  ADR-003 §4 (permissions/professional_permissions nascem vazias)
--
-- POR QUE ESTA MIGRATION VEM PRIMEIRO, antes de qualquer codigo entrar no
-- catalogo: verificado no esquema aplicado, `professional_permissions` NAO TEM
-- POLITICA DE ESCRITA e NENHUMA FUNCAO A ESCREVE. O catalogo e legivel pelo
-- administrador e inerte — correto enquanto vazio, e insuficiente no instante
-- em que a primeira linha entrar.
--
-- Sem estas duas RPCs, inserir um codigo em `permissions` TRANCA a capacidade
-- correspondente para todo mundo, sem caminho de destrancar que nao seja
-- service_role. A ordem obrigatoria e: RPCs -> codigos -> predicados ->
-- concessoes (ADR-017 §4).
--
-- A SEMANTICA INVERTIDA, que e a armadilha desta familia inteira: codigo
-- AUSENTE do catalogo CONCEDE A TODOS; codigo PRESENTE concede so a quem tem
-- linha. Inserir o codigo e, por si, um ato RESTRITIVO — e remover a linha do
-- catalogo REABRE para todos, em silencio. Oposto de `alert_rules`, cujo vazio
-- e fail-closed (ADR-007 §1). As duas convivem no mesmo banco.


-- ============================================================
-- 1. A revogacao precisa deixar linha — e hoje nao teria onde
-- ============================================================
--
-- O argumento DECISIVO da ADR-017 §1 para o catalogo, contra um
-- `boolean is_navigator`, foi a auditabilidade: "revogar deixa linha", e a
-- unica pergunta que uma auditoria faz e QUEM PODIA ASSUMIR ALERTA, EM QUE
-- DATA. Com a tabela como nasceu, revogar so poderia ser DELETE — e o fato
-- da concessao sairia da tabela, restando apenas em audit_log.
--
-- Forma adotada: a mesma de `professional_specialties`, que e junção TEMPORAL
-- pelo mesmo motivo (create_identity_core) — a vigencia se encerra, a linha
-- fica. `revoked_at` nulo = concessao vigente.

ALTER TABLE public.professional_permissions
  ADD COLUMN revoked_at         timestamptz,
  ADD COLUMN revoked_by_account uuid;

-- FK sobre tabela JA EXISTENTE vai NOT VALID, e o VALIDATE vive em migration
-- separada — na mesma transacao ele bloquearia leitura, anulando o motivo de
-- ter separado. Padrao imposto pelo Squawk e estabelecido em
-- validate_treatment_phase_fk.
ALTER TABLE public.professional_permissions
  ADD CONSTRAINT fk_professional_permissions_revoked_by
  FOREIGN KEY (revoked_by_account) REFERENCES public.accounts (id)
  ON DELETE SET NULL
  NOT VALID;

COMMENT ON COLUMN public.professional_permissions.revoked_at IS
  'NULL = concessao vigente. Revogar NAO apaga a linha: o historico de quem podia o que, e quando, e o argumento que fez a ADR-017 escolher o catalogo em vez de um booleano em professionals.';

-- A UNIQUE original impedia reconceder depois de revogar: (profissional,
-- permissao) ja existiria. Com vigencia, o que precisa ser unico e a
-- concessao ABERTA — exatamente como uq_professional_specialties_active.
ALTER TABLE public.professional_permissions
  DROP CONSTRAINT professional_permissions_professional_id_permission_id_key;

CREATE UNIQUE INDEX uq_professional_permissions_active
  ON public.professional_permissions (professional_id, permission_id)
  WHERE revoked_at IS NULL;

-- Sem isto, uma concessao revogada continuaria concedendo: has_permission
-- so olhava a existencia da linha.
CREATE OR REPLACE FUNCTION private.has_permission(p_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = p_code)
      OR EXISTS (
        SELECT 1
        FROM public.professional_permissions pp
        JOIN public.permissions   pm ON pm.id = pp.permission_id
        JOIN public.professionals p  ON p.id  = pp.professional_id
        JOIN public.accounts      a  ON a.id  = p.account_id
        WHERE pm.code = p_code
          AND a.id = auth.uid()
          AND a.is_active
          AND p.is_active
          -- A perna nova. As outras tres continuam palavra por palavra as de
          -- fix_has_permission_account_level.
          AND pp.revoked_at IS NULL
      );
$$;

GRANT EXECUTE ON FUNCTION private.has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_permission(text) TO clinical_reader;


-- ============================================================
-- 2. As duas RPCs — escrita administrativa, como set_account_active
-- ============================================================
--
-- SECURITY DEFINER COM is_active_admin() checado NO CORPO. Sem essa linha, e
-- escalada de privilegio para qualquer autenticado: a funcao roda como dono
-- das tabelas. Padrao de toda escrita administrativa do projeto.
--
-- Nenhuma politica de escrita em professional_permissions: o ciclo inteiro e
-- RPC, como em caregiver_links. Politica de INSERT aqui exigiria que o
-- administrador enxergasse a tabela para escrever, e a checagem de "e admin"
-- viveria em dois lugares.

CREATE FUNCTION public.grant_professional_permission(
  p_professional_id uuid,
  p_code            text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permission_id uuid;
  v_id            uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador ativo concede permissao'
      USING ERRCODE = '42501';
  END IF;

  SELECT pm.id INTO v_permission_id
    FROM public.permissions pm WHERE pm.code = p_code;

  -- Codigo inexistente NAO e no-op: sem esta linha, um erro de digitacao
  -- ("alerts.triagem") gravaria nada e a tela diria "concedido". E o codigo
  -- ausente do catalogo CONCEDE A TODOS — o administrador acharia que
  -- restringiu quando abriu.
  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'permissao inexistente no catalogo: %', p_code
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.professionals p
                  WHERE p.id = p_professional_id) THEN
    RAISE EXCEPTION 'profissional inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Reconceder o que ja esta vigente devolve a linha existente, sem duplicar e
  -- sem reescrever granted_at — a data da concessao ORIGINAL e o que a
  -- auditoria pergunta.
  SELECT pp.id INTO v_id
    FROM public.professional_permissions pp
   WHERE pp.professional_id = p_professional_id
     AND pp.permission_id   = v_permission_id
     AND pp.revoked_at IS NULL;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO public.professional_permissions
    (professional_id, permission_id, granted_by_account)
  VALUES
    (p_professional_id, v_permission_id, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.grant_professional_permission(uuid, text) IS
  'Concede permissao a um profissional (ADR-017 §4). Unico caminho de escrita em professional_permissions junto de revoke_professional_permission — a tabela nao tem politica de INSERT.';

CREATE FUNCTION public.revoke_professional_permission(
  p_professional_id uuid,
  p_code            text
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_permission_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador ativo revoga permissao'
      USING ERRCODE = '42501';
  END IF;

  SELECT pm.id INTO v_permission_id
    FROM public.permissions pm WHERE pm.code = p_code;

  IF v_permission_id IS NULL THEN
    RAISE EXCEPTION 'permissao inexistente no catalogo: %', p_code
      USING ERRCODE = 'no_data_found';
  END IF;

  -- UPDATE e nao DELETE: a linha revogada E o registro de que houve um estado
  -- anterior. Estreitar por revogacao e auditavel; estreitar por nunca ter
  -- concedido nao deixa rastro nenhum (ADR-017 §5).
  UPDATE public.professional_permissions pp
     SET revoked_at         = pg_catalog.now(),
         revoked_by_account = auth.uid()
   WHERE pp.professional_id = p_professional_id
     AND pp.permission_id   = v_permission_id
     AND pp.revoked_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.revoke_professional_permission(uuid, text) IS
  'Encerra a vigencia da concessao. NAO apaga a linha — revogar tem de deixar rastro, que e o argumento da ADR-017 §1 contra o booleano.';


-- ============================================================
-- 3. Trilha de escrita (#12)
-- ============================================================
--
-- "Quem fez o que" alcanca a concessao de privilegio, que e onde mais importa.
-- '-' porque a tabela nao tem coluna de paciente: nao ha titular a quem este
-- ato pertenca.

CREATE TRIGGER trg_audit_write
AFTER INSERT OR UPDATE OR DELETE ON public.professional_permissions
FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 4. Privilegios — SEMPRE no fim (REVOKE so atinge o que ja existe)
-- ============================================================

-- A tabela so se escreve pelas duas RPCs. Nem service_role a escreve direto:
-- o produtor unico e o que garante a vigencia e a trilha.
REVOKE INSERT, UPDATE, DELETE ON public.professional_permissions
  FROM authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.grant_professional_permission(uuid, text)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.revoke_professional_permission(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.grant_professional_permission(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_professional_permission(uuid, text) TO authenticated;

-- O default privilege do supabase_admin reabre tabela e funcao novas para
-- `anon` sem que migration nenhuma o alcance (ADR-016). A revogacao explicita
-- e o que a suite mede em anon_surface.test.sql.
REVOKE ALL ON public.professional_permissions FROM anon;
