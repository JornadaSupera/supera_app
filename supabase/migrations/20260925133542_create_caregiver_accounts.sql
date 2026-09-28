-- Fase 4 das pendencias consolidadas — o acompanhante criado pelo paciente.
-- Item 4.1 (app #30). Decisoes: ADR-026. Substitui o convite de
-- create_caregiver_links, que sai inteiro daqui.
--
-- O FLUXO, de ponta a ponta (as Edge Functions estao em supabase/functions/):
--
--   create-caregiver (JWT do titular)
--     prepare_caregiver_creation       -> recusa cedo: nao e titular, ja tem
--                                         acompanhante, telefone invalido, cota
--     find_reusable_caregiver_account  -> service_role: a conta adormecida do
--                                         mesmo paciente volta; outra conta e
--                                         `email_in_use`
--     Auth Admin API                   -> cria ou reaproveita a conta, com a
--                                         senha provisoria e, em app_metadata,
--                                         must_change_password e o PASSE
--                                         caregiver_setup_for = <patient_id>
--     link_caregiver_account           -> JWT do titular: perfil, vinculo
--                                         `pending` e emissao, numa transacao,
--                                         com o PACIENTE como autor na trilha
--   complete-first-password (JWT do acompanhante)
--     check_first_password_window      -> ha vinculo pendente e a senha vale?
--     troca a senha, zera o flag       -> Auth
--     activate_my_caregiver_link       -> `pending` -> `active`. SO AQUI o
--                                         acesso delegado comeca
--   reset-caregiver-password (JWT do titular)
--     begin_caregiver_password_reset   -> `active` -> `pending` e emissao nova
--
-- A DECISAO QUE CARREGA O RESTO (ADR-026 §2): o acesso nao espera um flag, espera
-- um ESTADO. O vinculo nasce `pending`, e todo predicado do sistema —
-- my_ward_patient_ids, o produtor de notificacoes, a reavaliacao do envio, a
-- qualidade do ator na trilha — ja filtra `status = 'active'`. O bloqueio ate a
-- troca de senha vale no banco inteiro sem reescrever uma politica, e o passo
-- que o ativa e ato do PROPRIO acompanhante. E ai que o consentimento dele,
-- que o convite colhia no aceite, passa a morar.
--
-- O flag must_change_password em app_metadata continua existindo, e e do app:
-- e como a tela sabe que deve pedir a senha nova. Nao decide acesso.


-- ============================================================
-- 1. O que muda nas tabelas do agregado
-- ============================================================

-- Quando o acompanhante ativou o vinculo pela ultima vez. As linhas antigas
-- nasceram ativas pelo aceite do convite, e o aceite era a ativacao.
ALTER TABLE public.patient_caregivers
  ADD COLUMN activated_at timestamptz;

UPDATE public.patient_caregivers SET activated_at = granted_at;

ALTER TABLE public.patient_caregivers
  ADD CONSTRAINT ck_patient_caregivers_activated
  CHECK (status <> 'active' OR activated_at IS NOT NULL)
  NOT VALID;   -- validada em validate_caregiver_activated_constraint

COMMENT ON COLUMN public.patient_caregivers.activated_at IS
  'Ultima ativacao pelo proprio acompanhante (troca da senha provisoria). Vinculo `pending` pode ter valor: e o que sobrou de antes de um reset.';

-- UM VINCULO CORRENTE POR PACIENTE, E AGORA TAMBEM POR ACOMPANHANTE.
-- `pending` conta: sem isso, o paciente criaria um segundo acompanhante com o
-- primeiro ainda sem trocar a senha, e o indice deixaria.
--
-- O segundo indice desfaz a pluralidade que create_caregiver_links defendia
-- ("quem cuida do pai e da mae"). E o preco do fluxo novo, e esta pago na
-- ADR-026 §5: a conta passa a ser criada e resetada PELO PACIENTE. Com dois
-- tutelados, o paciente A resetaria a senha de uma conta que le o prontuario
-- do paciente B, e receberia a senha nova no proprio WhatsApp. Quem cuida dos
-- dois pais tem duas contas, com dois e-mails.
DROP INDEX public.uq_patient_caregivers_active;
CREATE UNIQUE INDEX uq_patient_caregivers_current
  ON public.patient_caregivers (patient_id)
  WHERE status IN ('pending', 'active');

DROP INDEX public.idx_patient_caregivers_caregiver_active;
CREATE UNIQUE INDEX uq_patient_caregivers_caregiver_current
  ON public.patient_caregivers (caregiver_id)
  WHERE status IN ('pending', 'active');

-- Conta que o sistema desativou porque o acompanhante ficou sem vinculo. E a
-- UNICA desativacao que create-caregiver pode desfazer: a do administrador e a
-- do pedido de exclusao nao passam por aqui (secao 4).
ALTER TABLE public.caregivers
  ADD COLUMN dormant_since timestamptz;

COMMENT ON COLUMN public.caregivers.dormant_since IS
  'Preenchida quando a revogacao deixou o acompanhante sem vinculo e o sistema desativou a conta. Limpa quando o mesmo paciente o recria.';


-- ============================================================
-- 2. A emissao da senha provisoria
-- ============================================================
--
-- O banco nunca ve a senha. Ve que ela foi EMITIDA: para qual vinculo, por
-- qual canal, por quem, e ate quando vale. Isso responde tres perguntas que
-- nenhum outro lugar responde:
--   * a validade de 72 h — o Auth nao expira senha, e a janela precisa de um
--     relogio que a Edge Function nao consiga adiantar;
--   * a cota — cada emissao e um SMS pago ou uma senha num historico de
--     WhatsApp, e o paciente nao pode disparar isso em laco;
--   * a investigacao — "quando essa senha saiu, e por onde?".

CREATE TYPE public.caregiver_credential_channel AS ENUM ('whatsapp', 'sms');
CREATE TYPE public.caregiver_credential_reason  AS ENUM ('created', 'reset');

CREATE TABLE public.caregiver_credential_issuances (
  id                uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  link_id           uuid NOT NULL REFERENCES public.patient_caregivers (id) ON DELETE CASCADE,
  patient_id        uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  reason            public.caregiver_credential_reason NOT NULL,
  channel           public.caregiver_credential_channel NOT NULL,
  issued_by_account uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  issued_at         timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_caregiver_credential_issuances_window CHECK (expires_at > issued_at)
);

COMMENT ON TABLE public.caregiver_credential_issuances IS
  'Cada senha provisoria emitida para um acompanhante: vinculo, canal, autor e validade. Nunca a senha. Escrita so por RPC; append-only.';

CREATE INDEX idx_caregiver_credential_issuances_link
  ON public.caregiver_credential_issuances (link_id, issued_at DESC);
CREATE INDEX idx_caregiver_credential_issuances_patient
  ON public.caregiver_credential_issuances (patient_id, issued_at DESC);
CREATE INDEX idx_caregiver_credential_issuances_issued_by
  ON public.caregiver_credential_issuances (issued_by_account);

ALTER TABLE public.caregiver_credential_issuances ENABLE ROW LEVEL SECURITY;

-- O titular ve as emissoes dele; a administracao, para atender quem ligar
-- dizendo que a senha nao chegou. Nem o acompanhante nem o profissional: a
-- validade chega ao acompanhante por check_first_password_window.
CREATE POLICY caregiver_credential_issuances_select_own ON public.caregiver_credential_issuances
  FOR SELECT TO authenticated
  USING (patient_id = (SELECT private.my_own_patient_id()));

CREATE POLICY caregiver_credential_issuances_select_admin ON public.caregiver_credential_issuances
  FOR SELECT TO authenticated
  USING ((SELECT private.is_active_admin()));

CREATE TRIGGER trg_audit_write
  AFTER INSERT OR UPDATE OR DELETE ON public.caregiver_credential_issuances
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');

-- Cota por paciente: cinco emissoes em 24 h, somando criacao e reset. Cinco
-- cobre errar o numero, errar de novo e o acompanhante perder a senha; o
-- sexto na mesma janela ja e laco.
CREATE FUNCTION private.caregiver_credential_quota_exceeded(p_patient_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT count(*) >= 5
    FROM public.caregiver_credential_issuances
   WHERE patient_id = p_patient_id
     AND issued_at > pg_catalog.now() - interval '24 hours';
$$;

-- Validade da senha provisoria: 72 h a partir da emissao (lista, item 4.1).
CREATE FUNCTION private.caregiver_credential_expiry()
RETURNS timestamptz
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.clock_timestamp() + interval '72 hours';
$$;


-- ============================================================
-- 3. O convite sai
-- ============================================================
--
-- As tres RPCs do convite deixam de existir. A tabela fica, somente leitura:
-- `patient_caregivers.invitation_id` aponta para ela, e esse historico e o da
-- exigencia do Anexo I. Convite pendente e cancelado aqui — sem a RPC de
-- aceite ele ja nao abriria nada, mas "pendente" para sempre diria o contrario
-- a quem ler a tabela.

DROP FUNCTION public.invite_caregiver(public.caregiver_invitation_channel, text);
DROP FUNCTION public.cancel_caregiver_invitation(uuid);
DROP FUNCTION public.accept_caregiver_invitation(text);

UPDATE public.caregiver_invitations
   SET status = 'cancelled', cancelled_at = pg_catalog.now()
 WHERE status = 'pending';

COMMENT ON TABLE public.caregiver_invitations IS
  'LEGADO desde 25/09/2026 (ADR-026): o acompanhante passou a ser criado pelo paciente. Somente leitura; guarda a origem dos vinculos antigos.';


-- ============================================================
-- 4. Revogar desliga a conta que fica sem vinculo
-- ============================================================
--
-- Um gatilho, e nao um passo em revoke_caregiver_link, porque ha tres caminhos
-- de revogacao — a RPC do titular, a execucao do pedido de exclusao, e o que
-- vier depois — e a regra tem de valer em todos.
--
-- SO DESLIGA CONTA QUE E APENAS DE ACOMPANHANTE. Um profissional que tambem
-- acompanhava um parente perderia o painel junto com o vinculo, e o paciente
-- teria desligado o acesso de um membro da equipe.
--
-- E so marca `dormant_since` quando foi ESTE gatilho que desligou. Conta que ja
-- estava desligada — pelo administrador, pelo pedido de exclusao — continua sem
-- marca, e create-caregiver nao a reabre.

CREATE FUNCTION private.retire_orphan_caregiver()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account_id uuid;
BEGIN
  SELECT c.account_id INTO v_account_id
    FROM public.caregivers c
   WHERE c.id = NEW.caregiver_id;

  IF EXISTS (SELECT 1 FROM public.patient_caregivers pc
              WHERE pc.caregiver_id = NEW.caregiver_id
                AND pc.status IN ('pending', 'active'))
     OR EXISTS (SELECT 1 FROM public.patients      WHERE account_id = v_account_id)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_account_id)
     OR EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_account_id) THEN
    RETURN NULL;
  END IF;

  UPDATE public.accounts
     SET is_active = false
   WHERE id = v_account_id
     AND is_active;

  IF FOUND THEN
    UPDATE public.caregivers
       SET dormant_since = pg_catalog.clock_timestamp()
     WHERE id = NEW.caregiver_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_retire_orphan_caregiver
  AFTER UPDATE OF status ON public.patient_caregivers
  FOR EACH ROW
  WHEN (OLD.status IN ('pending', 'active') AND NEW.status = 'revoked')
  EXECUTE FUNCTION private.retire_orphan_caregiver();


