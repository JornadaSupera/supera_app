-- Agregado Comunicacao — o chat entre paciente/cuidador e a equipe. FATIA 1.
-- Design e racional: supera-docs/Modelo de Dados/Comunicacao.md
-- Decisoes sob teste:  ADR-011 (Realtime x pedagio de auditoria)
--                      ADR-012 (granularidade e corte do agregado)
-- sobre o contrato transversal da ADR-003 §3 e o pedagio da ADR-008.
--
-- O rascunho do pre-mortem tinha NOVE objetos. Esta migration traz QUATRO
-- tabelas. Cortados, e o motivo:
--   * message_reads (uma linha por mensagem x participante) — 800 linhas de
--     recibo para 200 de conteudo, e recibo de leitura de dado clinico e
--     trilha morando FORA do audit_log. Chat e linear: uma MARCA D'AGUA por
--     conta resolve "nao lida" e "lida pela equipe". A forma antiga vinha da
--     nota de dominio, escrita ANTES da ADR-008 e da ADR-010.
--   * conversation_transfers — tabela "nao clinica" cujas linhas diziam
--     "Fulano passou este paciente para a psicologa". Vazamento por metadado,
--     a mesma familia de content_directed_sends (ADR-010 §1). Vira
--     conversation_assignments, sob a RLS da conversa.
--   * message_attachments — fica para a fatia 2. NAO por escopo: a politica
--     de bucket que espelha a RLS da tabela (padrao validado em
--     content_attachments, #33) NAO SOBREVIVE ao pedagio — a subconsulta roda
--     como `authenticated`, e desde a ADR-008 o profissional nao le a tabela
--     clinica com esse role. Criar storage_path sem politica seria repetir a
--     divida da #33 de olhos abertos. Questao #34.
--   * quick_replies — texto reutilizavel do profissional, sem paciente e sem
--     especialidade de origem: e Configuracoes da clinica, nao chat.
--   * chat_business_hours — as fontes registram o horario de atendimento e o
--     texto fora do horario como DEFINICAO OPERACIONAL PENDENTE. Inventar o
--     vocabulario aqui e decidir pela CEON, o erro que alert_rules evitou ao
--     nascer vazia (ADR-007 §1).


-- ============================================================
-- 1. O contrato transversal ganha o nome que sempre teve
-- ============================================================
--
-- O tipo nasceu em create_specialty_notes chamado `note_visibility`, mas ele
-- nunca foi da nota: e o `visibility` que a ADR-003 §3 exige de TODA tabela
-- clinica. A conversa e a segunda a carrega-lo, e manter o nome antigo faria
-- a segunda tabela parecer emprestar vocabulario da primeira.

ALTER TYPE public.note_visibility RENAME TO clinical_visibility;

COMMENT ON TYPE public.clinical_visibility IS
  'Escopo de leitura do contrato transversal da ADR-003 §3. Nao e vocabulario da nota — e do dado clinico. Renomeado de note_visibility em 28/08/2026, quando a conversa virou a segunda tabela a exerce-lo.';


-- ============================================================
-- 2. Vocabulario
-- ============================================================

-- Os dois estados que as fontes nomeiam: "marcacao de conversa como
-- resolvida". Nao ha 'arquivada' nem 'encerrada' — nenhuma fonte as menciona,
-- e o requisito exige "historico completo persistente".
CREATE TYPE public.conversation_status AS ENUM ('open', 'resolved');

-- Quem fala. 'system' existe para a mensagem automatica de transicao, que o
-- requisito descreve explicitamente ("mensagem automatica de transicao ao
-- paciente explicando a transferencia") e que NAO tem autor humano.
CREATE TYPE public.message_author_kind AS ENUM ('patient', 'caregiver', 'professional', 'system');


-- ============================================================
-- 3. conversation_subjects — o assunto, e o roteamento que nasce vazio
-- ============================================================
--
-- Categoria configuravel pelo administrador -> TABELA, nao enum (ADR-002).

CREATE TABLE public.conversation_subjects (
  id           uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  code         text NOT NULL UNIQUE,
  label        text NOT NULL,
  -- NULLABLE E VAZIA DE PROPOSITO. "Direcionamento automatico para o
  -- profissional certo conforme o assunto" e requisito; QUAL assunto vai para
  -- QUAL especialidade nao esta em fonte nenhuma. Preencher aqui seria
  -- inventar politica de atendimento — o mesmo erro que alert_rules evitou.
  -- Enquanto vazia, toda conversa nasce NAO ROTEADA e um profissional a
  -- assume por claim_conversation().
  specialty_id uuid REFERENCES public.specialties (id) ON DELETE RESTRICT,
  sort_order   smallint NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.conversation_subjects IS
  'Os quatro assuntos do seletor do app (evolucao do nivel MEDIO). Vocabulario configuravel -> tabela de dominio (ADR-002).';
COMMENT ON COLUMN public.conversation_subjects.specialty_id IS
  'Roteamento assunto -> especialidade. Nasce NULL nos quatro: a fonte exige o roteamento e nao diz o mapa. Vazio e fail-closed — conversa nao roteada fica na fila geral ate alguem assumir.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.conversation_subjects
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();

-- Na MIGRATION, nao em seed: seed nao roda em `db push`, e sem estas quatro
-- linhas o app do paciente nao tem seletor. Mesma decisao das especialidades.
INSERT INTO public.conversation_subjects (code, label, sort_order) VALUES
  ('medication',  'Medicação',   1),
  ('scheduling',  'Agendamento', 2),
  ('symptoms',    'Sintomas',    3),
  ('other',       'Outros',      4);


-- ============================================================
-- 4. conversations
-- ============================================================

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  -- As tres colunas do contrato transversal da ADR-003 §3.
  patient_id          uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- NULL = nao roteada. A conversa so ganha especialidade quando alguem a
  -- assume; e por isso que a coluna nao pode ser NOT NULL como na nota.
  origin_specialty_id uuid REFERENCES public.specialties (id) ON DELETE RESTRICT,
  visibility          public.clinical_visibility NOT NULL DEFAULT 'team',

  subject_id uuid NOT NULL REFERENCES public.conversation_subjects (id) ON DELETE RESTRICT,
  status     public.conversation_status NOT NULL DEFAULT 'open',

  -- Quem abriu: o titular OU o cuidador. A origem aparece na tela (#22, mesma
  -- regra do alerta), e por isso a conta fica registrada, nao so o paciente.
  opened_by uuid NOT NULL REFERENCES public.accounts (id) ON DELETE RESTRICT,

  assigned_professional_id uuid REFERENCES public.professionals (id) ON DELETE RESTRICT,

  -- Ordenacao da lista de conversas. SEM PREVIA, de proposito: uma coluna
  -- last_message_preview poria conteudo clinico numa tabela de metadado, fora
  -- do pedagio read_* — quarta ocorrencia da familia depois do payload do
  -- outbox (ADR-007 §3), do texto livre do sinal (ADR-009 §3) e do
  -- notifications.preview (ADR-010 §2).
  last_message_at timestamptz NOT NULL DEFAULT now(),

  -- "Indicacao visual de leitura pela equipe" (tela do paciente): QUANDO a
  -- equipe leu, nunca QUEM. O quem mora em conversation_read_marks, que so o
  -- dono da marca enxerga.
  team_last_read_at timestamptz,

  resolved_at                timestamptz,
  resolved_by_professional_id uuid REFERENCES public.professionals (id) ON DELETE RESTRICT,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_conversations_resolved_pair
    CHECK ((status = 'resolved') = (resolved_at IS NOT NULL)),
  -- Atribuir E rotear: nao existe profissional responsavel por conversa sem
  -- especialidade, senao a regra de escrita da #25 nao teria contra o que medir.
  CONSTRAINT ck_conversations_assigned_needs_specialty
    CHECK (assigned_professional_id IS NULL OR origin_specialty_id IS NOT NULL)
);

COMMENT ON TABLE public.conversations IS
  'Thread do chat entre paciente (ou cuidador) e equipe. Dado clinico: paga o pedagio da ADR-008 e carrega o contrato transversal da ADR-003 §3.';
COMMENT ON COLUMN public.conversations.visibility IS
  'Nasce team; conversa roteada a especialidade confidencial vira specialty_restricted por trigger — e isso esconde a EXISTENCIA da conversa dos demais profissionais, nao so o conteudo. Sem essa regra, origin_specialty_id = psicologia denunciaria o acompanhamento sem uma palavra ser lida.';
COMMENT ON COLUMN public.conversations.team_last_read_at IS
  'Agregado deliberado: o paciente ve QUE a equipe leu, nunca QUEM leu.';

CREATE TRIGGER trg_set_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 5. conversation_assignments — o historico de quem atendeu
-- ============================================================
--
-- Nao e uma tabela de transferencias: e a lista de quem foi responsavel, e a
-- transferencia e a TRANSICAO entre duas linhas. Serve as duas exigencias do
-- requisito — "historico visual da transferencia" e "notificacao ao
-- profissional original quando resolvido".
--
-- A RLS DERIVA da conversa. Foi o corte do pre-mortem: como tabela propria e
-- aberta, cada linha diria "Fulano passou este paciente para a psicologa".

CREATE TABLE public.conversation_assignments (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id)  ON DELETE RESTRICT,
  professional_id uuid NOT NULL REFERENCES public.professionals (id)  ON DELETE RESTRICT,
  -- A especialidade DAQUELE momento. O profissional pode mudar de
  -- especialidade depois; o historico do atendimento nao muda com ele.
  specialty_id    uuid NOT NULL REFERENCES public.specialties (id)    ON DELETE RESTRICT,
  assigned_at     timestamptz NOT NULL DEFAULT now(),
  released_at     timestamptz,
  CONSTRAINT ck_conversation_assignments_window
    CHECK (released_at IS NULL OR released_at >= assigned_at)
);

-- Uma atribuicao vigente por conversa. Mesma forma de "uma linha vigente" de
-- treatment_plans (ADR-006) e da versao publicada (ADR-010 §4).
CREATE UNIQUE INDEX uq_conversation_assignments_current
  ON public.conversation_assignments (conversation_id)
  WHERE released_at IS NULL;

COMMENT ON TABLE public.conversation_assignments IS
  'Quem foi responsavel pela conversa, e quando. A transferencia e a transicao entre duas linhas — nao ha tabela de transferencia (ADR-012 §2).';


-- ============================================================
-- 6. messages
-- ============================================================

CREATE TABLE public.messages (
  id              uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE RESTRICT,

  author_kind public.message_author_kind NOT NULL,
  -- NULL SO para 'system', e o CHECK amarra os dois sentidos. A mensagem
  -- automatica precisa existir sem autor humano; um NULL solto abriria buraco
  -- em toda politica que chaveia em autoria.
  author_account_id      uuid REFERENCES public.accounts (id)      ON DELETE RESTRICT,
  author_professional_id uuid REFERENCES public.professionals (id) ON DELETE RESTRICT,

  body       text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ck_messages_system_has_no_account
    CHECK ((author_kind = 'system') = (author_account_id IS NULL)),
  CONSTRAINT ck_messages_professional_has_profile
    CHECK ((author_kind = 'professional') = (author_professional_id IS NOT NULL))
);

COMMENT ON TABLE public.messages IS
  'Unidade da conversa. IMUTAVEL, como specialty_notes e como o registro salvo do diario. Sem anexo na fatia 1 (ADR-012 §3, questao #34).';
COMMENT ON COLUMN public.messages.author_kind IS
  'system e a mensagem automatica de transicao. So nasce por RPC SECURITY DEFINER — nenhuma politica de INSERT a aceita, porque todas exigem author_account_id = get_my_uid().';

-- SEM updated_at: a mensagem nao muda. Coluna que nunca se altera so mente.

CREATE FUNCTION private.reject_message_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'mensagem e imutavel (id=%)', COALESCE(OLD.id, NEW.id)
    USING ERRCODE = 'check_violation';
END;
$$;

-- Vale tambem para service_role, que ignora RLS mas nao ignora trigger.
CREATE TRIGGER trg_reject_mutation
BEFORE UPDATE OR DELETE ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.reject_message_mutation();

-- Mantem a ordenacao da lista sem custo de agregacao, e move team_last_read_at
-- de volta a NULL quando chega mensagem nova do paciente.
CREATE FUNCTION private.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- escreve em conversations, que o usuario nao atualiza
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations c
     SET last_message_at   = NEW.created_at,
         team_last_read_at = CASE
           WHEN NEW.author_kind IN ('patient', 'caregiver') THEN NULL
           ELSE c.team_last_read_at
         END
   WHERE c.id = NEW.conversation_id;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_touch_conversation
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.touch_conversation_on_message();


-- ============================================================
-- 7. conversation_read_marks — a marca d'agua
-- ============================================================
--
-- UMA linha por (conversa, conta), nao por mensagem. Chave composta de
-- proposito: o par E a identidade, e um id substituto permitiria duas marcas
-- para o mesmo par — que e exatamente o defeito a evitar. Excecao declarada a
-- ADR-001, cujo motivo (opacidade de volume) nao se aplica a uma tabela que
-- ninguem le alem do dono da linha.

CREATE TABLE public.conversation_read_marks (
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE RESTRICT,
  account_id      uuid NOT NULL REFERENCES public.accounts (id)      ON DELETE RESTRICT,
  last_read_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, account_id)
);

