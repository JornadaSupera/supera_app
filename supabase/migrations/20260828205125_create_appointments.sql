-- Agregado Agenda — o compromisso, visto pelos dois lados do vínculo.
-- Design e racional: supera-docs/Modelo de Dados/Agenda.md
-- Decisões sob teste:  ADR-014 (granularidade, autoria e corte do agregado)
-- sobre o contrato transversal da ADR-003 §3 e o pedágio da ADR-008.
--
-- O rascunho do pré-mortem tinha SETE tabelas. Esta migration traz CINCO, e
-- duas delas não estavam no rascunho. Cortados, e o motivo:
--   * locations — nenhuma fonte diz que a CEON tem mais de uma unidade, e os
--     esboços do app mostram RÓTULO curto ("Sala de Infusão", "Sala 12") e às
--     vezes de TERCEIRO ("Laboratório parceiro"). Uma tabela de unidades teria
--     de cadastrar o laboratório parceiro para exibir uma linha de texto.
--   * clinic_business_hours — é Configurações da clínica. Segunda tentativa da
--     mesma tabela de entrar por um agregado alheio (a primeira foi
--     chat_business_hours, ADR-012 P3).
--   * appointment_reminders — outbox SEM CONSUMIDOR: notifications está na
--     fatia 2 de Conteúdo, bloqueada pela #32. O esboço exibe "Push 24h e 2h
--     antes" como configuração fixa, não como linha por compromisso.
--   * appointment_events — o compromisso termina em UM estado terminal:
--     status + motivo na própria linha bastam ao relatório, e quem/quando é
--     audit_log (#12).
--   * EXCLUDE USING gist contra sobreposição — nenhuma fonte proíbe agenda
--     sobreposta, exigiria btree_gist (não instalada) e devolveria 23P01 que
--     o front-end não traduz. Índice, não constraint.
--
-- E o que ENTROU sem estar no rascunho: professional_blocks (o bloqueio
-- pessoal deixa de ser linha de tabela clínica — ADR-014 §3) e as tabelas de
-- domínio de estado e motivo, que substituem o enum inventado (§5).


-- ============================================================
-- 1. Vocabulário — três tabelas de domínio (ADR-002)
-- ============================================================

-- Tipo: o esboço distingue os tipos por ÍCONE além da cor, e traz "Hemograma +
-- bioquímica" — exame laboratorial, que não está em fonte textual nenhuma.
-- Terceira evidência de que o vocabulário se mexe; enum estava errado.
CREATE TABLE public.appointment_types (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code       text NOT NULL UNIQUE,
  label      text NOT NULL,
  -- Cor e ícone são exigidos pelas telas ("marcadores visuais por categoria"),
  -- mas NENHUMA fonte diz qual cor é de qual tipo: nascem nulos, e quem os
  -- define é a clínica, não esta migration.
  color      text,
  icon_name  text,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_types IS
  'Tipos de compromisso. Tabela e não enum porque o vocabulário ainda se mexe (ADR-014 §5): os esboços já trouxeram um tipo fora das fontes.';
COMMENT ON COLUMN public.appointment_types.color IS
  'NULL até a clínica definir. Requisito pede cor por categoria; nenhuma fonte diz qual.';

-- Os tipos citados nas fontes, mais o que o esboço acrescentou. NÃO há tipo
-- 'bloqueio': o bloqueio deixou de ser compromisso (professional_blocks).
INSERT INTO public.appointment_types (code, label, sort_order) VALUES
  ('medical_consultation',  'Consulta médica',            1),
  ('follow_up',             'Retorno',                    2),
  ('infusion',              'Infusão / quimioterapia',    3),
  ('medication_pickup',     'Retirada de medicação',      4),
  ('procedure',             'Procedimento',               5),
  ('multidisciplinary',     'Avaliação multidisciplinar', 6),
  ('lab_exam',              'Exame laboratorial',         7)
ON CONFLICT (code) DO NOTHING;

-- Estado: a #5 continua aberta. Semeado com o MÍNIMO que as estatísticas
-- exigem ("faltas, cancelamentos e remarcações por motivo") mais o inicial e
-- o realizado, que o histórico de compromissos passados pressupõe.
-- Trocar esta lista quando a CEON responder é DML — não ALTER TYPE em tabela
-- com dado de saúde. É o precedente da ADR-006 (fase da jornada).
CREATE TABLE public.appointment_statuses (
  id          uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code        text NOT NULL UNIQUE,
  label       text NOT NULL,
  -- Estado terminal não transiciona para nada. É o que a máquina de estados
  -- consulta em vez de carregar a lista no código.
  is_terminal boolean NOT NULL DEFAULT false,
  sort_order  smallint NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_statuses IS
  'Estados do compromisso. Lista PROVISÓRIA sob a questão #5 — nenhuma fonte os enumera. Confirmado NÃO é estado: é coluna (ADR-014 §2).';

INSERT INTO public.appointment_statuses (code, label, is_terminal, sort_order) VALUES
  ('scheduled',   'Agendado',   false, 1),
  ('completed',   'Realizado',  true,  2),
  ('cancelled',   'Cancelado',  true,  3),
  ('no_show',     'Falta',      true,  4),
  ('rescheduled', 'Remarcado',  true,  5)
ON CONFLICT (code) DO NOTHING;

-- Motivo: NASCE VAZIA. A lista de motivos não aparece em fonte nenhuma, e
-- inventá-la destravaria o relatório hoje ao custo de o palpite virar
-- produção. Mesma decisão de alert_rules (ADR-007 §1) — com uma diferença
-- importante: aqui o vazio NÃO é fail-closed. status_reason_id é nulável, e
-- a operação segue; o que fica inerte é o recorte estatístico por motivo.
CREATE TABLE public.appointment_status_reasons (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  status_id  uuid NOT NULL REFERENCES public.appointment_statuses (id) ON DELETE RESTRICT,
  code       text NOT NULL UNIQUE,
  label      text NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.appointment_status_reasons IS
  'Motivos de falta/cancelamento/remarcação. VAZIA por decisão (#5): a lista não existe em fonte. Vazio deixa o relatório por motivo inerte, não a agenda.';


-- ============================================================
-- 2. appointments — o compromisso
-- ============================================================

CREATE TABLE public.appointments (
  id                      uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- NOT NULL: o bloqueio pessoal saiu para professional_blocks, e com ele a
  -- única razão de esta FK ser opcional (ADR-014 §3).
  patient_id              uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- NULÁVEL por evidência de esboço: "Hemograma + bioquímica · Laboratório
  -- parceiro · com —". Compromisso sem profissional é legítimo, e NENHUM
  -- predicado de RLS pode ancorar-se nesta coluna (ADR-014 §9).
  professional_id         uuid     REFERENCES public.professionals (id) ON DELETE RESTRICT,
  appointment_type_id     uuid NOT NULL REFERENCES public.appointment_types (id) ON DELETE RESTRICT,
  status_id               uuid NOT NULL REFERENCES public.appointment_statuses (id) ON DELETE RESTRICT,
  status_reason_id        uuid     REFERENCES public.appointment_status_reasons (id) ON DELETE RESTRICT,
  -- O esboço mostra título ("Quimioterapia — Ciclo 4") E chip de tipo
  -- ("Sessão de Quimioterapia") na mesma tela: são dois campos. O ciclo vive
  -- aqui como texto — a ADR-006 decidiu que ciclo é ordinal, não entidade.
  title                   text NOT NULL CHECK (length(btrim(title)) > 0),
  starts_at               timestamptz NOT NULL,
  ends_at                 timestamptz NOT NULL,
  -- Rótulo curto, às vezes de terceiro fora da CEON. Endereço e telefone
  -- existem porque o REQUISITO os pede no detalhe; o esboço não os mostra, e
  -- entre os dois prevalece a fonte contratual.
  location_label          text NOT NULL CHECK (length(btrim(location_label)) > 0),
  location_address        text,
  location_phone          text,
  -- Observações VOLTADAS AO PACIENTE (o esboço as renderiza no app). Não é
  -- campo clínico: a lição da ADR-009 §3, que tirou o texto livre do sinal.
  patient_notes           text,
  -- Contrato transversal da ADR-003 §3. Serve à leitura da EQUIPE — o titular
  -- vê a própria agenda inteira, sempre.
  origin_specialty_id     uuid     REFERENCES public.specialties (id) ON DELETE RESTRICT,
  visibility              public.clinical_visibility NOT NULL DEFAULT 'team',
  -- A remarcação é a ligação entre duas linhas, não uma tabela.
  rescheduled_from_id     uuid     REFERENCES public.appointments (id) ON DELETE RESTRICT,
  -- CONFIRMAÇÃO É COLUNA, NÃO ESTADO (ADR-014 §2). Se a #5 responder que
  -- "confirmado" é status, ele se DERIVA daqui — sem ALTER TYPE.
  confirmed_at            timestamptz,
  confirmed_by_account_id uuid     REFERENCES public.accounts (id) ON DELETE SET NULL,
  created_by_account_id   uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_appointments_period CHECK (ends_at > starts_at),
  -- Os dois campos da confirmação andam juntos ou não andam.
  CONSTRAINT ck_appointments_confirmed_pair
    CHECK ((confirmed_at IS NULL) = (confirmed_by_account_id IS NULL)),
  CONSTRAINT ck_appointments_not_self_reschedule
    CHECK (rescheduled_from_id IS NULL OR rescheduled_from_id <> id)
);

COMMENT ON TABLE public.appointments IS
  'Compromisso do paciente. Tabela CLÍNICA: leitura da equipe pelo pedágio da ADR-008. O bloqueio pessoal do profissional NÃO mora aqui.';
COMMENT ON COLUMN public.appointments.professional_id IS
  'NULL é legítimo (exame sem profissional). Nenhuma política de RLS depende desta coluna.';
COMMENT ON COLUMN public.appointments.patient_notes IS
  'Texto exibido AO PACIENTE. Proibido conteúdo clínico: o lugar dele é specialty_notes.';
COMMENT ON COLUMN public.appointments.confirmed_at IS
  'Confirmação de comparecimento pelo titular ou cuidador (ADR-014 §2, premissa P1 / questão #35). Reversível até starts_at.';
COMMENT ON COLUMN public.appointments.status_reason_id IS
  'Motivo da falta/cancelamento/remarcação. NULL enquanto appointment_status_reasons estiver vazia (#5).';

-- Uma remarcação por origem: sem isto, duas linhas apontariam para o mesmo
-- compromisso remarcado e o relatório contaria a remarcação duas vezes.
CREATE UNIQUE INDEX uq_appointments_rescheduled_from
  ON public.appointments (rescheduled_from_id)
  WHERE rescheduled_from_id IS NOT NULL;


-- ============================================================
-- 3. professional_blocks — o bloqueio pessoal, fora do clínico
-- ============================================================
--
-- Por que tabela separada (ADR-014 §3): mantido em appointments, o bloqueio
-- pessoal ("consulta médica pessoal") viraria linha auditada e legível pela
-- ADMINISTRAÇÃO — quarta ocorrência da família de vazamento por metadado,
-- depois de specialty_flags, content_directed_sends e as transferências de
-- conversa. E encheria a trilha de acesso a dado clínico, que é item de
-- aceite, com navegação de calendário.

CREATE TABLE public.professional_blocks (
  professional_id uuid NOT NULL REFERENCES public.professionals (id) ON DELETE CASCADE,
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  label           text,
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_professional_blocks_period CHECK (ends_at > starts_at)
);

COMMENT ON TABLE public.professional_blocks IS
  'Bloqueio de horário pessoal. NÃO é dado clínico: RLS direta do dono, fora do pedágio read_*, invisível ao administrador (ADR-014 §3).';
COMMENT ON COLUMN public.professional_blocks.label IS
  'Rótulo livre do próprio profissional. Ninguém além dele lê esta tabela.';


-- ============================================================
-- 4. Sigilo — a agenda é a terceira tabela a exercer o contrato
-- ============================================================

CREATE FUNCTION private.enforce_appointment_confidentiality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- lê specialties sem depender da RLS de quem escreve
SET search_path = ''
AS $$
DECLARE v_confidential boolean;
BEGIN
  IF NEW.origin_specialty_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.is_confidential INTO v_confidential
    FROM public.specialties s WHERE s.id = NEW.origin_specialty_id;

  IF v_confidential THEN
    NEW.visibility := 'specialty_restricted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_confidentiality
BEFORE INSERT OR UPDATE OF origin_specialty_id ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.enforce_appointment_confidentiality();

-- O sigilo que retroage passa a alcançar também o compromisso. Só APERTA.
CREATE OR REPLACE FUNCTION private.tighten_notes_on_confidential()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_confidential AND NOT OLD.is_confidential THEN
    UPDATE public.specialty_notes
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';

    UPDATE public.conversations
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';

    UPDATE public.appointments
       SET visibility = 'specialty_restricted'
     WHERE origin_specialty_id = NEW.id
       AND visibility = 'team';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.tighten_notes_on_confidential() IS
  'Sigilo retroage sobre nota, conversa E compromisso. Só aperta (team -> specialty_restricted). Nome herdado de create_specialty_notes.';


-- ============================================================
-- 5. Máquina de estados e imutabilidade do titular
-- ============================================================
--
-- Estado terminal não transiciona. O trigger consulta is_terminal na tabela de
-- domínio em vez de carregar a lista no corpo — trocar o vocabulário (#5) não
-- exige mexer nesta função.

CREATE FUNCTION private.enforce_appointment_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- lê appointment_statuses sem depender da RLS
SET search_path = ''
AS $$
DECLARE
  v_old_terminal boolean;
  v_new_code     text;
BEGIN
  -- O titular do compromisso não muda. Trocar o paciente de uma linha já
  -- criada reescreveria a quem o histórico pertence.
  IF NEW.patient_id <> OLD.patient_id THEN
    RAISE EXCEPTION 'patient_id de um compromisso e imutavel';
  END IF;

  IF NEW.status_id = OLD.status_id THEN
    RETURN NEW;
  END IF;

  SELECT s.is_terminal INTO v_old_terminal
    FROM public.appointment_statuses s WHERE s.id = OLD.status_id;

  IF v_old_terminal THEN
    RAISE EXCEPTION 'compromisso em estado terminal nao transiciona';
  END IF;

  SELECT s.code INTO v_new_code
    FROM public.appointment_statuses s WHERE s.id = NEW.status_id;

  -- Sair de 'scheduled' encerra a confirmação: um compromisso cancelado
  -- continuar "Confirmado" na tela seria mentira de estado.
  IF v_new_code <> 'scheduled' THEN
    NEW.confirmed_at := NULL;
    NEW.confirmed_by_account_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_transition
BEFORE UPDATE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION private.enforce_appointment_transition();

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.appointments
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.professional_blocks
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 6. Quem pode marcar — um predicado, um lugar
-- ============================================================
--
-- ADR-014 §1 e §6. A #25 alcança a agenda nominalmente ("marcar compromisso"),
-- e aqui a decisão é a OPOSTA à do chat (ADR-012 §4), por inversão da
-- assimetria de custo: o compromisso não é conteúdo clínico de especialidade,
-- é ato operacional com autor gravado. Restringir por especialidade custaria a
-- homologação (o oncologista não marcaria o retorno da nutrição); abrir a mais
-- custa trocar o predicado desta função.
--
-- has_permission() é a porta já instalada para a #35: enquanto o código
-- 'appointment.write' não existir no catálogo, ela concede — e no dia em que a
-- recepção existir, basta cadastrá-lo. Um perfil novo custaria retrofit na
-- camada de acesso.

CREATE FUNCTION private.can_manage_schedule()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_active_professional()
     AND private.has_permission('appointment.write');
$$;

COMMENT ON FUNCTION private.can_manage_schedule() IS
  'Único predicado de escrita da agenda (ADR-014 §1). Premissas P1 (#35) e P3 (#25) vivem aqui — mudar de ideia é trocar esta função.';

-- Quem pode CONFIRMAR: o titular ou quem o acompanha. O cuidador confirma, e
-- confirmed_by_account_id registra quem foi — a origem aparece na tela por
-- força da resposta #22.
CREATE FUNCTION private.can_confirm_appointment(p_appointment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.id = p_appointment_id
       AND ( a.patient_id = private.my_own_patient_id()
             OR a.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) )
  );
$$;


-- ============================================================
-- 7. RLS
-- ============================================================

ALTER TABLE public.appointment_types          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_statuses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_status_reasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_blocks        ENABLE ROW LEVEL SECURITY;

-- --- vocabulário: não é dado de paciente ------------------------------------
CREATE POLICY appointment_types_select_authenticated ON public.appointment_types
  FOR SELECT TO authenticated USING ( is_active );
CREATE POLICY appointment_statuses_select_authenticated ON public.appointment_statuses
  FOR SELECT TO authenticated USING ( is_active );
CREATE POLICY appointment_status_reasons_select_authenticated ON public.appointment_status_reasons
  FOR SELECT TO authenticated USING ( is_active );

-- O vocabulário também é lido de DENTRO das funções read_*, que rodam como
-- clinical_reader: sem estas três, o painel receberia a linha do compromisso
-- e nenhum rótulo para exibir.
CREATE POLICY appointment_types_select_reader ON public.appointment_types
  FOR SELECT TO clinical_reader USING ( true );
CREATE POLICY appointment_statuses_select_reader ON public.appointment_statuses
  FOR SELECT TO clinical_reader USING ( true );
CREATE POLICY appointment_status_reasons_select_reader ON public.appointment_status_reasons
  FOR SELECT TO clinical_reader USING ( true );

-- --- compromisso: leitura ---------------------------------------------------
-- O titular vê a PRÓPRIA agenda inteira: visibility não entra no predicado.
-- Ela existe para a equipe, não contra o paciente.
CREATE POLICY appointments_select_own ON public.appointments
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

CREATE POLICY appointments_select_caregiver ON public.appointments
  FOR SELECT TO authenticated
  USING ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

-- A #9 colapsada, igual à conversa: lê o que é da equipe, mais o da própria
-- especialidade. A sessão de psicologia SOME da agenda das outras áreas — não
-- é o conteúdo que se esconde, é a linha.
CREATE POLICY appointments_select_professional ON public.appointments
  FOR SELECT TO clinical_reader
  USING (
    (SELECT private.is_active_professional())
    AND ( visibility = 'team'
          OR origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) )
  );

-- #11 + #23: administração vê tudo, exceto psicologia.
CREATE POLICY appointments_select_admin ON public.appointments
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) AND visibility = 'team' );

-- NENHUMA política de INSERT/UPDATE/DELETE em appointments: todo o ciclo é
-- RPC. A escrita direta cairia na armadilha do pedágio — um EXISTS sobre
-- tabela clínica dentro de WITH CHECK roda como `authenticated`, e desde a
-- ADR-008 o profissional não tem política com esse role. O erro seria
-- "violates row-level security", silencioso.

-- --- bloqueio pessoal: só o dono, e por política direta ---------------------
-- Escrita direta e não RPC: não há regra de negócio a impor além de "é meu".
CREATE POLICY professional_blocks_select_own ON public.professional_blocks
  FOR SELECT TO authenticated
  USING ( professional_id = (SELECT private.my_professional_id()) );

CREATE POLICY professional_blocks_insert_own ON public.professional_blocks
  FOR INSERT TO authenticated
  WITH CHECK ( professional_id = (SELECT private.my_professional_id()) );

CREATE POLICY professional_blocks_update_own ON public.professional_blocks
  FOR UPDATE TO authenticated
  USING ( professional_id = (SELECT private.my_professional_id()) )
  WITH CHECK ( professional_id = (SELECT private.my_professional_id()) );

CREATE POLICY professional_blocks_delete_own ON public.professional_blocks
  FOR DELETE TO authenticated
  USING ( professional_id = (SELECT private.my_professional_id()) );

-- Não há política para clinical_reader nem para o administrador em
-- professional_blocks. A ausência é a decisão (ADR-014 §3, premissa P4).


-- ============================================================
-- 8. O ciclo de escrita — RPC
-- ============================================================

CREATE FUNCTION public.schedule_appointment(
  p_patient_id          uuid,
  p_appointment_type_id uuid,
  p_title               text,
  p_starts_at           timestamptz,
  p_ends_at             timestamptz,
  p_location_label      text,
  p_professional_id     uuid DEFAULT NULL,
  p_origin_specialty_id uuid DEFAULT NULL,
  p_patient_notes       text DEFAULT NULL,
  p_location_address    text DEFAULT NULL,
  p_location_phone      text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id        uuid;
  v_scheduled uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo marca compromisso';
  END IF;

  SELECT s.id INTO v_scheduled
    FROM public.appointment_statuses s WHERE s.code = 'scheduled';

  INSERT INTO public.appointments (
    patient_id, professional_id, appointment_type_id, status_id, title,
    starts_at, ends_at, location_label, location_address, location_phone,
    patient_notes, origin_specialty_id, created_by_account_id
  ) VALUES (
    p_patient_id, p_professional_id, p_appointment_type_id, v_scheduled, p_title,
    p_starts_at, p_ends_at, p_location_label, p_location_address, p_location_phone,
    p_patient_notes, p_origin_specialty_id, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Remarcar é criar a linha nova e ENCERRAR a antiga como 'rescheduled'. Não há
-- UPDATE de horário: o relatório de adesão conta remarcações, e sobrescrever
-- starts_at apagaria o fato.
CREATE FUNCTION public.reschedule_appointment(
  p_appointment_id uuid,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_reason_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old         public.appointments;
  v_new_id      uuid;
  v_scheduled   uuid;
  v_rescheduled uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo remarca compromisso';
  END IF;

  SELECT * INTO v_old FROM public.appointments WHERE id = p_appointment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'compromisso inexistente';
  END IF;

  SELECT s.id INTO v_scheduled   FROM public.appointment_statuses s WHERE s.code = 'scheduled';
  SELECT s.id INTO v_rescheduled FROM public.appointment_statuses s WHERE s.code = 'rescheduled';

  INSERT INTO public.appointments (
    patient_id, professional_id, appointment_type_id, status_id, title,
    starts_at, ends_at, location_label, location_address, location_phone,
    patient_notes, origin_specialty_id, rescheduled_from_id, created_by_account_id
  ) VALUES (
    v_old.patient_id, v_old.professional_id, v_old.appointment_type_id, v_scheduled, v_old.title,
    p_starts_at, p_ends_at, v_old.location_label, v_old.location_address, v_old.location_phone,
    v_old.patient_notes, v_old.origin_specialty_id, v_old.id, auth.uid()
  )
  RETURNING id INTO v_new_id;

  UPDATE public.appointments
     SET status_id = v_rescheduled, status_reason_id = p_reason_id
   WHERE id = p_appointment_id;

  RETURN v_new_id;
END;
$$;

CREATE FUNCTION public.set_appointment_status(
  p_appointment_id uuid,
  p_status_code    text,
  p_reason_id      uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_status_id uuid;
BEGIN
  IF NOT private.can_manage_schedule() THEN
    RAISE EXCEPTION 'apenas profissional ativo muda o estado do compromisso';
  END IF;

  -- 'rescheduled' não se atribui à mão: ele é efeito de reschedule_appointment,
  -- que garante a existência da linha nova. Sem esta barra, a agenda ficaria
  -- com remarcações sem destino.
  IF p_status_code = 'rescheduled' THEN
    RAISE EXCEPTION 'use reschedule_appointment para remarcar';
  END IF;

  SELECT s.id INTO v_status_id
    FROM public.appointment_statuses s WHERE s.code = p_status_code AND s.is_active;
  IF v_status_id IS NULL THEN
    RAISE EXCEPTION 'estado inexistente: %', p_status_code;
  END IF;

  UPDATE public.appointments
     SET status_id = v_status_id, status_reason_id = p_reason_id
   WHERE id = p_appointment_id;
END;
$$;

-- Confirmação (ADR-014 §2): só antes do início, só em 'scheduled', reversível.
CREATE FUNCTION public.confirm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_updated bigint;
BEGIN
  IF NOT private.can_confirm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'apenas o titular ou quem o acompanha confirma comparecimento';
  END IF;

  UPDATE public.appointments a
     SET confirmed_at = now(), confirmed_by_account_id = auth.uid()
   WHERE a.id = p_appointment_id
     AND a.starts_at > now()
     AND EXISTS (SELECT 1 FROM public.appointment_statuses s
                  WHERE s.id = a.status_id AND s.code = 'scheduled');

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'compromisso ja comecou ou nao esta agendado';
  END IF;
END;
$$;

CREATE FUNCTION public.unconfirm_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.can_confirm_appointment(p_appointment_id) THEN
    RAISE EXCEPTION 'apenas o titular ou quem o acompanha desfaz a confirmacao';
  END IF;

  UPDATE public.appointments a
     SET confirmed_at = NULL, confirmed_by_account_id = NULL
   WHERE a.id = p_appointment_id
     AND a.starts_at > now();
END;
$$;


-- ============================================================
-- 9. Leitura auditada — o pedágio que conta CONSULTAS
-- ============================================================
--
-- ADR-014 §4: uma linha em audit_log por CONSULTA, com row_count — não uma por
-- compromisso devolvido. Navegar entre semanas é o uso normal da tela, e uma
-- linha por compromisso tornaria ilegível justamente a trilha que precisa
-- servir para investigar acesso indevido ao prontuário.
--
-- A política não basta: o leitor auditado precisa do privilégio de tabela,
-- senão a função morre com "permission denied for table appointments" antes de
-- a RLS ser consultada. O vocabulário entra junto — sem ele o painel recebe a
-- linha e nenhum rótulo para exibir.

GRANT SELECT ON public.appointments, public.appointment_types,
                public.appointment_statuses, public.appointment_status_reasons
  TO clinical_reader;
-- read_my_agenda resolve o profissional de dentro da função: o EXECUTE é
-- exigido em runtime, como já foi para my_specialty_ids.
GRANT EXECUTE ON FUNCTION private.my_professional_id() TO clinical_reader;

CREATE FUNCTION public.read_appointments(
  p_patient_id uuid,
  p_from       timestamptz DEFAULT NULL,
  p_to         timestamptz DEFAULT NULL,
  p_limit      integer     DEFAULT 100   -- teto de 200 imposto no servidor, como nas demais read_*
)
RETURNS SETOF public.appointments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT a.* FROM public.appointments a
     WHERE a.patient_id = p_patient_id
       AND (p_from IS NULL OR a.starts_at >= p_from)
       AND (p_to   IS NULL OR a.starts_at <  p_to)
     ORDER BY a.starts_at DESC
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('appointments', p_patient_id, v_count);
END;
$$;

-- A agenda do PROFISSIONAL atravessa pacientes — é a exceção declarada ao
-- contrato "filtre sempre por patient_id", e por isso tem índice próprio.
-- O log sai com patient_id NULL e o row_count da janela: o acesso fica
-- registrado sem inventar um titular para a consulta.
CREATE FUNCTION public.read_my_agenda(
  p_from timestamptz,
  p_to   timestamptz
)
RETURNS SETOF public.appointments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count           integer;
  v_professional_id uuid;
BEGIN
  v_professional_id := private.my_professional_id();
  IF v_professional_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT a.* FROM public.appointments a
     WHERE a.professional_id = v_professional_id
       AND a.starts_at >= p_from
       AND a.starts_at <  p_to
     ORDER BY a.starts_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('appointments', NULL, v_count);
END;
$$;

COMMENT ON FUNCTION public.read_my_agenda(timestamptz, timestamptz) IS
  'Agenda do profissional, atravessando pacientes. O bloqueio pessoal NÃO vem por aqui: o painel une esta chamada com professional_blocks, lida direto (ADR-014 §3).';


-- ============================================================
-- 10. Realtime — a agenda NÃO entra na publication
-- ============================================================
--
-- ADR-011: o canal aplica a RLS da tabela sob `authenticated`, role do qual o
-- pedágio tirou o profissional. Para a equipe, assinar seria silêncio; para o
-- paciente, a agenda muda por ato da clínica e a tela é consultiva. Quando a
-- tabela de notificações existir (fatia 2 de Conteúdo, #32), é ela — e não
-- este canal — que avisa o paciente da mudança de horário.


-- ============================================================
-- 11. Trilha de escrita (#12) e índices
-- ============================================================

CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');

-- professional_blocks NÃO tem trilha, de propósito: não há paciente na linha,
-- e auditar a agenda pessoal do profissional é exatamente o que a §3 evita.

-- A agenda do paciente e a lista de "próximos": sempre por janela de tempo.
CREATE INDEX idx_appointments_patient       ON public.appointments (patient_id, starts_at DESC);
-- A agenda do profissional (read_my_agenda), a consulta que atravessa pacientes.
CREATE INDEX idx_appointments_professional  ON public.appointments (professional_id, starts_at)
  WHERE professional_id IS NOT NULL;
-- Filtro por tipo, exigido nas duas telas.
CREATE INDEX idx_appointments_type          ON public.appointments (appointment_type_id, starts_at DESC);
-- Relatório de adesão: faltas, cancelamentos e remarcações por motivo (#5).
CREATE INDEX idx_appointments_status_reason ON public.appointments (status_id, status_reason_id, starts_at);
CREATE INDEX idx_professional_blocks_owner  ON public.professional_blocks (professional_id, starts_at);


-- ============================================================
-- 12. Privilégios — SEMPRE no fim
-- ============================================================

-- O compromisso só muda por RPC; o vocabulário só por migration/service_role.
REVOKE INSERT, UPDATE, DELETE ON public.appointments               FROM authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.appointment_types          FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.appointment_statuses       FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.appointment_status_reasons FROM authenticated;
-- DELETE de compromisso é proibido também por privilégio, não só por política:
-- ADR-005 — desativação e anonimização são os mecanismos, não o hard delete.
REVOKE DELETE ON public.appointments FROM authenticated, service_role;

-- O dono das funções read_* precisa de CREATE no schema. Concede, transfere,
-- revoga — a propriedade fica, o privilégio não.
GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_appointments(uuid, timestamptz, timestamptz, integer) OWNER TO clinical_reader;
ALTER FUNCTION public.read_my_agenda(timestamptz, timestamptz)                   OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

REVOKE EXECUTE ON FUNCTION private.enforce_appointment_confidentiality() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.enforce_appointment_transition()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_manage_schedule()                 FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_confirm_appointment(uuid)         FROM PUBLIC;

REVOKE EXECUTE ON FUNCTION public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, uuid)                     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.confirm_appointment(uuid)                                    FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.unconfirm_appointment(uuid)                                  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_appointments(uuid, timestamptz, timestamptz, integer)   FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_my_agenda(timestamptz, timestamptz)                     FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.schedule_appointment(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(uuid, timestamptz, timestamptz, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_appointment_status(uuid, text, uuid)                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_appointment(uuid)                                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.unconfirm_appointment(uuid)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_appointments(uuid, timestamptz, timestamptz, integer)   TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_my_agenda(timestamptz, timestamptz)                     TO authenticated, service_role;

-- Entram em POLÍTICA: EXECUTE é exigido em runtime de quem consulta e de quem
-- escreve. Sem isto, o bloqueio pessoal morre com "permission denied for
-- function my_professional_id" — a armadilha que já mordeu na nota.
GRANT EXECUTE ON FUNCTION private.my_professional_id()  TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_own_patient_id()   TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_ward_patient_ids() TO authenticated;

-- A equipe escreve por RPC e lê pela função auditada; o titular e o cuidador
-- leem direto. anon não lê nada.
REVOKE SELECT ON public.appointments               FROM anon;
REVOKE SELECT ON public.professional_blocks        FROM anon;
REVOKE SELECT ON public.appointment_types          FROM anon;
REVOKE SELECT ON public.appointment_statuses       FROM anon;
REVOKE SELECT ON public.appointment_status_reasons FROM anon;
