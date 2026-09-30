-- Fase 3.1 das pendencias consolidadas (app #7, painel G-4): fechar o ciclo do
-- pedido do titular.
-- Design e racional: supera-docs/ADRs/ADR-025 — Ciclo do pedido do titular e exportacao.md
-- Decisao de base: ADR-005 e a emenda de 31/08/2026 (a #20 respondida).
--
-- O ESTADO QUE ESTA MIGRATION ENCONTRA: `decide_data_subject_request` so
-- aceitava deferir ou recusar, nada gravava `executed_at`, e o enum tinha
-- `under_review` e `executed` que nenhum caminho alcancava. O pedido nascia,
-- era decidido e parava ali — com prazo legal correndo.
--
-- A LISTA PEDIA "exclusao anonimiza conforme a retencao (D.3)", e o vault ja
-- tinha respondido outra coisa. Em 31/08/2026 a CEON, como controladora,
-- decidiu que o botao do app ENCERRA O ACESSO e que o dado clinico continua
-- guardado (retencao legal). Anonimizar seria o desfecho errado, e
-- irreversivel. Por isso a exclusao aqui desativa, nao sobrescreve — e a D.3
-- (a janela de retencao) deixa de bloquear este item: ela bloqueia a rotina
-- que um dia eliminara o dado clinico, nao o encerramento do acesso.
--
-- O QUE ENTRA:
--   1. duas colunas e a maquina de estados, imposta por trigger (vale tambem
--      para service_role, que nao passa pelas RPCs);
--   2. trilha de escrita no pedido;
--   3. `decide_data_subject_request` alcanca `under_review`, e a recusa exige
--      motivo (LGPD art. 18 §4);
--   4. `complete_data_subject_request` — o cumprimento manual da retificacao;
--   5. a rotina que executa exclusao e revogacao de consentimento;
--   6. `export_my_data` — o pacote de acesso e portabilidade, em JSON.


-- ============================================================
-- 1. Colunas e maquina de estados
-- ============================================================
--
--   requested ──► under_review ──► granted ──► executed
--       │               │
--       ├───────────────┴──► refused
--       └──────────────────► granted
--
-- `reviewed_at` data a entrada em analise. Pular a analise e permitido (um
-- pedido de acesso simples pode ser deferido direto), e entao a coluna fica
-- nula — a ausencia diz exatamente isso.
--
-- `execution_error` guarda a ultima falha da rotina de execucao. Sem ela, um
-- pedido que a rotina nao consegue cumprir ficaria em `granted` para sempre,
-- indistinguivel de "ainda nao rodou". O padrao do projeto para falha que nao
-- pode ser engolida: fica escrita onde quem opera olha.

-- O CHECK nasce junto da coluna, no mesmo ADD COLUMN: a coluna e nova e nula
-- em todas as linhas, entao nao ha o que validar — o NOT VALID + VALIDATE do
-- padrao do projeto existe para constraint sobre coluna JA populada.
ALTER TABLE public.data_subject_requests
  ADD COLUMN reviewed_at     timestamptz
    CONSTRAINT ck_dsr_reviewed CHECK (status <> 'requested' OR reviewed_at IS NULL),
  ADD COLUMN execution_error text;

COMMENT ON COLUMN public.data_subject_requests.reviewed_at IS
  'Entrada em analise (under_review). Nula quando o pedido foi decidido direto, sem analise registrada.';
COMMENT ON COLUMN public.data_subject_requests.execution_error IS
  'Ultima falha da rotina de execucao (exclusao, revogacao). Limpa quando o pedido e executado. Nunca texto do titular.';

COMMENT ON TABLE public.data_subject_requests IS
  'Pedido do titular (LGPD art. 18). Maquina de estados imposta por trigger; exclusao ENCERRA O ACESSO, nao anonimiza (ADR-005, emenda de 31/08/2026; ADR-025).';

CREATE FUNCTION private.guard_data_subject_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- O pedido e do titular e tem tipo desde o primeiro instante. Trocar
  -- qualquer um dos dois seria outro pedido, com outra data de entrada — e a
  -- data de entrada e o que conta o prazo.
  IF NEW.account_id   IS DISTINCT FROM OLD.account_id
     OR NEW.request_type IS DISTINCT FROM OLD.request_type
     OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'data_subject_request_immutable' USING ERRCODE = '42501';
  END IF;

  IF NEW.status = OLD.status THEN
    -- Sem transicao, so a anotacao da rotina pode mudar. Decisao e datas sao
    -- fato consumado: reescreve-las apagaria o que a trilha precisa contar.
    IF NEW.decided_by    IS DISTINCT FROM OLD.decided_by
       OR NEW.decided_at    IS DISTINCT FROM OLD.decided_at
       OR NEW.decision_note IS DISTINCT FROM OLD.decision_note
       OR NEW.reviewed_at   IS DISTINCT FROM OLD.reviewed_at
       OR NEW.executed_at   IS DISTINCT FROM OLD.executed_at THEN
      RAISE EXCEPTION 'data_subject_request_immutable' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (
       (OLD.status = 'requested'    AND NEW.status IN ('under_review', 'granted', 'refused'))
    OR (OLD.status = 'under_review' AND NEW.status IN ('granted', 'refused'))
    OR (OLD.status = 'granted'      AND NEW.status = 'executed')
  ) THEN
    RAISE EXCEPTION 'invalid_transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_guard_transition
  BEFORE UPDATE ON public.data_subject_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.guard_data_subject_request_transition();


-- ============================================================
-- 2. Trilha de escrita
-- ============================================================
--
-- DOIS GATILHOS, e a divisao e o que mantem a trilha legivel: a criacao do
-- pedido e cada TRANSICAO de estado deixam linha; a anotacao de erro da rotina,
-- que se repete a cada tentativa, nao. Uma rotina de 5 em 5 minutos presa num
-- pedido geraria 288 linhas por dia de "nada mudou".
--
-- '-' porque o pedido e da CONTA, nao da ficha: `data_subject_requests` nao tem
-- `patient_id`, e o cuidador e o profissional tambem podem pedir.

CREATE TRIGGER trg_audit_write_insert
  AFTER INSERT ON public.data_subject_requests
  FOR EACH ROW
  EXECUTE FUNCTION private.audit_write('-');

CREATE TRIGGER trg_audit_write_transition
  AFTER UPDATE ON public.data_subject_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION private.audit_write('-');


-- ============================================================
-- 3. A decisao da controladora
-- ============================================================
--
-- Mesma assinatura, entao CREATE OR REPLACE preserva o ACL. `executed`
-- CONTINUA recusado aqui: decidir e executar sao atos separados (ADR-005 §2),
-- e a execucao tem os seus proprios caminhos, abaixo.
--
-- A RECUSA EXIGE MOTIVO. A LGPD (art. 18 §4) manda indicar as razoes de fato
-- ou de direito quando a providencia nao e adotada, e o titular le o proprio
-- pedido (`data_subject_requests_select_own`): o motivo e o que ele recebe.
--
-- `clock_timestamp()` e nao `now()`: analisar e deferir no mesmo ato (o
-- painel pode encadear) daria o mesmo instante as duas colunas, e a ordem dos
-- fatos se perderia. Terceira vez que a constante transacional morde aqui.

CREATE OR REPLACE FUNCTION public.decide_data_subject_request(
  p_request_id uuid,
  p_status     public.data_subject_request_status,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_note text := NULLIF(pg_catalog.btrim(p_note), '');
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('under_review', 'granted', 'refused') THEN
    RAISE EXCEPTION 'unsupported_status' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'refused' AND v_note IS NULL THEN
    RAISE EXCEPTION 'refusal_requires_reason' USING ERRCODE = '22023';
  END IF;

  IF p_status = 'under_review' THEN
    UPDATE public.data_subject_requests
       SET status      = 'under_review',
           reviewed_at = pg_catalog.clock_timestamp()
     WHERE id = p_request_id
       AND status = 'requested';
  ELSE
    UPDATE public.data_subject_requests
       SET status        = p_status,
           decided_by    = auth.uid(),
           decided_at    = pg_catalog.clock_timestamp(),
           decision_note = v_note
     WHERE id = p_request_id
       AND status IN ('requested', 'under_review');
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_open' USING ERRCODE = '42501';
  END IF;
END;
$$;


-- ============================================================
-- 4. Cumprimento manual — so a retificacao
-- ============================================================
--
-- Retificar e corrigir o cadastro, e as escritas que corrigem ja existem
-- (`update_patient`, as dez escritas da ficha). O banco nao tem como saber que
-- a correcao pedida foi feita; o administrador declara, e a declaracao fica
-- datada e na trilha.
--
-- OS OUTROS TIPOS NAO PASSAM POR AQUI, de proposito: acesso e portabilidade
-- se cumprem quando o titular baixa o pacote, exclusao e revogacao quando a
-- rotina executa. Um "marcar como cumprido" generico deixaria o painel fechar
-- um pedido de exclusao sem que acesso nenhum tivesse sido encerrado.

CREATE FUNCTION public.complete_data_subject_request(
  p_request_id uuid,
  p_note       text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  UPDATE public.data_subject_requests
     SET status        = 'executed',
         executed_at   = pg_catalog.clock_timestamp(),
         -- A nota de cumprimento complementa a decisao, nao a substitui.
         decision_note = COALESCE(NULLIF(pg_catalog.btrim(p_note), ''), decision_note)
   WHERE id = p_request_id
     AND status = 'granted'
     AND request_type = 'rectification';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_completable' USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.complete_data_subject_request(uuid, text) IS
  'Admin declara cumprida uma retificacao deferida. So retificacao: os demais tipos se cumprem pelo proprio mecanismo (pacote baixado, rotina executada).';

-- A transicao granted -> executed so e aceita pelo trigger; a nota nao pode
-- mudar sem transicao. O cumprimento muda as duas coisas no mesmo UPDATE, que
-- e uma transicao — o guard aceita.


-- ============================================================
-- 5. Execucao de exclusao e de revogacao de consentimento
-- ============================================================
--
-- O QUE "EXCLUSAO" FAZ, na decisao da controladora (31/08/2026): encerra o
-- acesso, guarda o dado clinico. Concretamente, para a conta do pedido:
--
--   a. revoga os consentimentos vigentes — o tratamento que dependia de
--      consentimento acaba; o dado de saude segue sob art. 11, II, f;
--   b. revoga os vinculos de acompanhante ativos, dos dois lados: quem a conta
--      acompanhava e quem acompanhava a conta. O acesso delegado deriva do
--      titular (ADR-003), e o titular saiu;
--   c. cancela os convites de acompanhante pendentes — sem isso, um convite
--      aceito amanha recriaria o vinculo que (b) acabou de revogar;
--   d. desativa a conta. A RLS ja honra `accounts.is_active` em todo agregado;
--      o gatilho de trilha de `accounts` deixa a linha, e o de notificacoes
--      (`trg_deactivate_tokens`) desliga os aparelhos — nenhum push sai para a
--      conta encerrada, sem que esta funcao repita a regra.
--
-- NADA E APAGADO E NADA E SOBRESCRITO. `patients` continua ativo como ficha: e
-- o prontuario da clinica, sob retencao legal, e a equipe segue lendo. Se a
-- conta for reativada pelo administrador, o titular volta a entrar e precisa
-- aceitar os termos de novo (allow_consent_reacceptance torna isso possivel).
--
-- "REVOGACAO DE CONSENTIMENTO" faz so o passo (a).
--
-- SECURITY DEFINER e dono `postgres`: roda do pg_cron, sem sessao de usuario,
-- e precisa escrever em tabelas sem politica de escrita. Nenhum papel da API
-- recebe EXECUTE.

CREATE FUNCTION private.execute_data_subject_request(p_request_id uuid)
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
    -- (b) vinculos, dos dois lados
    UPDATE public.patient_caregivers pc
       SET status             = 'revoked',
           revoked_at         = pg_catalog.clock_timestamp(),
           revoked_by_account = NULL   -- ator do sistema; a trilha diz 'system'
     WHERE pc.status = 'active'
       AND (   pc.patient_id   IN (SELECT p.id FROM public.patients   p WHERE p.account_id = v_req.account_id)
            OR pc.caregiver_id IN (SELECT c.id FROM public.caregivers c WHERE c.account_id = v_req.account_id));

    -- (c) convites pendentes da ficha do titular
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

COMMENT ON FUNCTION private.execute_data_subject_request(uuid) IS
  'Executa exclusao (encerra o acesso, guarda o dado clinico) ou revogacao de consentimento deferida. Nada e apagado nem sobrescrito (ADR-005, ADR-025).';

-- A rotina: um pedido por subtransacao. Sem o bloco EXCEPTION, um pedido que
-- falhasse (o ultimo administrador pedindo exclusao, por exemplo) derrubaria a
-- execucao de todos os outros, a cada 5 minutos, para sempre.
--
-- O BLOCO NAO ENGOLE O ERRO — e a diferenca para o episodio de 28/08 que o
-- CLAUDE.md registra. A falha vai para `execution_error`, na linha que o painel
-- mostra, e o pedido continua `granted`. A contagem devolvida e o que o
-- `cron.job_run_details` guarda.
CREATE FUNCTION private.execute_granted_subject_requests()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id    uuid;
  v_count integer := 0;
BEGIN
  FOR v_id IN
    SELECT id
      FROM public.data_subject_requests
     WHERE status = 'granted'
       AND request_type IN ('deletion', 'consent_revocation')
     ORDER BY decided_at
  LOOP
    BEGIN
      PERFORM private.execute_data_subject_request(v_id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.data_subject_requests
         SET execution_error = pg_catalog.left(SQLERRM, 500)
       WHERE id = v_id;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

-- A fila que a rotina varre e a que a execucao esvazia: parcial, pequena.
CREATE INDEX idx_dsr_executable ON public.data_subject_requests (decided_at)
  WHERE status = 'granted';

-- De 5 em 5 minutos, como o lembrete de compromisso. O prazo legal e em dias;
-- o intervalo existe para que "deferido" e "executado" fiquem proximos o
-- bastante para o painel nao precisar explicar a diferenca.
SELECT cron.schedule(
  'execute-subject-requests',
  '*/5 * * * *',
  $$SELECT private.execute_granted_subject_requests()$$
);


-- ============================================================
-- 6. Acesso e portabilidade — o pacote
-- ============================================================
--
-- A LISTA PEDIA "Edge Function que gera o pacote e devolve link de validade
-- curta". O desenho aplicado e outro, e o motivo e o que a pesquisa de 28/08
-- mediu sobre o Storage: URL assinada e CREDENCIAL AO PORTADOR — funciona sem
-- login, para quem receber o link. Um pacote com o prontuario inteiro atras de
-- uma URL dessas, mais uma copia dele parada num bucket ate a limpeza rodar,
-- seriam dois vazamentos possiveis que o pedido nao exige.
--
-- O pacote e montado NA HORA, na sessao do proprio titular, e devolvido como
-- JSON (formato aberto, legivel por maquina — o que portabilidade pede). O app
-- salva o arquivo no aparelho. Nao ha copia em repouso, nao ha link, nao ha
-- Edge Function. A "validade curta" vira JANELA: 15 dias a partir do
-- deferimento, o prazo do art. 19, II para a declaracao completa.
--
-- SECURITY INVOKER, e esta e a decisao que carrega o resto: a funcao le com a
-- RLS do titular. O pacote contem exatamente o que o app ja mostra a ele — a
-- regra de visibilidade nao e reescrita aqui, e por isso nao pode divergir da
-- RLS. O que o titular nao le no app nao entra: anotacao de especialidade
-- (#30, ADR-009) e alerta. Os filtros por `patient_id` e `account_id` abaixo
-- nao concedem nada; eles RECORTAM, para que a conta que tambem e acompanhante
-- nao leve junto o prontuario do tutelado, que e dado de outro titular.
--
-- O PORTAO NAO E BARREIRA DE SEGURANCA, e o comentario diz isso para ninguem
-- supor o contrario: tudo o que o pacote contem o titular ja le direto. O
-- portao e o CICLO — o pacote sai sob um pedido deferido, dentro da janela, e
-- a entrega fica na trilha como exportacao.

-- O unico trecho privilegiado: validar o pedido, marcar a entrega, registrar.
CREATE FUNCTION private.register_subject_export(p_request_id uuid, p_row_count bigint)
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
     AND account_id = auth.uid()
     AND request_type IN ('access', 'portability')
     AND status IN ('granted', 'executed')
   FOR UPDATE;

  -- Mesmo erro para "nao existe", "nao e seu" e "nao foi deferido": dizer qual
  -- confirmaria a existencia de pedido alheio.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'request_not_available' USING ERRCODE = '42501';
  END IF;

  IF v_req.decided_at + interval '15 days' < pg_catalog.now() THEN
    RAISE EXCEPTION 'export_window_closed' USING ERRCODE = '42501';
  END IF;

  -- A primeira entrega cumpre o pedido. As seguintes, dentro da janela, sao
  -- permitidas (o arquivo se perde, o aparelho troca) e cada uma deixa linha.
  IF v_req.status = 'granted' THEN
    UPDATE public.data_subject_requests
       SET status      = 'executed',
           executed_at = pg_catalog.clock_timestamp()
     WHERE id = p_request_id;
  END IF;

  PERFORM private.log_data_export(
    'data_subject_requests', p_row_count, private.my_own_patient_id(), p_request_id);
END;
$$;

CREATE FUNCTION public.export_my_data(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_patient_id uuid := private.my_own_patient_id();
  v_account    jsonb;
  v_sections   jsonb := '{}'::jsonb;
  v_patient    jsonb := NULL;
  v_rows       bigint := 0;
  v_part       jsonb;
  v_key        text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.to_jsonb(a) INTO v_account
    FROM public.accounts a WHERE a.id = v_uid;

  -- ---------- o que e da CONTA (vale para qualquer perfil) ----------

  v_sections := v_sections || pg_catalog.jsonb_build_object(
    'consents', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', c.id, 'document_kind', v.kind, 'document_version', v.version,
               'accepted_at', c.accepted_at, 'revoked_at', c.revoked_at)
             ORDER BY c.accepted_at), '[]'::jsonb)
        FROM public.consent_records c
        LEFT JOIN public.legal_document_versions v ON v.id = c.document_version_id
       WHERE c.account_id = v_uid),
    'data_subject_requests', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) - 'execution_error'
             ORDER BY r.created_at), '[]'::jsonb)
        FROM public.data_subject_requests r
       WHERE r.account_id = v_uid),
    'notification_preferences', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(np)), '[]'::jsonb)
        FROM public.notification_preferences np
       WHERE np.account_id = v_uid),
    'notifications', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(n) ORDER BY n.created_at), '[]'::jsonb)
        FROM public.notifications n
       WHERE n.recipient_account_id = v_uid),
    'device_tokens', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(d) ORDER BY d.created_at), '[]'::jsonb)
        FROM public.device_tokens d
       WHERE d.account_id = v_uid),
    -- Como acompanhante: o perfil e os vinculos (so o id da ficha, que e de
    -- outro titular), e as mensagens que a propria conta escreveu.
    'caregiver_profiles', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(cg)), '[]'::jsonb)
        FROM public.caregivers cg
       WHERE cg.account_id = v_uid),
    'caregiver_links', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(pc) ORDER BY pc.granted_at), '[]'::jsonb)
        FROM public.patient_caregivers pc
        JOIN public.caregivers cg ON cg.id = pc.caregiver_id
       WHERE cg.account_id = v_uid),
    'messages_as_caregiver', (
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', m.id, 'conversation_id', m.conversation_id,
               'body', m.body, 'created_at', m.created_at)
             ORDER BY m.created_at), '[]'::jsonb)
        FROM public.messages m
       WHERE m.author_account_id = v_uid
         AND m.author_kind = 'caregiver')
  );

  -- ---------- o que e da FICHA, quando a conta e titular ----------

  IF v_patient_id IS NOT NULL THEN
    v_patient := pg_catalog.jsonb_build_object(
      'record', (
        SELECT pg_catalog.to_jsonb(p) FROM public.patients p WHERE p.id = v_patient_id),
      'diagnoses', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.patient_diagnoses x WHERE x.patient_id = v_patient_id),
      'clinical_history', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.patient_clinical_history x WHERE x.patient_id = v_patient_id),
      'treatment_plans', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.treatment_plans x WHERE x.patient_id = v_patient_id),
      'diary_entries', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.entry_date), '[]'::jsonb)
          FROM public.diary_entries x WHERE x.patient_id = v_patient_id),
      'diary_symptom_reports', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.diary_symptom_reports x
          JOIN public.diary_entries e ON e.id = x.diary_entry_id
         WHERE e.patient_id = v_patient_id),
      'appointments', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.starts_at), '[]'::jsonb)
          FROM public.appointments x WHERE x.patient_id = v_patient_id),
      'conversations', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.conversations x WHERE x.patient_id = v_patient_id),
      'messages', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.messages x
          JOIN public.conversations c ON c.id = x.conversation_id
         WHERE c.patient_id = v_patient_id),
      -- Metadado do anexo, nao o arquivo: o arquivo se baixa pelo Storage com a
      -- mesma sessao, e embuti-lo em base64 faria o pacote pesar o que os
      -- anexos pesam.
      'message_attachments', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.message_attachments x
          JOIN public.messages m      ON m.id = x.message_id
          JOIN public.conversations c ON c.id = m.conversation_id
         WHERE c.patient_id = v_patient_id),
      'nps_responses', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.nps_responses x
          JOIN public.nps_surveys s ON s.id = x.survey_id
         WHERE s.patient_id = v_patient_id),
      'content_states', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.created_at), '[]'::jsonb)
          FROM public.patient_content_states x WHERE x.patient_id = v_patient_id),
      'caregiver_links', (
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(x) ORDER BY x.granted_at), '[]'::jsonb)
          FROM public.patient_caregivers x WHERE x.patient_id = v_patient_id)
    );
  END IF;

  -- A contagem da trilha: uma linha por registro entregue. E o numero que
  -- distingue "exportou a ficha de um paciente" de "exportou a base".
  FOR v_key, v_part IN SELECT * FROM pg_catalog.jsonb_each(v_sections) LOOP
    v_rows := v_rows + pg_catalog.jsonb_array_length(v_part);
  END LOOP;
  IF v_patient IS NOT NULL THEN
    FOR v_key, v_part IN SELECT * FROM pg_catalog.jsonb_each(v_patient) LOOP
      v_rows := v_rows + CASE WHEN pg_catalog.jsonb_typeof(v_part) = 'array'
                              THEN pg_catalog.jsonb_array_length(v_part) ELSE 1 END;
    END LOOP;
  END IF;
  v_rows := v_rows + 1;  -- a conta

  PERFORM private.register_subject_export(p_request_id, v_rows);

  RETURN pg_catalog.jsonb_build_object(
    'format',         'jornada-supera/data-subject-export',
    'format_version', 1,
    'generated_at',   pg_catalog.now(),
    'request_id',     p_request_id,
    'account',        v_account,
    'patient',        v_patient
  ) || v_sections;