COMMENT ON TABLE public.conversation_read_marks IS
  'Marca d''agua de leitura por conta. Substitui o recibo por mensagem x participante do rascunho (ADR-012 §1): chat e linear, um timestamp basta. So o dono da marca a enxerga.';


-- ============================================================
-- 8. Sigilo: o roteamento a especialidade confidencial fecha a conversa
-- ============================================================

CREATE FUNCTION private.enforce_conversation_confidentiality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- le specialties sem depender da RLS de quem escreve
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
BEFORE INSERT OR UPDATE OF origin_specialty_id ON public.conversations
FOR EACH ROW EXECUTE FUNCTION private.enforce_conversation_confidentiality();

-- O sigilo que chega tarde: a funcao ja existia para as notas e passa a
-- alcancar tambem as conversas. So APERTA — desmarcar is_confidential nao
-- reabre nada do que ja foi escrito sob sigilo.
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
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION private.tighten_notes_on_confidential() IS
  'Sigilo retroage sobre nota E conversa. So aperta (team -> specialty_restricted). Nome herdado de create_specialty_notes, onde nasceu cobrindo so a nota.';


-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE public.conversation_subjects      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_assignments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_read_marks    ENABLE ROW LEVEL SECURITY;

-- --- assunto: vocabulario, nao dado clinico ---------------------------------
CREATE POLICY conversation_subjects_select_all ON public.conversation_subjects
  FOR SELECT TO authenticated
  USING ( is_active );

