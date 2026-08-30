-- Agregado Vínculos — o acesso delegado do cuidador acompanhante.
-- Design e racional: supera-docs/Modelo de Dados/Vínculos de cuidador.md
-- Decisões: ADR-001 (nomes/PK), ADR-002 (vocabulário), ADR-003 §4 (cuidador).
--
-- Fecha a camada de acesso: depois deste arquivo, os quatro perfis da ADR-003
-- têm predicado. Nenhuma tabela clínica deveria nascer antes, porque a política
-- do cuidador de toda uma delas é my_ward_patient_ids() — que só existe aqui.
--
-- Duas invariantes mandam no desenho:
--   1. Revogação é INSTANTÂNEA (Anexo I) => autorização por lookup, nunca claim.
--   2. O convite não expira (#13) => o token é chave de acesso a dado de saúde
--      com validade indefinida. Hash, uso único e cancelamento pelo titular são
--      as ÚNICAS defesas; nenhuma delas é opcional.


-- ============================================================
-- Vocabulário
-- ============================================================
--
-- O ciclo de vida do domínio (convidado -> ativo -> revogado, mais cancelado)
-- não cabe num enum só porque atravessa DUAS entidades: o convite existe antes
-- do vínculo, e o vínculo sobrevive ao convite. Convidado/cancelado são estados
-- do convite; ativo/revogado, do vínculo. O aceite é a costura entre os dois.

CREATE TYPE public.caregiver_invitation_status AS ENUM (
  'pending',
  'accepted',
  'cancelled'
);

-- Enum e não tabela de domínio (ADR-002): o código RAMIFICA no valor — quem
-- envia é o remetente de SMS ou o de e-mail. As fontes fixam os dois canais.
CREATE TYPE public.caregiver_invitation_channel AS ENUM (
  'sms',
  'email'
);

CREATE TYPE public.caregiver_link_status AS ENUM (
  'active',
  'revoked'
);


-- ============================================================
-- Tabelas
-- ============================================================

CREATE TABLE public.caregiver_invitations (
  id                  uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id          uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  channel             public.caregiver_invitation_channel NOT NULL,
  -- Telefone ou e-mail de TERCEIRO, coletado antes de qualquer consentimento
  -- dele. Existe só para entregar o convite — ver #27 (retenção) na nota.
  destination         text NOT NULL CHECK (length(btrim(destination)) > 0),
  -- SHA-256 do token, nunca o token. Vazamento desta coluna não dá acesso;
  -- vazamento do texto puro daria, para sempre, porque o convite não expira.
  token_hash          bytea NOT NULL UNIQUE,
  status              public.caregiver_invitation_status NOT NULL DEFAULT 'pending',
  -- NULLABLE E SEM DEFAULT, de propósito (#13): o mecanismo de expiração fica
  -- instalado e desligado. Ligar depois é preencher a coluna, não migrar.
  expires_at          timestamptz,
  invited_by_account  uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  accepted_at         timestamptz,
  accepted_by_account uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  cancelled_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- Estado e timestamp são a MESMA informação em duas colunas. Sem estas três,
  -- "histórico com timestamp de cada vínculo" (Anexo I) depende de disciplina
  -- de aplicação; com elas, é constraint.
  CONSTRAINT ck_caregiver_invitations_accepted
    CHECK ((status = 'accepted') = (accepted_at IS NOT NULL)),
  CONSTRAINT ck_caregiver_invitations_accepted_actor
    CHECK (status <> 'accepted' OR accepted_by_account IS NOT NULL),
  CONSTRAINT ck_caregiver_invitations_cancelled
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

COMMENT ON TABLE public.caregiver_invitations IS
  'Convite de acompanhante. Escrita SÓ por RPC: no aceite o cuidador ainda não tem vínculo, e nenhuma política o autorizaria.';

COMMENT ON COLUMN public.caregiver_invitations.token_hash IS
  'SHA-256 do token de uso único. O texto puro é devolvido uma vez por invite_caregiver() e nunca persistido.';

-- Um convite pendente por paciente. Não é higiene: como o convite não expira,
-- cada pendente é uma chave viva. N pendentes = N chaves que o titular
-- precisaria cancelar uma a uma para fechar o acesso.
CREATE UNIQUE INDEX uq_caregiver_invitations_pending
  ON public.caregiver_invitations (patient_id)
  WHERE status = 'pending';

CREATE INDEX idx_caregiver_invitations_patient_id
  ON public.caregiver_invitations (patient_id);


CREATE TABLE public.patient_caregivers (
  id                 uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id         uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  caregiver_id       uuid NOT NULL REFERENCES public.caregivers (id) ON DELETE CASCADE,
  -- De onde veio este vínculo. SET NULL e não CASCADE: apagar o convite não
  -- pode apagar o vínculo — o histórico é exigência da fonte.
  invitation_id      uuid UNIQUE REFERENCES public.caregiver_invitations (id) ON DELETE SET NULL,
  status             public.caregiver_link_status NOT NULL DEFAULT 'active',
  granted_at         timestamptz NOT NULL DEFAULT now(),
  revoked_at         timestamptz,
  revoked_by_account uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_patient_caregivers_revoked
    CHECK ((status = 'revoked') = (revoked_at IS NOT NULL)),
  CONSTRAINT ck_patient_caregivers_period
    CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);

COMMENT ON TABLE public.patient_caregivers IS
  'Vínculo paciente x cuidador. Linha revogada NÃO é apagada: o histórico com timestamp de cada vínculo e revogação é exigência do Anexo I.';

-- "Um acompanhante POR PACIENTE" — a fonte limita o número de acompanhantes do
-- paciente, e não o de pacientes de uma pessoa. Por isso o índice é parcial
-- sobre patient_id, e my_ward_patient_ids() é PLURAL: quem cuida do pai e da
-- mãe, ambos na CEON, é caso real.
CREATE UNIQUE INDEX uq_patient_caregivers_active
  ON public.patient_caregivers (patient_id)
  WHERE status = 'active';

-- O índice que my_ward_patient_ids() percorre a cada query do cuidador.
CREATE INDEX idx_patient_caregivers_caregiver_active
  ON public.patient_caregivers (caregiver_id)
  WHERE status = 'active';


-- ============================================================
-- Helpers de autorização
-- ============================================================

-- Escalar: o perfil de cuidador é único por conta (UNIQUE em caregivers).
-- NULL para quem não é cuidador => coluna = NULL nunca é verdadeiro.
CREATE FUNCTION private.my_caregiver_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT c.id
  FROM public.caregivers c
  JOIN public.accounts a ON a.id = c.account_id
  WHERE a.id = auth.uid()
    AND a.is_active
    AND c.is_active;
$$;

-- O predicado do cuidador em TODA tabela clínica futura, e o mecanismo da
-- revogação instantânea: a política reexecuta este lookup a cada query — e, no
-- Realtime, a cada registro do WAL. Não há claim em JWT para ficar obsoleto.
--
-- Plural por construção. Vazio => = ANY('{}') => nega. Fail-closed.
-- coalesce para '{}': array_agg sobre zero linhas devolve NULL, e = ANY (NULL)
-- nega por acidente de três valores em vez de por decisão.
CREATE FUNCTION private.my_ward_patient_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce(array_agg(pc.patient_id), '{}'::uuid[])
  FROM public.patient_caregivers pc
  JOIN public.caregivers c ON c.id = pc.caregiver_id
  JOIN public.accounts   a ON a.id = c.account_id
  JOIN public.patients   p ON p.id = pc.patient_id
  WHERE a.id = auth.uid()
    AND a.is_active
    AND c.is_active
    AND p.is_active
    AND pc.status = 'active';
$$;

COMMENT ON FUNCTION private.my_ward_patient_ids() IS
  'Use SEMPRE como patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) — a forma = ANY (f()) compila mas avalia por linha (medido: 111x mais lento).';


-- ============================================================
-- RPCs do ciclo de vida
-- ============================================================
--
-- Todo o ciclo é RPC, e as tabelas não têm política de escrita nenhuma. Não é
-- preferência de estilo: no instante do aceite o cuidador ainda não tem
-- vínculo, então nenhuma política de UPDATE poderia autorizá-lo. Sendo o
-- aceite necessariamente RPC, deixar convite e revogação em política criaria
-- dois caminhos de escrita para a mesma máquina de estados.

-- Devolve o token EM TEXTO PURO, uma única vez. Quem entrega (SMS/e-mail) é a
-- Edge Function de envio; o banco não guarda como reemitir.
CREATE FUNCTION public.invite_caregiver(
  p_channel     public.caregiver_invitation_channel,
  p_destination text
)
RETURNS TABLE (invitation_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
  v_token      text;
BEGIN
  -- SÓ o titular convida. O cuidador não gerencia o próprio vínculo (Anexo I),
  -- e o profissional/administrador convidando por ele seria consentimento
  -- de terceiro sobre dado sensível.
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.patient_caregivers
    WHERE patient_id = v_patient_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'caregiver_already_linked' USING ERRCODE = '23505';
  END IF;

  -- 32 bytes de CSPRNG. Em hex, 64 caracteres — impraticável de adivinhar,
  -- que é o requisito quando o convite não expira.
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.caregiver_invitations
    (patient_id, channel, destination, token_hash, invited_by_account)
  VALUES
    (v_patient_id, p_channel, pg_catalog.btrim(p_destination),
     extensions.digest(v_token, 'sha256'), auth.uid())
  RETURNING id INTO invitation_id;

  token := v_token;
  RETURN NEXT;
END;
$$;

CREATE FUNCTION public.cancel_caregiver_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.caregiver_invitations
     SET status = 'cancelled', cancelled_at = pg_catalog.now()
   WHERE id = p_invitation_id
     AND patient_id = v_patient_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_pending' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- O aceite. Chamado por conta autenticada que AINDA NÃO É cuidadora.
CREATE FUNCTION public.accept_caregiver_invitation(p_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_invitation public.caregiver_invitations;
  v_caregiver  public.caregivers;
  v_link_id    uuid;
BEGIN
  -- service_role chega com auth.uid() NULL. Aceitar convite em nome de
  -- ninguém criaria vínculo sem titular do acesso.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_uid AND is_active) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- FOR UPDATE fecha a corrida de dois aceites simultâneos do mesmo token.
  SELECT * INTO v_invitation
  FROM public.caregiver_invitations
  WHERE token_hash = extensions.digest(p_token, 'sha256')
    AND status = 'pending'
    AND (expires_at IS NULL OR expires_at > pg_catalog.now())
  FOR UPDATE;

  -- Erro deliberadamente genérico e único para token inexistente, já usado e
  -- expirado: distinguir os casos transformaria o RPC em oráculo de convites.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '42501';
  END IF;

  -- O titular não pode ser o próprio acompanhante: o vínculo existe para dar
  -- acesso a OUTRA pessoa, e um autovínculo criaria um segundo caminho de
  -- leitura para os mesmos dados, fora do predicado do titular.
  IF EXISTS (
    SELECT 1 FROM public.patients
    WHERE id = v_invitation.patient_id AND account_id = v_uid
  ) THEN
    RAISE EXCEPTION 'self_caregiving_not_allowed' USING ERRCODE = '42501';
  END IF;

  -- O perfil de cuidador nasce AQUI: é o aceite que torna a pessoa cuidadora.
  INSERT INTO public.caregivers (account_id)
  VALUES (v_uid)
  ON CONFLICT (account_id) DO NOTHING;

  SELECT * INTO v_caregiver
  FROM public.caregivers
  WHERE account_id = v_uid;

  -- DO NOTHING e não DO UPDATE SET is_active = true: cuidador desativado pela
  -- administração não se reativa aceitando um convite novo.
  IF NOT v_caregiver.is_active THEN
    RAISE EXCEPTION 'caregiver_disabled' USING ERRCODE = '42501';
  END IF;

  -- Cinto além do uq_patient_caregivers_active: mensagem de negócio em vez de
  -- violação de índice, para o caso de convite aceito depois de outro vínculo.
  IF EXISTS (
    SELECT 1 FROM public.patient_caregivers
    WHERE patient_id = v_invitation.patient_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'caregiver_already_linked' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.patient_caregivers (patient_id, caregiver_id, invitation_id)
  VALUES (v_invitation.patient_id, v_caregiver.id, v_invitation.id)
  RETURNING id INTO v_link_id;

  UPDATE public.caregiver_invitations
     SET status = 'accepted',
         accepted_at = pg_catalog.now(),
         accepted_by_account = v_uid
   WHERE id = v_invitation.id;

  RETURN v_link_id;
END;
$$;

-- Revogação. É o freio único do convite que não expira, então tem de ser
-- barata e imediata: um UPDATE, e a query seguinte do cuidador já nega.
CREATE FUNCTION public.revoke_caregiver_link(p_link_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_caregivers
     SET status = 'revoked',
         revoked_at = pg_catalog.now(),
         revoked_by_account = auth.uid()
   WHERE id = p_link_id
     AND patient_id = v_patient_id
     AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_active' USING ERRCODE = '42501';
  END IF;
END;
$$;


-- ============================================================
-- RLS
-- ============================================================
--
-- REGRA (ADR-003): um perfil, uma política. E NENHUMA política de escrita:
-- todo INSERT/UPDATE vem dos RPCs acima, sob SECURITY DEFINER com checagem no
-- corpo. Default deny cobre o resto, inclusive o que ninguém listou.

ALTER TABLE public.caregiver_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_caregivers    ENABLE ROW LEVEL SECURITY;

-- Convite: SÓ o titular. Nem o cuidador (que no pendente ainda não existe como
-- perfil, e depois não gerencia o próprio vínculo), nem o profissional, nem a
-- administração — o convite carrega telefone/e-mail de terceiro que não
-- consentiu com nada, e a lista de pendentes é superfície de enumeração.
CREATE POLICY caregiver_invitations_select_own ON public.caregiver_invitations
  FOR SELECT TO authenticated
  USING (patient_id = (SELECT private.my_own_patient_id()));

-- Vínculo: o titular vê o próprio histórico...
CREATE POLICY patient_caregivers_select_own ON public.patient_caregivers
  FOR SELECT TO authenticated
  USING (patient_id = (SELECT private.my_own_patient_id()));

-- ...o cuidador vê os vínculos DELE (é como o app descobre quem ele acompanha),
-- e só isso: ver não é gerenciar, e não há política de UPDATE para ele.
CREATE POLICY patient_caregivers_select_caregiver ON public.patient_caregivers
  FOR SELECT TO authenticated
  USING (caregiver_id = (SELECT private.my_caregiver_id()));

-- Profissional: a ficha consultiva mostra "contato do cuidador, quando houver".
-- Booleano, não conjunto de pacientes — a #10 tirou care_links da fronteira.
CREATE POLICY patient_caregivers_select_professional ON public.patient_caregivers
  FOR SELECT TO authenticated
  USING ((SELECT private.is_active_professional()));

CREATE POLICY patient_caregivers_select_admin ON public.patient_caregivers
  FOR SELECT TO authenticated
  USING ((SELECT private.is_active_admin()));


-- ============================================================
-- Triggers
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.caregiver_invitations
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patient_caregivers
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Privilégios — REVOKE depois dos CREATE, GRANT cirúrgico
-- ============================================================

-- Repetido de propósito: o REVOKE de create_identity_core não alcança função
-- criada depois dele.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.my_caregiver_id()      TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_ward_patient_ids()  TO authenticated;

REVOKE EXECUTE ON FUNCTION public.invite_caregiver(public.caregiver_invitation_channel, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cancel_caregiver_invitation(uuid)                           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.accept_caregiver_invitation(text)                           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_caregiver_link(uuid)                                 FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.invite_caregiver(public.caregiver_invitation_channel, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_caregiver_invitation(uuid)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_caregiver_invitation(text)                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_caregiver_link(uuid)                                 TO authenticated;
