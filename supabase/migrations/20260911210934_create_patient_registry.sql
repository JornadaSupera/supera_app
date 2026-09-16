-- Cadastro do paciente e ativacao da conta — o vinculo que faltava.
-- Design e racional: supera-docs/Modelo de Dados/Paciente.md
-- Decisao sob teste:  ADR-020 (ativacao em dois fatores)
-- Fonte: Requisitos/Painel Administrativo/Gestao de pacientes + App do
--        Paciente/Onboarding e autenticacao (fluxo de entrada em tres passos)
--
-- ESTA MIGRATION DESTRAVA O APP DO PACIENTE. Ate aqui `patients` aceitava
-- APENAS leitura: nenhuma politica de escrita, nenhuma RPC, e `account_id` sem
-- caminho para ser preenchido. O efeito nao era "o painel nao cadastra" — era
-- que o aplicativo do paciente NAO PODIA SER USADO POR NINGUEM, porque o app
-- resolve o titular por `patients.account_id` e essa coluna nunca deixava de
-- ser nula. Levantado pelo dev do painel em 10/09/2026 e confirmado aqui.
--
-- O FLUXO QUE AS FONTES DESCREVEM, em tres passos, e o desenho o segue:
--   1. a secretaria cadastra o paciente no painel (sem conta);
--   2. o sistema dispara SMS com link e instrucoes;
--   3. o paciente abre o app, aceita os termos, informa CPF, data de
--      nascimento e telefone, verifica por OTP e cria a senha.
--
-- A PECA QUE FALTAVA e o passo 3 encontrar o passo 1. Aqui ela e um CONVITE
-- COM TOKEN, na forma que `caregiver_invitations` ja provou — e NAO uma busca
-- por CPF, que e o caminho obvio e o errado (ADR-020 §1).


-- ============================================================
-- 1. Vocabulario (ADR-002)
-- ============================================================
--
-- Enum e nao tabela de dominio: e maquina de estados, e o codigo RAMIFICA no
-- valor. Tres estados, e EXPIRACAO NAO ESTA ENTRE ELES — e coluna, pela mesma
-- razao que `confirmed_at` da agenda nao e estado (ADR-014 §2): vencimento e
-- desfecho sao eixos ortogonais. Convite pendente e vencido esta expirado;
-- convite aceito ha um ano nao expira retroativamente.
CREATE TYPE public.patient_invitation_status AS ENUM (
  'pending',
  'accepted',
  'cancelled'
);

COMMENT ON TYPE public.patient_invitation_status IS
  'pendente -> aceito | cancelado. Expiracao NAO e estado: e a coluna expires_at, ortogonal ao desfecho.';