-- --- conversa: leitura ------------------------------------------------------
CREATE POLICY conversations_select_patient ON public.conversations
  FOR SELECT TO authenticated
  USING ( patient_id = (SELECT private.my_own_patient_id()) );

CREATE POLICY conversations_select_caregiver ON public.conversations
  FOR SELECT TO authenticated
  USING ( patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids()))) );

-- A #9 colapsada: le o que e da equipe, mais o que e da propria especialidade.
-- Conversa NAO ROTEADA (origin_specialty_id IS NULL) nasce visibility 'team' e
-- cai no primeiro termo — e a fila geral, o que torna claim_conversation()
-- possivel sem uma tabela de triagem (que seria nivel COMPLETO).
CREATE POLICY conversations_select_professional ON public.conversations
  FOR SELECT TO clinical_reader
  USING (
    (SELECT private.is_active_professional())
    AND ( visibility = 'team'
          OR origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) )
  );

-- #11 + #23: administracao ve tudo, exceto psicologia.
CREATE POLICY conversations_select_admin ON public.conversations
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) AND visibility = 'team' );

-- NENHUMA politica de INSERT/UPDATE/DELETE na conversa: todo o ciclo e RPC.
-- Abrir a conversa cria a primeira mensagem no mesmo ato; assumir, transferir
-- e resolver escrevem em duas tabelas. Nao ha escrita atomica por politica.