-- ============================================================
-- 5. As RPCs do titular
-- ============================================================

-- A porta de entrada de create-caregiver: recusa ANTES de a Edge Function
-- criar conta no Auth. Nao escreve nada. Devolve o telefone em E.164, que e o
-- que a funcao usa para o SMS e o que link_caregiver_account grava.
CREATE FUNCTION public.prepare_caregiver_creation(p_phone text)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
  v_phone      text;
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not_patient_owner' USING ERRCODE = '42501';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patient_caregivers
              WHERE patient_id = v_patient_id AND status IN ('pending', 'active')) THEN
    RAISE EXCEPTION 'caregiver_already_active' USING ERRCODE = '23505';
  END IF;

  v_phone := private.normalize_br_phone(p_phone);
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  IF private.caregiver_credential_quota_exceeded(v_patient_id) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  RETURN v_phone;
END;
$$;

-- O PASSE. Quem cria a conta no Auth e a Edge Function, com service_role; quem
-- grava o vinculo e esta RPC, com o JWT do titular, para que a trilha diga que
-- foi o PACIENTE. Entre as duas, o que impede o titular de "adotar" uma conta
-- qualquer e o `caregiver_setup_for` em app_metadata: so service_role escreve
-- app_metadata, e a funcao so o grava depois de conferir o titular.
--
-- Sem o passe, esta RPC pegaria qualquer account_id: o titular faria de uma
-- conta recem-cadastrada no app — a de um futuro paciente, por exemplo — o
-- acompanhante dele, e essa pessoa passaria a ler o prontuario do titular.
CREATE FUNCTION public.link_caregiver_account(
  p_account_id uuid,
  p_full_name  text,
  p_phone      text,
  p_channel    public.caregiver_credential_channel
)
RETURNS TABLE (link_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id   uuid := private.my_own_patient_id();
  v_name         text := NULLIF(pg_catalog.btrim(p_full_name), '');
  v_phone        text := private.normalize_br_phone(p_phone);
  v_setup_for    text;
  v_caregiver    public.caregivers;
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not_patient_owner' USING ERRCODE = '42501';
  END IF;

  SELECT u.raw_app_meta_data ->> 'caregiver_setup_for' INTO v_setup_for
    FROM auth.users u
   WHERE u.id = p_account_id
   FOR UPDATE;

  IF v_setup_for IS DISTINCT FROM v_patient_id::text THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;

  -- Cinto: find_reusable_caregiver_account ja recusou, mas o passe nao pode
  -- ser o unico lugar em que isto e verdade.
  IF p_account_id = auth.uid()
     OR EXISTS (SELECT 1 FROM public.patients      WHERE account_id = p_account_id)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = p_account_id)
     OR EXISTS (SELECT 1 FROM public.admins        WHERE account_id = p_account_id) THEN
    RAISE EXCEPTION 'email_in_use' USING ERRCODE = '23505';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patient_caregivers
              WHERE patient_id = v_patient_id AND status IN ('pending', 'active')) THEN
    RAISE EXCEPTION 'caregiver_already_active' USING ERRCODE = '23505';
  END IF;

  IF private.caregiver_credential_quota_exceeded(v_patient_id) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  SELECT * INTO v_caregiver FROM public.caregivers WHERE account_id = p_account_id;

  IF NOT FOUND THEN
    INSERT INTO public.caregivers (account_id)
    VALUES (p_account_id)
    RETURNING * INTO v_caregiver;
  ELSIF NOT v_caregiver.is_active THEN
    -- Perfil desligado pela administracao nao volta pela mao do paciente.
    RAISE EXCEPTION 'caregiver_disabled' USING ERRCODE = '42501';
  ELSE
    UPDATE public.caregivers SET dormant_since = NULL WHERE id = v_caregiver.id;
  END IF;

  UPDATE public.accounts
     SET full_name = v_name,
         phone     = v_phone,
         is_active = true
   WHERE id = p_account_id;

  INSERT INTO public.patient_caregivers (patient_id, caregiver_id, status)
  VALUES (v_patient_id, v_caregiver.id, 'pending')
  RETURNING id INTO link_id;

  INSERT INTO public.caregiver_credential_issuances
    (link_id, patient_id, reason, channel, issued_by_account, expires_at)
  VALUES
    (link_id, v_patient_id, 'created', p_channel, auth.uid(), private.caregiver_credential_expiry())
  RETURNING caregiver_credential_issuances.expires_at INTO expires_at;

  -- O passe e de uso unico.
  UPDATE auth.users
     SET raw_app_meta_data = raw_app_meta_data - 'caregiver_setup_for'
   WHERE id = p_account_id;

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel) IS
  'Segundo passo de create-caregiver: perfil, vinculo `pending` e emissao, com o titular como autor. Exige o passe caregiver_setup_for que so service_role grava.';