-- ============================================================
-- 2. A tabela do convite
-- ============================================================
--
-- SEM COLUNA DE CANAL, ao contrario de `caregiver_invitations`. Lá as fontes
-- fixam DOIS canais e o codigo ramifica; aqui elas dizem SMS com todas as
-- letras, tres vezes ("botao de envio de convite por SMS", "disparo automatico
-- do convite SMS", "SMS com link e instrucoes"). Inventar o canal de e-mail
-- seria decidir uma tela por conveniencia de modelagem. Acrescentar depois e
-- coluna nova com default — aditivo.

CREATE TABLE public.patient_invitations (
  id                 uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id         uuid NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  -- Para ONDE este convite foi enviado, e nao "o telefone do paciente" — esse
  -- ja mora em `patients.phone` desde create_patient_clinical. A coluna existe
  -- porque o destino e FATO HISTORICO do convite: quando a recepcao corrige um
  -- telefone digitado errado e reenvia, e preciso poder responder para qual
  -- numero o convite anterior foi. Com o destino lido do cadastro no momento
  -- da leitura, a correcao reescreveria o passado.
  --
  -- SEM VALIDACAO DE FORMATO, pela mesma razao de `council_registration`
  -- (#14): formato de telefone brasileiro varia, e a regex inventada rejeita
  -- cadastro LEGITIMO, que e o defeito caro.
  destination        text NOT NULL CHECK (length(btrim(destination)) > 0),
  -- SHA-256 do token, nunca o token. Vazamento desta coluna nao da acesso.
  token_hash         bytea NOT NULL UNIQUE,
  status             public.patient_invitation_status NOT NULL DEFAULT 'pending',
  -- NOT NULL, e aqui a divergencia com o convite de cuidador e DELIBERADA.
  -- Lá a #13 respondeu que o convite NAO expira, e a coluna nasceu nullable e
  -- desligada. A #13 foi perguntada sobre o CUIDADOR — aplicar a resposta dela
  -- aqui seria estender uma resposta a uma pergunta que ninguem fez. Este
  -- token abre um PRONTUARIO, chega por SMS e fica na caixa de entrada de um
  -- numero que a operadora pode reciclar (ADR-020 §2).
  expires_at         timestamptz NOT NULL,
  invited_by_account uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  accepted_at        timestamptz,
  cancelled_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_patient_invitations_accepted
    CHECK ((status = 'accepted')  = (accepted_at  IS NOT NULL)),
  CONSTRAINT ck_patient_invitations_cancelled
    CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
);

COMMENT ON TABLE public.patient_invitations IS
  'Convite de ativacao do app, por SMS. Token guardado como hash; uso unico; expira. E a fila que o painel le para reenviar.';
COMMENT ON COLUMN public.patient_invitations.destination IS
  'Para onde ESTE convite foi enviado. Fato historico, nao o telefone atual do paciente (esse e patients.phone) — corrigir o cadastro nao pode reescrever o destino de convite ja emitido.';
COMMENT ON COLUMN public.patient_invitations.expires_at IS
  'NOT NULL de proposito, ao contrario do convite de cuidador (#13, que era sobre o cuidador). Este token abre prontuario e chega por SMS.';

-- UM convite vivo por paciente. Sem este indice, reenviar deixaria N tokens
-- validos simultaneos para o mesmo prontuario — e o convite antigo, ainda
-- aceitavel, sobreviveria a correcao do telefone que motivou o reenvio.
CREATE UNIQUE INDEX uq_patient_invitations_pending
  ON public.patient_invitations (patient_id)
  WHERE status = 'pending';

-- A pergunta da tela: "o que ha para reenviar?"
CREATE INDEX idx_patient_invitations_pending
  ON public.patient_invitations (created_at DESC)
  WHERE status = 'pending';


-- ============================================================
-- 3. O CPF congela na ativacao — e a regra e trigger, nao RPC
-- ============================================================
--
-- CPF e a chave de negocio que liga o cadastro local ao Gemed, e depois da
-- ativacao ele tambem e o que o aceite conferiu. Corrigi-lo numa ficha JA
-- ATIVADA reaponta a identidade sem tocar em `account_id`: a ficha passa a
-- dizer que e de outra pessoa, enquanto continua ligada a conta da primeira.
-- No dia em que a sincronizacao resolver por CPF, ela junta os dois
-- prontuarios (ADR-020 §5).
--
-- TRIGGER E NAO CHECAGEM NA RPC, e a distincao importa: o que roda com
-- `service_role` IGNORA RLS e nao passa pelas RPCs. Regra que so vive na
-- funcao e convencao; aqui ela precisa ser invariante.
--
-- ANTES DA ATIVACAO O CPF MUDA LIVREMENTE: erro de digitacao da recepcao e o
-- caso comum, e e exatamente quando corrigir e inofensivo.
CREATE FUNCTION private.reject_activated_cpf_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.account_id IS NOT NULL AND NEW.cpf IS DISTINCT FROM OLD.cpf THEN
    RAISE EXCEPTION 'cpf_frozen_after_activation'
      USING ERRCODE   = '42501',
            DETAIL    = 'A ficha ja esta vinculada a uma conta.',
            HINT      = 'Desvincule a conta antes de corrigir o CPF (unlink_patient_account).';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.reject_activated_cpf_change() IS
  'CPF e imutavel depois de a ficha ter conta. Trigger e nao RPC: service_role nao passa pelas RPCs.';

CREATE TRIGGER trg_reject_activated_cpf_change
  BEFORE UPDATE OF cpf ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION private.reject_activated_cpf_change();


-- ============================================================
-- 4. Cadastro, correcao e desativacao — RPCs do administrador
-- ============================================================

-- Normalizacao num lugar so. A coluna exige 11 digitos; a tela manda
-- mascarado, e sem isto 123.456.789-00 e 12345678900 viram dois pacientes —
-- o comentario de `patients.cpf` ja anunciava a exigencia e ninguem a
-- implementava, porque nao havia escrita.
CREATE FUNCTION private.normalize_cpf(p_cpf text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT pg_catalog.regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
$$;

COMMENT ON FUNCTION private.normalize_cpf(text) IS
  'Tira mascara do CPF. Chamada por toda RPC que recebe CPF de tela.';

-- As colunas demograficas ja existiam desde create_patient_clinical (email,
-- phone, address, insurance_name) — faltava o caminho de escrita. Diagnostico,
-- estadiamento e protocolo NAO entram aqui: tem RPC propria
-- (upsert_patient_diagnosis, set_treatment_plan), e junta-las faria uma funcao
-- so escrever em quatro tabelas com regras de autorizacao diferentes.
--
-- `demographics_source` NAO e tocada: fica no default 'local', e a edicao
-- manual de ficha ja sincronizada TAMBEM nao a altera. E o desenho da ADR-004
-- §3 — o Gemed vence com valor nao-nulo —, e a contingencia manual prevista em
-- contrato vive de o sync nao apagar o que ele nao traz.
CREATE FUNCTION public.create_patient(
  p_full_name      text,
  p_cpf            text,
  p_birth_date     date,
  p_phone          text  DEFAULT NULL,
  p_email          text  DEFAULT NULL,
  p_address        jsonb DEFAULT NULL,
  p_insurance_name text  DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpf         text := private.normalize_cpf(p_cpf);
  v_id          uuid;
  v_existing    public.patients;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_cpf !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'invalid_cpf'
      USING ERRCODE = '22023',
            DETAIL  = 'CPF precisa ter 11 digitos.';
  END IF;

  -- ERRO DISTINGUIVEL, e nao a violacao de UNIQUE que o banco daria. A razao
  -- e o efeito de segunda ordem: diante de "duplicate key value violates
  -- unique constraint", quem opera a recepcao nao aprende o que fazer, e o
  -- contorno natural e inventar um digito para o cadastro passar. CPF
  -- fabricado quebra o casamento com o Gemed PARA SEMPRE, e num sistema de
  -- saude e dado falso com cara de verdadeiro (ADR-020 §3).
  --
  -- O id vai na mensagem de proposito: so administrador ativo chega aqui, e
  -- ele ja le a tabela inteira. E o que permite ao painel oferecer "abrir a
  -- ficha existente" hoje, antes de `read_patients` saber buscar.
  SELECT * INTO v_existing FROM public.patients WHERE cpf = v_cpf;
  IF FOUND THEN
    IF v_existing.is_active THEN
      RAISE EXCEPTION 'patient_cpf_already_registered'
        USING ERRCODE = '23505',
              DETAIL  = pg_catalog.format('patient_id=%s', v_existing.id),
              HINT    = 'Abra a ficha existente em vez de cadastrar de novo.';
    ELSE
      RAISE EXCEPTION 'patient_cpf_registered_inactive'
        USING ERRCODE = '23505',
              DETAIL  = pg_catalog.format('patient_id=%s', v_existing.id),
              HINT    = 'A ficha existe e esta desativada. Reative com set_patient_active.';
    END IF;
  END IF;

  -- Autoria NAO e coluna: `patients` carrega trg_audit_write desde
  -- create_clinical_read_audit, e o trigger grava auth.uid() como ator. Uma
  -- coluna `created_by` seria segunda copia do mesmo fato, e a ADR-005 proibe
  -- a trilha de copiar dado identificante — o inverso vale igual.
  INSERT INTO public.patients
    (full_name, cpf, birth_date, phone, email, address, insurance_name)
  VALUES
    (pg_catalog.btrim(p_full_name), v_cpf, p_birth_date,
     pg_catalog.btrim(p_phone), pg_catalog.btrim(p_email)::extensions.citext,
     p_address, pg_catalog.btrim(p_insurance_name))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.create_patient(text, text, date, text, text, jsonb, text) IS
  'Cadastra a ficha do paciente, sem conta. Exige admin ativo. Autoria fica em audit_log pelo trg_audit_write.';

CREATE FUNCTION public.update_patient(
  p_patient_id     uuid,
  p_full_name      text  DEFAULT NULL,
  p_cpf            text  DEFAULT NULL,
  p_birth_date     date  DEFAULT NULL,
  p_phone          text  DEFAULT NULL,
  p_email          text  DEFAULT NULL,
  p_address        jsonb DEFAULT NULL,
  p_insurance_name text  DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cpf text := CASE WHEN p_cpf IS NULL THEN NULL ELSE private.normalize_cpf(p_cpf) END;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_cpf IS NOT NULL AND v_cpf !~ '^[0-9]{11}$' THEN
    RAISE EXCEPTION 'invalid_cpf' USING ERRCODE = '22023';
  END IF;

  -- COALESCE, com uma limitacao DECLARADA: argumento nulo significa "nao
  -- mexer", entao esta funcao nao consegue APAGAR telefone, e-mail, endereco
  -- ou convenio — so troca-los. Para as tres primeiras colunas isso nem
  -- aparece, porque sao NOT NULL. Limpar um contato exige payload que
  -- distinga ausencia de nulo (jsonb), e nenhuma fonte pede a operacao;
  -- acrescentar depois e funcao nova, sem tocar nesta.
  --
  -- O congelamento do CPF na ficha ativada e do trigger, nao daqui.
  UPDATE public.patients
     SET full_name      = coalesce(pg_catalog.btrim(p_full_name), full_name),
         cpf            = coalesce(v_cpf, cpf),
         birth_date     = coalesce(p_birth_date, birth_date),
         phone          = coalesce(pg_catalog.btrim(p_phone), phone),
         email          = coalesce(pg_catalog.btrim(p_email)::extensions.citext, email),
         address        = coalesce(p_address, address),
         insurance_name = coalesce(pg_catalog.btrim(p_insurance_name), insurance_name)
   WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text) IS
  'Corrige a ficha. Argumento nulo = coluna inalterada (logo, nao apaga contato). CPF so muda antes da ativacao (trigger).';

-- Um par, nao duas funcoes: desativar e reativar sao a mesma decisao
-- administrativa em dois sentidos, e separa-las produziria a assimetria que
-- `create_admin` evitou de proposito — "criar" que desfaz desligamento em
-- silencio.
CREATE FUNCTION public.set_patient_active(p_patient_id uuid, p_is_active boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- DESATIVAR NAO APAGA, e nao pode apagar: dado clinico e imutavel por
  -- desenho (ADR-005) e o historico precisa continuar auditavel depois do
  -- desligamento. `is_active = false` e honrado por toda politica do sistema,
  -- porque `my_own_patient_id()` ja exige o perfil ativo.
  UPDATE public.patients SET is_active = p_is_active WHERE id = p_patient_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.set_patient_active(uuid, boolean) IS
  'Desativa ou reativa a ficha. Nunca apaga — dado clinico e imutavel (ADR-005).';


-- ============================================================
-- 5. O convite
-- ============================================================

-- Devolve o token EM TEXTO PURO, uma unica vez. Quem entrega e a Edge Function
-- de SMS; o banco nao guarda como reemitir — mesma forma de invite_caregiver.
--
-- E e o que permite HOMOLOGAR SEM PROVEDOR DE SMS: o painel exibe o token uma
-- vez e alguem o digita no app. Sem isso, a ativacao ficaria bloqueada por uma
-- credencial de terceiro que ainda nao existe.
-- `p_destination` nulo usa `patients.phone`, que e o caso normal: a recepcao
-- ja digitou o telefone no cadastro e nao deveria digitar de novo para
-- convidar. Passar o argumento serve ao reenvio para outro numero — e nesse
-- caso quem corrige o cadastro tambem deve corrigi-lo em `update_patient`, que
-- e por isso que as duas coisas sao colunas separadas.
CREATE FUNCTION public.invite_patient(
  p_patient_id  uuid,
  p_destination text     DEFAULT NULL,
  p_valid_for   interval DEFAULT interval '7 days'
)
RETURNS TABLE (invitation_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient     public.patients;
  v_destination text;
  v_token       text;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient FROM public.patients WHERE id = p_patient_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_found' USING ERRCODE = '23503';
  END IF;

  -- ORDEM DAS RECUSAS, e ela nao e estetica: a checagem de destino vinha antes
  -- e mascarava as duas abaixo. Convidar ficha JA ATIVADA cujo telefone esta em
  -- branco devolvia "falta o destino", mandando quem opera preencher um
  -- telefone que nao resolveria nada. O erro mais especifico vem primeiro.
  IF v_patient.account_id IS NOT NULL THEN
    RAISE EXCEPTION 'patient_already_activated'
      USING ERRCODE = '23505',
            HINT    = 'Desvincule a conta antes de convidar de novo (unlink_patient_account).';
  END IF;

  IF NOT v_patient.is_active THEN
    RAISE EXCEPTION 'patient_inactive' USING ERRCODE = '42501';
  END IF;

  v_destination := pg_catalog.btrim(coalesce(p_destination, v_patient.phone, ''));
  IF v_destination = '' THEN
    RAISE EXCEPTION 'missing_destination'
      USING ERRCODE = '23514',
            HINT    = 'Preencha o telefone da ficha ou informe o destino do convite.';
  END IF;

  -- REENVIO CANCELA O ANTERIOR, e nao e cortesia: o indice unico parcial
  -- recusaria o segundo pendente, e o motivo de fundo e que o convite antigo
  -- continuaria aceitavel. Quem reenvia costuma estar corrigindo o telefone —
  -- deixar o token anterior vivo manteria valido exatamente o convite que foi
  -- para o numero errado.
  UPDATE public.patient_invitations
     SET status = 'cancelled', cancelled_at = pg_catalog.now()
   WHERE patient_id = p_patient_id
     AND status = 'pending';

  -- 32 bytes de CSPRNG, 64 caracteres em hex.
  v_token := pg_catalog.encode(extensions.gen_random_bytes(32), 'hex');

  INSERT INTO public.patient_invitations
    (patient_id, destination, token_hash, expires_at, invited_by_account)
  VALUES
    (p_patient_id,
     v_destination,
     extensions.digest(v_token, 'sha256'),
     pg_catalog.now() + p_valid_for,
     auth.uid())
  RETURNING id INTO invitation_id;

  token := v_token;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.invite_patient(uuid, text, interval) IS
  'Emite o convite de ativacao e devolve o token uma unica vez. Reenviar cancela o pendente anterior. Janela default de 7 dias e NOSSA, declarada — trocar e parametro, nao migration.';

CREATE FUNCTION public.cancel_patient_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patient_invitations
     SET status = 'cancelled', cancelled_at = pg_catalog.now()
   WHERE id = p_invitation_id
     AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_pending' USING ERRCODE = '42501';
  END IF;
END;
$$;

-- O aceite. Chamado pela conta que o paciente acabou de criar no app.
--
-- DOIS FATORES, e e a decisao central desta migration (ADR-020 §1). O token
-- prova POSSE do telefone que a clinica cadastrou; o CPF e a data de
-- nascimento provam CONHECIMENTO de quem a ficha e. Nenhum dos dois basta:
--   * so token: um digito errado no telefone entrega o prontuario a um
--     estranho, que ativa e ve diario, agenda, chat e diagnostico de outra
--     pessoa — o pior erro possivel neste sistema, e o unico caminho de
--     correcao seria descobrir pela reclamacao;
--   * so CPF + nascimento: os dois estao em qualquer foto de documento, e
--     quem chegasse primeiro ficaria com a ficha.
--
-- O onboarding JA COLETA os tres (fonte: "formulario de cadastro com CPF, data
-- de nascimento e telefone"), entao o segundo fator nao custa nem um campo de
-- tela.
CREATE FUNCTION public.accept_patient_invitation(
  p_token      text,
  p_cpf        text,
  p_birth_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_cpf        text := private.normalize_cpf(p_cpf);
  v_invitation public.patient_invitations;
  v_patient    public.patients;
BEGIN
  -- service_role chega com auth.uid() NULL. Ativar em nome de ninguem
  -- deixaria a ficha ligada a lugar nenhum.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_uid AND is_active) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- A CONTA NAO PODE JA EXERCER OUTRO PAPEL, e isto fecha uma escalada real
  -- (ADR-020 §4): quem emite o token e o administrador, que tambem le o CPF e
  -- a data de nascimento na ficha. Sem esta guarda, um administrador ativo
  -- emite convite para qualquer paciente e o aceita para si — e a visao do
  -- TITULAR alcanca a conversa restrita da psicologia, que e justamente o que
  -- a #23 negou a administracao. Seria bypass silencioso de um invariante do
  -- projeto, pela porta do cadastro.
  --
  -- CUSTO ASSUMIDO: funcionario da clinica que tambem se trate nela nao ativa
  -- o app na mesma conta. Nenhuma fonte descreve o caso; abrir depois e trocar
  -- este predicado, o que e aditivo. Ter deixado aberto ja teria vazado.
  IF EXISTS (SELECT 1 FROM public.admins        WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.professionals WHERE account_id = v_uid)
     OR EXISTS (SELECT 1 FROM public.caregivers    WHERE account_id = v_uid) THEN
    RAISE EXCEPTION 'account_has_other_profile'
      USING ERRCODE = '42501',
            HINT    = 'A ativacao do app exige conta sem outro perfil na plataforma.';
  END IF;

  IF EXISTS (SELECT 1 FROM public.patients WHERE account_id = v_uid) THEN
    RAISE EXCEPTION 'account_already_linked' USING ERRCODE = '23505';
  END IF;

  -- FOR UPDATE fecha a corrida de dois aceites do mesmo token.
  SELECT * INTO v_invitation
    FROM public.patient_invitations
   WHERE token_hash = extensions.digest(p_token, 'sha256')
     AND status = 'pending'
     AND expires_at > pg_catalog.now()
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_patient
    FROM public.patients
   WHERE id = v_invitation.patient_id
     AND is_active
     AND account_id IS NULL
   FOR UPDATE;

  -- ERRO GENERICO E UNICO para token inexistente, token usado, token vencido,
  -- CPF que nao corresponde e data que nao corresponde. Distinguir os casos
  -- transformaria a funcao em oraculo: com um token valido em maos, mensagens
  -- diferentes permitiriam descobrir o CPF da ficha por tentativa.
  IF NOT FOUND
     OR v_patient.cpf        <> v_cpf
     OR v_patient.birth_date <> p_birth_date THEN
    RAISE EXCEPTION 'invalid_invitation' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
     SET account_id = v_uid
   WHERE id = v_patient.id;

  UPDATE public.patient_invitations
     SET status = 'accepted', accepted_at = pg_catalog.now()
   WHERE id = v_invitation.id;

  RETURN v_patient.id;
END;
$$;

COMMENT ON FUNCTION public.accept_patient_invitation(text, text, date) IS
  'Liga a ficha a conta autenticada. Dois fatores: token (posse) + CPF e nascimento (conhecimento). Erro sempre generico, para nao virar oraculo de CPF.';

-- O CAMINHO DE VOLTA, e ele nao e opcional: sem desvinculo, um aceite errado
-- e permanente, e a unica saida seria mexer no banco a mao. Desvincular NAO da
-- acesso a quem executa — libera a ficha para um convite novo (ADR-020 §1).
CREATE FUNCTION public.unlink_patient_account(p_patient_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
     SET account_id = NULL
   WHERE id = p_patient_id
     AND account_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'patient_not_linked' USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.unlink_patient_account(uuid) IS
  'Desfaz o vinculo ficha <-> conta. Existe para que aceite errado seja corrigivel; fica em audit_log pelo trg_audit_write de patients.';


-- ============================================================
-- 6. RLS
-- ============================================================
--
-- Sem politica de INSERT/UPDATE/DELETE: toda escrita vem das RPCs acima, sob
-- SECURITY DEFINER com checagem no corpo. Default deny cobre o resto.

ALTER TABLE public.patient_invitations ENABLE ROW LEVEL SECURITY;

-- SO a administracao, e `TO authenticated` e nao `TO clinical_reader`: convite
-- nao e dado clinico, e portanto nao paga o pedagio da ADR-008. O painel le a
-- fila com `.from()`.
--
-- O titular nao aparece aqui porque no instante do convite ele AINDA NAO TEM
-- CONTA — nao ha `auth.uid()` a quem conceder —, e depois da ativacao a fila
-- nao lhe serve para nada.
CREATE POLICY patient_invitations_select_admin ON public.patient_invitations
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- 7. Triggers
-- ============================================================

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.patient_invitations
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();

-- Convite, aceite e cancelamento sao CONCESSAO DE ACESSO A PRONTUARIO — a
-- familia de acao que o dev do painel apontou como a mais grave e a de menor
-- rastro. Com o trigger, emitir e aceitar convite nascem auditados.
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.patient_invitations
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');


-- ============================================================
-- 8. Privilegios — REVOKE depois dos CREATE, GRANT cirurgico
-- ============================================================

-- A tabela nao tem escrita direta por ninguem que autentica.
REVOKE INSERT, UPDATE, DELETE ON public.patient_invitations FROM authenticated;
-- O convite guarda telefone e aponta prontuario: nem a fila nem o historico
-- interessam a `anon`, e o default privilege do Supabase e reaberto por uma
-- entrada que nenhuma migration alcanca (ADR-016, armadilha nº 5). Explicito
-- aqui, e medido em anon_surface.test.sql — a assercao e que vale.
REVOKE ALL ON public.patient_invitations FROM anon;

-- Repetido de proposito: o REVOKE das migrations anteriores nao alcanca funcao
-- criada depois dele (ADR-016, armadilha nº 1).
REVOKE EXECUTE ON FUNCTION private.normalize_cpf(text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.reject_activated_cpf_change()    FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.create_patient(text, text, date, text, text, jsonb, text)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_patient_active(uuid, boolean)                     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.invite_patient(uuid, text, interval)                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_patient_invitation(uuid)                       FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.accept_patient_invitation(text, text, date)           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.unlink_patient_account(uuid)                          FROM PUBLIC, anon;

-- `normalize_cpf` entra em RPC chamada por authenticated, e EXECUTE e exigido
-- em runtime — a armadilha da ADR-016 que custou uma leva inteira.
GRANT EXECUTE ON FUNCTION private.normalize_cpf(text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_patient(text, text, date, text, text, jsonb, text)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_patient(uuid, text, text, date, text, text, jsonb, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_patient_active(uuid, boolean)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_patient(uuid, text, interval)                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_patient_invitation(uuid)                       TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_patient_invitation(text, text, date)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.unlink_patient_account(uuid)                          TO authenticated;