-- --- atribuicoes: a RLS DERIVA da conversa ----------------------------------
-- "Vejo a atribuicao se vejo a conversa" — a mesma forma de
-- diary_symptom_reports. Duas politicas com predicado identico porque os dois
-- roles chegam por caminhos diferentes (ADR-008).
CREATE POLICY conversation_assignments_select_via_conversation ON public.conversation_assignments
  FOR SELECT TO authenticated
  USING ( EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id) );

CREATE POLICY conversation_assignments_select_via_conversation_reader ON public.conversation_assignments
  FOR SELECT TO clinical_reader
  USING ( EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id) );

-- --- mensagens: leitura deriva da conversa ----------------------------------
CREATE POLICY messages_select_via_conversation ON public.messages
  FOR SELECT TO authenticated
  USING ( EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id) );

CREATE POLICY messages_select_via_conversation_reader ON public.messages
  FOR SELECT TO clinical_reader
  USING ( EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id) );

-- --- mensagens: escrita direta, por perfil ----------------------------------
--
-- Segunda escrita direta de usuario do projeto, depois do diario: o chat e
-- de altissima frequencia, e uma RPC por mensagem tornaria a auditoria de
-- ESCRITA maior que o conteudo sem acrescentar regra nenhuma. A autoria da
-- linha imutavel JA e a trilha.

CREATE POLICY messages_insert_patient ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_kind = 'patient'
    AND author_account_id = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_id
         AND c.patient_id = (SELECT private.my_own_patient_id())
         AND c.status = 'open'
    )
  );

CREATE POLICY messages_insert_caregiver ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_kind = 'caregiver'
    AND author_account_id = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
       WHERE c.id = conversation_id
         AND c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
         AND c.status = 'open'
    )
  );