END;
$$;

COMMENT ON FUNCTION public.export_my_data(uuid) IS
  'Pacote LGPD de acesso/portabilidade, em JSON, montado na hora sob a RLS do titular. Exige pedido deferido; janela de 15 dias do deferimento. Sem copia em repouso, sem link.';


-- ============================================================
-- 7. Privilegios — no fim, e medidos
-- ============================================================
--
-- `register_subject_export` e chamada DE DENTRO de `export_my_data`, que e
-- SECURITY INVOKER — logo roda como `authenticated` e precisa do EXECUTE. Nao
-- e porta aberta: `private` nao e schema exposto, e o corpo exige que o pedido
-- seja do chamador.

REVOKE EXECUTE ON FUNCTION private.guard_data_subject_request_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION private.execute_data_subject_request(uuid)      FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.execute_granted_subject_requests()      FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.register_subject_export(uuid, bigint)   FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.register_subject_export(uuid, bigint)   TO authenticated;

REVOKE EXECUTE ON FUNCTION public.complete_data_subject_request(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.export_my_data(uuid)                      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.decide_data_subject_request(uuid, public.data_subject_request_status, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.complete_data_subject_request(uuid, text) TO authenticated;
GRANT  EXECUTE ON FUNCTION public.export_my_data(uuid)                      TO authenticated;
GRANT  EXECUTE ON FUNCTION public.decide_data_subject_request(uuid, public.data_subject_request_status, text) TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('authenticated', 'private.execute_data_subject_request(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('authenticated', 'private.execute_granted_subject_requests()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated executa pedido LGPD sem passar pela decisao';
  END IF;
  IF pg_catalog.has_function_privilege('anon', 'public.export_my_data(uuid)', 'EXECUTE')
     OR pg_catalog.has_function_privilege('anon', 'public.complete_data_subject_request(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca RPC do ciclo LGPD';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'public.export_my_data(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.register_subject_export(uuid, bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'o titular perdeu o caminho do proprio pacote';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'execute-subject-requests') THEN
    RAISE EXCEPTION 'job execute-subject-requests nao foi agendado';
  END IF;
END;
$$;