-- Reset pelo titular. O vinculo volta a `pending`: a senha nova esta, de novo,
-- nas maos de outra pessoa (o WhatsApp do titular, o SMS), e o acesso so volta
-- quando o acompanhante a trocar. Devolve a conta, para a Edge Function saber
-- de quem trocar a senha.
CREATE FUNCTION public.begin_caregiver_password_reset(p_channel public.caregiver_credential_channel)
RETURNS TABLE (caregiver_account_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
  v_link       public.patient_caregivers;
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not_patient_owner' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_link
    FROM public.patient_caregivers
   WHERE patient_id = v_patient_id
     AND status IN ('pending', 'active')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'caregiver_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF private.caregiver_credential_quota_exceeded(v_patient_id) THEN
    RAISE EXCEPTION 'rate_limited' USING ERRCODE = '53400';
  END IF;

  UPDATE public.patient_caregivers
     SET status = 'pending'
   WHERE id = v_link.id
     AND status = 'active';

  INSERT INTO public.caregiver_credential_issuances
    (link_id, patient_id, reason, channel, issued_by_account, expires_at)
  VALUES
    (v_link.id, v_patient_id, 'reset', p_channel, auth.uid(), private.caregiver_credential_expiry())
  RETURNING caregiver_credential_issuances.expires_at INTO expires_at;

  SELECT c.account_id INTO caregiver_account_id
    FROM public.caregivers c WHERE c.id = v_link.caregiver_id;

  RETURN NEXT;
END;
$$;

-- O acompanhante, visto pelo titular. Vazio para quem nao tem — e para quem
-- nao e titular: e leitura, e "nada" e a resposta honesta.
CREATE FUNCTION public.get_my_caregiver()
RETURNS TABLE (
  link_id                        uuid,
  caregiver_account_id           uuid,
  full_name                      text,
  email                          text,
  phone                          text,
  status                         public.caregiver_link_status,
  granted_at                     timestamptz,
  activated_at                   timestamptz,
  temporary_password_expires_at  timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pc.id, a.id, a.full_name, a.email::text, a.phone, pc.status,
         pc.granted_at, pc.activated_at,
         -- So faz sentido enquanto o vinculo espera a troca.
         CASE WHEN pc.status = 'pending' THEN (
           SELECT i.expires_at FROM public.caregiver_credential_issuances i
            WHERE i.link_id = pc.id
            ORDER BY i.issued_at DESC LIMIT 1)
         END
    FROM public.patient_caregivers pc
    JOIN public.caregivers c ON c.id = pc.caregiver_id
    JOIN public.accounts   a ON a.id = c.account_id
   WHERE pc.patient_id = private.my_own_patient_id()
     AND pc.status IN ('pending', 'active');
$$;

-- Nome e telefone do acompanhante. RPC e nao Edge Function, ao contrario do
-- que a lista pedia (ADR-026 §6): nada do Auth muda — o login e o e-mail, e o
-- nome e o telefone moram em `accounts` —, e a RPC da a transacao e o
-- titular como autor na trilha de graca.
CREATE FUNCTION public.update_my_caregiver(
  p_full_name text DEFAULT NULL,
  p_phone     text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id uuid := private.my_own_patient_id();
  v_account_id uuid;
  v_name       text := NULLIF(pg_catalog.btrim(p_full_name), '');
  v_phone      text;
BEGIN
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'not_patient_owner' USING ERRCODE = '42501';
  END IF;

  SELECT c.account_id INTO v_account_id
    FROM public.patient_caregivers pc
    JOIN public.caregivers c ON c.id = pc.caregiver_id
   WHERE pc.patient_id = v_patient_id
     AND pc.status IN ('pending', 'active');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'caregiver_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF p_full_name IS NOT NULL AND v_name IS NULL THEN
    RAISE EXCEPTION 'invalid_name' USING ERRCODE = '22023';
  END IF;

  IF p_phone IS NOT NULL THEN
    v_phone := private.normalize_br_phone(p_phone);
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
    END IF;
  END IF;

  UPDATE public.accounts
     SET full_name = coalesce(v_name, full_name),
         phone     = coalesce(v_phone, phone)
   WHERE id = v_account_id;
END;
$$;

-- Revogar alcanca tambem o vinculo pendente. Mesma assinatura: CREATE OR
-- REPLACE preserva o ACL.
CREATE OR REPLACE FUNCTION public.revoke_caregiver_link(p_link_id uuid)
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
     AND status IN ('pending', 'active');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'link_not_active' USING ERRCODE = '42501';
  END IF;
END;
$$;


-- ============================================================
-- 6. As RPCs do acompanhante
-- ============================================================

-- O vinculo pendente de quem chama, e a validade da senha que ele usou.
CREATE FUNCTION private.my_pending_caregiver_link()
RETURNS TABLE (link_id uuid, expires_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pc.id,
         (SELECT i.expires_at FROM public.caregiver_credential_issuances i
           WHERE i.link_id = pc.id
           ORDER BY i.issued_at DESC LIMIT 1)
    FROM public.patient_caregivers pc
    JOIN public.caregivers c ON c.id = pc.caregiver_id
    JOIN public.accounts   a ON a.id = c.account_id
   WHERE a.id = auth.uid()
     AND a.is_active
     AND c.is_active
     AND pc.status = 'pending';
$$;

-- Primeiro passo de complete-first-password: antes de trocar a senha, a
-- funcao pergunta se ha o que ativar. Devolve a validade.
CREATE FUNCTION public.check_first_password_window()
RETURNS timestamptz
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_pending record;
BEGIN
  SELECT * INTO v_pending FROM private.my_pending_caregiver_link();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_first_login' USING ERRCODE = '42501';
  END IF;

  IF v_pending.expires_at IS NULL OR v_pending.expires_at <= pg_catalog.clock_timestamp() THEN
    RAISE EXCEPTION 'temporary_password_expired' USING ERRCODE = '42501';
  END IF;

  RETURN v_pending.expires_at;
END;
$$;

-- A ativacao. SO passa com must_change_password ja zerado no Auth — e so
-- service_role zera, depois de trocar a senha. Sem essa condicao, o
-- acompanhante chamaria esta RPC direto e usaria a senha provisoria para
-- sempre, com ela parada no historico do WhatsApp de outra pessoa.
CREATE FUNCTION public.activate_my_caregiver_link()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_expires timestamptz := public.check_first_password_window();
  v_link_id uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM auth.users u
              WHERE u.id = auth.uid()
                AND u.raw_app_meta_data ->> 'must_change_password' = 'true') THEN
    RAISE EXCEPTION 'password_change_required' USING ERRCODE = '42501';
  END IF;

  SELECT p.link_id INTO v_link_id FROM private.my_pending_caregiver_link() p;

  UPDATE public.patient_caregivers
     SET status       = 'active',
         activated_at = pg_catalog.clock_timestamp()
   WHERE id = v_link_id
     AND status = 'pending';

  RETURN v_link_id;
END;
$$;


-- ============================================================
-- 7. O lado service_role
-- ============================================================
--
-- create-caregiver pergunta aqui se o e-mail informado pode virar acompanhante.
-- NULL = nao ha conta, crie. Um id = a conta volta. Erro = `email_in_use`.
--
-- A CONTA SO VOLTA PARA O MESMO PACIENTE. O reaproveitamento troca a senha, e a
-- senha nova vai para o titular que pediu. Se ele pudesse reaproveitar a conta
-- adormecida de quem acompanhou OUTRO paciente, receberia uma conta com a
-- caixa de notificacoes dessa pessoa, e as notificacoes dizem quando o outro
-- paciente teve compromisso marcado. Mesmo motivo para recusar conta com
-- pedido de exclusao executado: a pessoa pediu para sair.

CREATE FUNCTION public.find_reusable_caregiver_account(p_email text, p_patient_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_account public.accounts;
  v_cg      public.caregivers;
  v_last    uuid;
BEGIN
  -- OPERATOR(extensions.=), e nao `=`: com search_path vazio o operador do
  -- citext nao e encontrado, a comparacao cai para `text = text` e passa a
  -- distinguir caixa. Medido: 'Fulano@x' nao achava 'fulano@x', e a conta
  -- adormecida virava conta nova — com o e-mail ja em uso no Auth.
  SELECT * INTO v_account FROM public.accounts
   WHERE email OPERATOR(extensions.=) pg_catalog.btrim(p_email)::extensions.citext;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_cg FROM public.caregivers WHERE account_id = v_account.id;

  SELECT pc.patient_id INTO v_last
    FROM public.patient_caregivers pc
   WHERE pc.caregiver_id = v_cg.id
   ORDER BY pc.granted_at DESC
   LIMIT 1;

  IF v_cg.id IS NULL
     OR NOT v_cg.is_active
     OR v_cg.dormant_since IS NULL
     OR v_account.is_active
     OR v_last IS DISTINCT FROM p_patient_id
     OR EXISTS (SELECT 1 FROM public.patient_caregivers pc
                 WHERE pc.caregiver_id = v_cg.id AND pc.status IN ('pending', 'active'))
     OR EXISTS (SELECT 1 FROM public.patients      WHERE account_id = v_account.id)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_account.id)
     OR EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_account.id)
     OR EXISTS (SELECT 1 FROM public.data_subject_requests r
                 WHERE r.account_id = v_account.id
                   AND r.request_type = 'deletion'
                   AND r.status = 'executed') THEN
    RAISE EXCEPTION 'email_in_use' USING ERRCODE = '23505';
  END IF;

  RETURN v_account.id;
END;
$$;


-- ============================================================
-- 8. A exclusao do titular alcanca o vinculo pendente
-- ============================================================
--
-- Copia de close_data_subject_request_cycle com UMA mudanca: o passo (b)
-- revoga `pending` alem de `active`. Sem ela, o acompanhante recem-criado de
-- quem pediu exclusao trocaria a senha depois e ativaria um vinculo com um
-- titular que saiu.

CREATE OR REPLACE FUNCTION private.execute_data_subject_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req public.data_subject_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_req
    FROM public.data_subject_requests
   WHERE id = p_request_id
     AND status = 'granted'
     AND request_type IN ('deletion', 'consent_revocation')
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_executable' USING ERRCODE = '42501';
  END IF;

  -- (a) consentimentos
  UPDATE public.consent_records
     SET revoked_at = pg_catalog.clock_timestamp()
   WHERE account_id = v_req.account_id
     AND revoked_at IS NULL;

  IF v_req.request_type = 'deletion' THEN
    -- (b) vinculos, dos dois lados — pendentes inclusive (ADR-026)
    UPDATE public.patient_caregivers pc
       SET status             = 'revoked',
           revoked_at         = pg_catalog.clock_timestamp(),
           revoked_by_account = NULL   -- ator do sistema; a trilha diz 'system'
     WHERE pc.status IN ('pending', 'active')
       AND (   pc.patient_id   IN (SELECT p.id FROM public.patients   p WHERE p.account_id = v_req.account_id)
            OR pc.caregiver_id IN (SELECT c.id FROM public.caregivers c WHERE c.account_id = v_req.account_id));

    -- (c) convites pendentes da ficha do titular. Desde a ADR-026 nao nasce
    -- convite novo; o passo fica pelo legado.
    UPDATE public.caregiver_invitations ci
       SET status       = 'cancelled',
           cancelled_at = pg_catalog.clock_timestamp()
     WHERE ci.status = 'pending'
       AND ci.patient_id IN (SELECT p.id FROM public.patients p WHERE p.account_id = v_req.account_id);

    -- (d) a conta. protect_last_admin recusa aqui se for o ultimo
    -- administrador — e a recusa chega a `execution_error`, nao se perde.
    UPDATE public.accounts
       SET is_active = false
     WHERE id = v_req.account_id
       AND is_active;
  END IF;

  UPDATE public.data_subject_requests
     SET status          = 'executed',
         executed_at     = pg_catalog.clock_timestamp(),
         execution_error = NULL
   WHERE id = p_request_id;
END;
$$;


-- ============================================================
-- 9. Privilegios — no fim, e medidos
-- ============================================================

REVOKE ALL    ON public.caregiver_credential_issuances FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.caregiver_credential_issuances TO authenticated;

REVOKE EXECUTE ON FUNCTION private.caregiver_credential_quota_exceeded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.caregiver_credential_expiry()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.retire_orphan_caregiver()                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.my_pending_caregiver_link()               FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.prepare_caregiver_creation(text)                                              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel)  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.begin_caregiver_password_reset(public.caregiver_credential_channel)            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_caregiver()                                                            FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_my_caregiver(text, text)                                               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_first_password_window()                                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.activate_my_caregiver_link()                                                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_reusable_caregiver_account(text, uuid)                                   FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.prepare_caregiver_creation(text)                                             TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel) TO authenticated;
GRANT EXECUTE ON FUNCTION public.begin_caregiver_password_reset(public.caregiver_credential_channel)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_caregiver()                                                           TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_caregiver(text, text)                                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_first_password_window()                                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_my_caregiver_link()                                                 TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_reusable_caregiver_account(text, uuid)                                  TO service_role;

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.prepare_caregiver_creation(text)',
    'public.link_caregiver_account(uuid, text, text, public.caregiver_credential_channel)',
    'public.begin_caregiver_password_reset(public.caregiver_credential_channel)',
    'public.get_my_caregiver()',
    'public.update_my_caregiver(text, text)',
    'public.check_first_password_window()',
    'public.activate_my_caregiver_link()'
  ] LOOP
    IF pg_catalog.has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'anon alcanca %', v_fn;
    END IF;
    IF NOT pg_catalog.has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'authenticated perdeu %', v_fn;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('authenticated', 'public.find_reusable_caregiver_account(text, uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.find_reusable_caregiver_account(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'find_reusable_caregiver_account alcancavel fora do service_role';
  END IF;
  IF NOT pg_catalog.has_function_privilege('service_role', 'public.find_reusable_caregiver_account(text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu find_reusable_caregiver_account';
  END IF;

  IF pg_catalog.has_table_privilege('anon', 'public.caregiver_credential_issuances', 'SELECT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.caregiver_credential_issuances', 'INSERT')
     OR pg_catalog.has_table_privilege('authenticated', 'public.caregiver_credential_issuances', 'UPDATE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.caregiver_credential_issuances', 'DELETE')
     OR pg_catalog.has_table_privilege('authenticated', 'public.caregiver_credential_issuances', 'TRUNCATE') THEN
    RAISE EXCEPTION 'caregiver_credential_issuances aceita escrita da API';
  END IF;
END;
$$;