-- ARMADILHA DO PEDAGIO, primeira ocorrencia em politica de ESCRITA: um
-- `EXISTS (SELECT 1 FROM conversations ...)` dentro de um WITH CHECK roda sob
-- `authenticated`, e desde a ADR-008 o profissional NAO tem politica de
-- SELECT com esse role em tabela clinica. O EXISTS seria sempre falso e a
-- equipe inteira ficaria muda — silenciosamente, porque WITH CHECK falso e
-- "violates row-level security", nao "permission denied".
--
-- A saida e a mesma que corta recursao entre politicas em content_items: uma
-- funcao SECURITY DEFINER, onde a RLS nao se aplica e a regra fica explicita.
CREATE FUNCTION private.can_reply_as_professional(p_conversation_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE c.id = p_conversation_id
       AND c.status = 'open'
       AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())))
  );
$$;

COMMENT ON FUNCTION private.can_reply_as_professional(uuid) IS
  'A regra de escrita da #25, fora da RLS. Existe porque o profissional nao enxerga conversations com o role authenticated (ADR-008) — um EXISTS na politica seria sempre falso.';

-- A #25 na direcao RESTRITIVA, e declarada como premissa (ADR-012 §4):
-- responde quem tem a especialidade da conversa. Se a CEON responder
-- "qualquer profissional", abrir e trocar um predicado — politica aditiva.
-- Se a resposta fosse a inversa e tivessemos aberto, seria retrofit sobre
-- texto ja escrito por quem nao podia.
--
-- Conversa NAO ROTEADA nao aceita resposta: e preciso assumi-la antes, e
-- assumir e um ato registrado em conversation_assignments.
CREATE POLICY messages_insert_professional ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_kind = 'professional'
    AND author_account_id = (SELECT public.get_my_uid())
    AND author_professional_id = (SELECT private.my_professional_id())
    AND private.can_reply_as_professional(conversation_id)
  );

-- 'system' nao tem politica: a mensagem automatica so nasce por RPC.

-- --- marca d'agua: so o dono ------------------------------------------------
CREATE POLICY conversation_read_marks_select_own ON public.conversation_read_marks
  FOR SELECT TO authenticated
  USING ( account_id = (SELECT public.get_my_uid()) );


-- ============================================================
-- 10. RPCs — o ciclo da conversa
-- ============================================================

-- Abrir a conversa e enviar a primeira mensagem sao UM ato do ponto de vista
-- do app ("seletor de assunto antes de iniciar a conversa"). Conversa sem
-- mensagem nenhuma seria uma linha que so serve para poluir a fila.
CREATE FUNCTION public.start_conversation(
  p_subject_id uuid,
  p_body       text
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_patient_id      uuid := private.my_own_patient_id();
  v_author_kind     public.message_author_kind := 'patient';
  v_conversation_id uuid;
  v_specialty_id    uuid;
BEGIN
  IF v_patient_id IS NULL THEN
    -- Cuidador abre conversa em nome do tutelado. Ele conversa no chat, e a
    -- origem aparece na tela do profissional (#22).
    SELECT w INTO v_patient_id
      FROM unnest(private.my_ward_patient_ids()) AS w
     LIMIT 1;
    v_author_kind := 'caregiver';
  END IF;

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'apenas titular ou cuidador abre conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT s.specialty_id INTO v_specialty_id
    FROM public.conversation_subjects s
   WHERE s.id = p_subject_id AND s.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'assunto inexistente ou inativo' USING ERRCODE = 'foreign_key_violation';
  END IF;

  INSERT INTO public.conversations
    (patient_id, subject_id, origin_specialty_id, opened_by)
  VALUES
    (v_patient_id, p_subject_id, v_specialty_id, auth.uid())
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.messages (conversation_id, author_kind, author_account_id, body)
  VALUES (v_conversation_id, v_author_kind, auth.uid(), p_body);

  RETURN v_conversation_id;
END;
$$;

COMMENT ON FUNCTION public.start_conversation(uuid, text) IS
  'Abre a conversa E grava a primeira mensagem, atomicamente. A especialidade vem do assunto — hoje sempre NULL, porque o mapa de roteamento nasce vazio.';

-- Assumir a conversa nao roteada. E o que substitui a "fila priorizada" do
-- nivel COMPLETO: nao ha triagem, ha alguem que pega.
CREATE FUNCTION public.claim_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid := private.my_professional_id();
  v_specialty_id    uuid;
  v_conversation    public.conversations;
BEGIN
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo assume conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT ps.specialty_id INTO v_specialty_id
    FROM public.professional_specialties ps
   WHERE ps.professional_id = v_professional_id
   ORDER BY ps.is_primary DESC
   LIMIT 1;

  IF v_specialty_id IS NULL THEN
    RAISE EXCEPTION 'profissional sem especialidade nao assume conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_conversation
    FROM public.conversations c
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.origin_specialty_id IS NULL;

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, ja resolvida ou ja roteada'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversations
     SET origin_specialty_id      = v_specialty_id,
         assigned_professional_id = v_professional_id
   WHERE id = p_conversation_id;

  INSERT INTO public.conversation_assignments (conversation_id, professional_id, specialty_id)
  VALUES (p_conversation_id, v_professional_id, v_specialty_id);
END;
$$;

-- Encaminhamento. Escreve em tres lugares — por isso e RPC, nao politica.
CREATE FUNCTION public.transfer_conversation(
  p_conversation_id   uuid,
  p_to_professional_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_from_professional_id uuid := private.my_professional_id();
  v_to_specialty_id      uuid;
  v_conversation         public.conversations;
BEGIN
  IF v_from_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo encaminha' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- So encaminha quem esta na especialidade da conversa — a mesma regra da
  -- escrita (#25). Sem isto, encaminhar seria a porta lateral para agir sobre
  -- conversa de outra area.
  SELECT c.* INTO v_conversation
    FROM public.conversations c
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())));

  IF v_conversation.id IS NULL THEN
    RAISE EXCEPTION 'conversa inexistente, resolvida ou de outra especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT ps.specialty_id INTO v_to_specialty_id
    FROM public.professional_specialties ps
    JOIN public.professionals p ON p.id = ps.professional_id
    JOIN public.accounts     a ON a.id = p.account_id
   WHERE ps.professional_id = p_to_professional_id
     AND p.is_active AND a.is_active
   ORDER BY ps.is_primary DESC
   LIMIT 1;

  IF v_to_specialty_id IS NULL THEN
    RAISE EXCEPTION 'profissional destino inexistente, inativo ou sem especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversation_assignments
     SET released_at = now()
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;

  INSERT INTO public.conversation_assignments (conversation_id, professional_id, specialty_id)
  VALUES (p_conversation_id, p_to_professional_id, v_to_specialty_id);

  UPDATE public.conversations
     SET origin_specialty_id      = v_to_specialty_id,
         assigned_professional_id = p_to_professional_id
   WHERE id = p_conversation_id;

  -- "Mensagem automatica de transicao ao paciente explicando a
  -- transferencia". Texto GENERICO POR TIPO, sem nome de profissional e sem
  -- nome de especialidade: a mensagem e legivel pelo paciente e pela equipe,
  -- e dizer "encaminhado a Psicologia" aqui vazaria pelo corpo o que a
  -- visibility acabou de fechar.
  INSERT INTO public.messages (conversation_id, author_kind, body)
  VALUES (p_conversation_id, 'system',
          'Sua conversa foi encaminhada para outro profissional da equipe.');
END;
$$;

COMMENT ON FUNCTION public.transfer_conversation(uuid, uuid) IS
  'Encaminha a conversa: libera a atribuicao vigente, cria a nova, reroteia a conversa e grava a mensagem de transicao. O texto da mensagem NAO nomeia a especialidade destino — seria vazamento pelo corpo do que a visibility fecha.';

CREATE FUNCTION public.resolve_conversation(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_professional_id uuid := private.my_professional_id();
BEGIN
  IF v_professional_id IS NULL THEN
    RAISE EXCEPTION 'apenas profissional ativo resolve conversa'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversations c
     SET status                      = 'resolved',
         resolved_at                 = now(),
         resolved_by_professional_id = v_professional_id
   WHERE c.id = p_conversation_id
     AND c.status = 'open'
     AND c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids())));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversa inexistente, ja resolvida ou de outra especialidade'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.conversation_assignments
     SET released_at = now()
   WHERE conversation_id = p_conversation_id
     AND released_at IS NULL;
END;
$$;

-- Marca d'agua. RPC para todos os perfis, e nao politica de UPDATE, porque o
-- profissional NAO enxerga a conversa com o role `authenticated` (ADR-008) —
-- um WITH CHECK que consultasse conversations seria sempre falso para ele.
CREATE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now             timestamptz := now();
  v_is_professional boolean := private.my_professional_id() IS NOT NULL;
  v_visible         boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sessao sem conta' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A funcao e SECURITY DEFINER: sem esta checagem explicita, qualquer conta
  -- marcaria como lida a conversa de qualquer paciente — e a marca vazaria a
  -- EXISTENCIA da conversa por tentativa e erro.
  SELECT EXISTS (
    SELECT 1 FROM public.conversations c
     WHERE c.id = p_conversation_id
       AND ( c.patient_id = private.my_own_patient_id()
             OR c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
             OR ( private.is_active_professional()
                  AND ( c.visibility = 'team'
                        OR c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) ) )
             OR ( private.is_active_admin() AND c.visibility = 'team' ) )
  ) INTO v_visible;

  IF NOT v_visible THEN
    RAISE EXCEPTION 'conversa inexistente ou fora do seu alcance'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  INSERT INTO public.conversation_read_marks (conversation_id, account_id, last_read_at)
  VALUES (p_conversation_id, auth.uid(), v_now)
  ON CONFLICT (conversation_id, account_id)
  DO UPDATE SET last_read_at = EXCLUDED.last_read_at;

  IF v_is_professional THEN
    UPDATE public.conversations
       SET team_last_read_at = v_now
     WHERE id = p_conversation_id;
  END IF;
END;
$$;


-- ============================================================
-- 11. Leitura auditada (ADR-008)
-- ============================================================

GRANT SELECT ON public.conversations, public.messages,
                public.conversation_assignments, public.conversation_subjects
  TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.my_specialty_ids()        TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.is_active_professional()  TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.is_active_admin()         TO clinical_reader;

CREATE FUNCTION public.read_conversations(
  p_patient_id uuid    DEFAULT NULL,
  p_limit      integer DEFAULT 50,
  p_offset     integer DEFAULT 0
)
RETURNS SETOF public.conversations
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT c.* FROM public.conversations c
     WHERE (p_patient_id IS NULL OR c.patient_id = p_patient_id)
     ORDER BY c.last_message_at DESC
     LIMIT LEAST(p_limit, 200) OFFSET p_offset;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('conversations', p_patient_id, v_count);
END;
$$;

CREATE FUNCTION public.read_messages(
  p_conversation_id uuid,
  p_limit           integer     DEFAULT 50,
  p_before          timestamptz DEFAULT NULL
)
RETURNS SETOF public.messages
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count      integer;
  v_patient_id uuid;
BEGIN
  RETURN QUERY
    SELECT m.* FROM public.messages m
     WHERE m.conversation_id = p_conversation_id
       AND (p_before IS NULL OR m.created_at < p_before)
     ORDER BY m.created_at DESC
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- O paciente da trilha vem da conversa. A leitura da propria conversa pela
  -- RLS do leitor e o que garante que um id chutado registre row_count = 0 —
  -- e "acesso negado tambem deixa rastro" (ADR-008 §3).
  SELECT c.patient_id INTO v_patient_id
    FROM public.conversations c WHERE c.id = p_conversation_id;

  PERFORM private.log_clinical_read('messages', v_patient_id, v_count, p_conversation_id);
END;
$$;

CREATE FUNCTION public.read_conversation_assignments(p_conversation_id uuid)
RETURNS SETOF public.conversation_assignments
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count      integer;
  v_patient_id uuid;
BEGIN
  RETURN QUERY
    SELECT a.* FROM public.conversation_assignments a
     WHERE a.conversation_id = p_conversation_id
     ORDER BY a.assigned_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT c.patient_id INTO v_patient_id
    FROM public.conversations c WHERE c.id = p_conversation_id;

  PERFORM private.log_clinical_read('conversation_assignments', v_patient_id, v_count, p_conversation_id);
END;
$$;


-- ============================================================
-- 12. Realtime (ADR-011)
-- ============================================================
--
-- O canal entrega linha aplicando a RLS da TABELA, sob o role da conexao, que
-- e `authenticated`. Desde a ADR-008 o profissional nao tem politica com esse
-- role em tabela clinica — logo:
--
--   * PACIENTE e CUIDADOR recebem em tempo real, porque leem direto.
--   * EQUIPE nao recebe nada, e ISSO E A DECISAO, nao um efeito colateral.
--     Devolver uma politica `TO authenticated` para o profissional aqui
--     anularia o pedagio justamente na tabela de maior volume de conteudo
--     clinico do sistema. O painel clinico atualiza a lista por
--     read_conversations (barata, ordenada por last_message_at); o sinal em
--     tempo real para a equipe espera a tabela de notificacoes (ADR-010 §2),
--     que carrega referencia e nunca conteudo.
--
-- REPLICA IDENTITY fica no padrao (chave primaria): as duas tabelas so
-- publicam INSERT e UPDATE de colunas nao sensiveis, e FULL exporia a linha
-- antiga inteira no evento.

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;


-- ============================================================
-- 13. Trilha de escrita e indices
-- ============================================================

-- Conversa: cada criacao, encaminhamento e resolucao deixa rastro (#12).
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');

-- MENSAGEM NAO TEM TRILHA DE ESCRITA, de proposito: a linha e imutavel e
-- carrega autor e horario. Ela E a propria trilha, e um audit_log por
-- mensagem dobraria o volume de escrita do sistema para repetir o que a
-- tabela ja diz. A trilha de LEITURA (read_messages) continua obrigatoria —
-- e ela que a ADR-008 exige.

-- Lista de conversas do paciente e do painel: sempre por recencia.
CREATE INDEX idx_conversations_patient      ON public.conversations (patient_id, last_message_at DESC);
CREATE INDEX idx_conversations_specialty    ON public.conversations (origin_specialty_id, status, last_message_at DESC);
-- A fila geral: o que ninguem assumiu ainda.
CREATE INDEX idx_conversations_unrouted     ON public.conversations (last_message_at)
  WHERE origin_specialty_id IS NULL AND status = 'open';
CREATE INDEX idx_conversations_assignee     ON public.conversations (assigned_professional_id)
  WHERE assigned_professional_id IS NOT NULL;
CREATE INDEX idx_messages_conversation      ON public.messages (conversation_id, created_at DESC);
CREATE INDEX idx_conversation_assignments_professional
  ON public.conversation_assignments (professional_id, assigned_at DESC);


-- ============================================================
-- 14. Privilegios — SEMPRE no fim
-- ============================================================

-- A conversa so muda por RPC; a mensagem nao muda por caminho nenhum.
REVOKE INSERT, UPDATE, DELETE ON public.conversations            FROM authenticated, service_role;
REVOKE        UPDATE, DELETE ON public.messages                  FROM authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_assignments FROM authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_read_marks  FROM authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE ON public.conversation_subjects    FROM authenticated;

-- O dono da funcao read_* precisa de CREATE no schema. Concede, transfere,
-- revoga — a propriedade fica, o privilegio nao.
GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_conversations(uuid, integer, integer)          OWNER TO clinical_reader;
ALTER FUNCTION public.read_messages(uuid, integer, timestamptz)           OWNER TO clinical_reader;
ALTER FUNCTION public.read_conversation_assignments(uuid)                 OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

REVOKE EXECUTE ON FUNCTION private.reject_message_mutation()              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.touch_conversation_on_message()        FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.enforce_conversation_confidentiality() FROM PUBLIC;
-- Entra em POLITICA DE INSERT: EXECUTE e exigido em runtime de quem escreve.
-- Sem este GRANT, toda resposta de profissional morre com "permission denied
-- for function can_reply_as_professional" — a mesma armadilha ja anotada para
-- uuid_generate_v7, get_my_uid e my_professional_id.
REVOKE EXECUTE ON FUNCTION private.can_reply_as_professional(uuid)        FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION private.can_reply_as_professional(uuid)        TO authenticated;

REVOKE EXECUTE ON FUNCTION public.start_conversation(uuid, text)          FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_conversation(uuid)                FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid)       FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.resolve_conversation(uuid)              FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid)            FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_conversations(uuid, integer, integer)     FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_messages(uuid, integer, timestamptz)      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_conversation_assignments(uuid)            FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.start_conversation(uuid, text)     TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_conversation(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_conversation(uuid, uuid)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_conversation(uuid)         TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid)       TO authenticated;
GRANT EXECUTE ON FUNCTION public.read_conversations(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_messages(uuid, integer, timestamptz)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.read_conversation_assignments(uuid)        TO authenticated, service_role;

-- A equipe escreve a mensagem direto (politica da secao 9) mas NAO le a
-- tabela com `authenticated`: a leitura passa pela funcao auditada. O titular
-- e o cuidador seguem lendo direto — e e isso que faz o Realtime funcionar
-- para o app do paciente e nao para o painel (secao 12).
REVOKE SELECT ON public.conversations            FROM anon;
REVOKE SELECT ON public.messages                 FROM anon;
REVOKE SELECT ON public.conversation_assignments FROM anon;
REVOKE SELECT ON public.conversation_read_marks  FROM anon;
REVOKE SELECT ON public.conversation_subjects    FROM anon;
