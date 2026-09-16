-- Agregado Diario e alertas — FATIA 2: o caminho quente.
-- Design e racional: supera-docs/Modelo de Dados/Diario e alertas.md
-- Decisoes sob teste:  ADR-007 (granularidade e gatilho), ADR-019 (assuncao,
--                      designacao e desfecho), ADR-017 (quem tria)
--
-- Esta fatia ficou desenhada e NAO APLICADA por catorze dias, travada pelas
-- questoes #7, #25 e #28. As tres cairam em 31/08/2026 e nenhuma exigiu
-- resposta nova da clinica: a #25 foi respondida no questionario, a #7 estava
-- implicita na resposta anterior (lista de TRES estados nao comporta descarte)
-- e a #28 estava escrita no CONTRATO desde o inicio — "fila clinica priorizada
-- por IA com sugestao de conduta" e nivel COMPLETO, com todas as letras.
--
-- O QUE NAO NASCE, e a ausencia esta sob assercao na suite:
--   * coluna de GRAVIDADE. A clinica respondeu que nao ha faixas — critico ou
--     nao critico. "Critico" deixa de ser atributo e passa a ser CONDICAO DE
--     EXISTENCIA DA LINHA: o alerta so nasce se a regra o classificou assim, e
--     guardar a gravidade seria guardar uma constante. A fila ordena por TEMPO
--     DE ESPERA (ADR-019 §2).
--   * qualquer coluna `ai_*`, `priority_*` ou `triage_score`. Nivel COMPLETO
--     por texto contratual (ADR-019 §3).
--   * `alert_assignments` como tabela. O produto consulta historico DE ALERTAS,
--     nao de atribuicoes, e o encadeamento de repasses ja fica em audit_log
--     pelo audit_write que toda tabela clinica carrega (ADR-019 §4).
--   * `diary_summaries`. O Resumo do Diario e derivacao da janela, montada no
--     envio (ADR-007 §2).
--   * `origin_specialty_id` / `visibility`. O alerta HERDA a excecao declarada
--     do diario: quem origina o dado e o paciente, nao uma especialidade
--     (ADR-007 §4). Por isso a excecao da psicologia (#23) tambem nao alcanca
--     esta tabela.


-- ============================================================
-- 1. Vocabulario (ADR-002)
-- ============================================================

-- Os tres estados sao RESPOSTA, nao cautela: "nao colocar 'Em conduta', o
-- assumido ja pressupoe que estao sendo tomadas as devidas condutas para
-- conclusao. O profissional define quando esta resolvido" (CEON, 31/08/2026).
-- Sem desfecho de descarte: alarme falso e RESOLVIDO com a conduta dizendo
-- isso. Se a clinica pedir a estatistica de falso positivo, ALTER TYPE ... ADD
-- VALUE e a operacao mais barata que existe sobre enum (ADR-019 §1).
CREATE TYPE public.alert_status AS ENUM ('open', 'in_progress', 'resolved');

COMMENT ON TYPE public.alert_status IS
  'aberto -> em atendimento -> resolvido. Tres valores por resposta da CEON (31/08/2026), sem descarte. Resolvido e terminal, garantido por trigger.';

-- A conduta e ATRIBUTO, nao estado — como a fonte textual sempre disse.
CREATE TYPE public.alert_conduct_kind AS ENUM ('guidance', 'scheduling', 'referral');

COMMENT ON TYPE public.alert_conduct_kind IS
  'Orientacao, agendamento, encaminhamento — os tres tipos nomeados no requisito da tela de alertas.';

-- Eixo INDEPENDENTE do estado de atendimento: o alerta pode estar resolvido
-- internamente e ainda pendente de envio, ou enviado e ainda aberto. Nao
-- colapsar num campo so (Integracao Gemed — escopo e contratos de dados).
CREATE TYPE public.gemed_outbox_status AS ENUM
  ('pending', 'sending', 'sent', 'failed', 'given_up');


-- ============================================================
-- 2. alert_rules — nasce VAZIA, e o vazio e fail-closed
-- ============================================================
--
-- Nenhuma linha nesta migration. Sem regra, NENHUM alerta dispara — e isso e
-- estado ESPERADO, nao pendencia de banco: preencher e ato do administrador na
-- tela de Configuracoes da clinica.
--
-- A escolha e deliberada contra a alternativa comoda. Um default nosso
-- (grau >= 4) destravaria a homologacao hoje e viraria, em silencio, o
-- comportamento de producao — com o limiar CLINICO decidido por engenharia.
-- Dado fabricado e pior que dado ausente (ADR-007 §1).
--
-- VERSIONADA E DATADA porque um alerta disparado no passado precisa ser
-- explicavel pela regra vigente naquele momento (Configuracoes da clinica). A
-- forma e a de professional_specialties: vigencia se encerra, a linha fica.

CREATE TABLE public.alert_rules (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  symptom_id uuid NOT NULL REFERENCES public.symptoms (id) ON DELETE RESTRICT,
  -- BETWEEN 1 e nao 0: grau 0 e "marquei o sintoma e ele nao me incomodou".
  -- Uma regra com minimo 0 dispararia alerta em todo registro do diario.
  min_grade  smallint NOT NULL CHECK (min_grade BETWEEN 1 AND 5),
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to   timestamptz,
  created_by_account uuid REFERENCES public.accounts (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- >= e nao >: dentro de UMA transacao now() e constante, entao trocar o
  -- limiar duas vezes no mesmo ato administrativo fecharia a vigencia no mesmo
  -- instante em que ela abriu. Vigencia de duracao zero e legitima — significa
  -- "regra substituida antes de valer", e e o que o historico precisa dizer.
  CONSTRAINT ck_alert_rules_period
    CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

COMMENT ON TABLE public.alert_rules IS
  'Gatilhos de criticidade: qual sintoma, a partir de qual grau. NASCE VAZIA e o vazio e FAIL-CLOSED — semantica OPOSTA a de private.has_permission, onde catalogo vazio LIBERA tudo. As duas convivem no mesmo banco, e a analogia errada e o modo de falha previsivel (ADR-007 §1).';
COMMENT ON COLUMN public.alert_rules.effective_to IS
  'NULL = regra vigente. Regra nao se apaga nem se reescreve: alerts.alert_rule_id aponta para a linha que o disparou, e a auditoria precisa dela intacta.';

-- Uma regra vigente por sintoma: duas dariam dois limiares para o mesmo
-- sintoma, e o alerta nao saberia qual o explica.
CREATE UNIQUE INDEX uq_alert_rules_active
  ON public.alert_rules (symptom_id)
  WHERE effective_to IS NULL;

CREATE INDEX idx_alert_rules_symptom ON public.alert_rules (symptom_id);
CREATE INDEX idx_alert_rules_created_by ON public.alert_rules (created_by_account);


-- ============================================================
-- 3. alerts
-- ============================================================

CREATE TABLE public.alerts (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  diary_entry_id    uuid NOT NULL REFERENCES public.diary_entries (id) ON DELETE RESTRICT,
  -- IDEMPOTENCIA (ADR-007 §6): um sintoma graduado produz no maximo um alerta.
  -- Re-submissao ou reprocessamento nao cria o segundo.
  symptom_report_id uuid NOT NULL REFERENCES public.diary_symptom_reports (id) ON DELETE RESTRICT,
  -- Qual regra disparou. RESTRICT + vigencia encerrada em vez de UPDATE: e o
  -- que torna o alerta explicavel pela regra da epoca.
  alert_rule_id     uuid NOT NULL REFERENCES public.alert_rules (id) ON DELETE RESTRICT,
  -- DENORMALIZACAO DELIBERADA, e a unica do agregado. A fila mostra "paciente,
  -- sintoma, graduacao e horario" por item; sem estas duas colunas a tela faria
  -- N+1 chamadas auditadas para montar uma lista. O que torna esta copia
  -- diferente de todas as que o projeto RECUSOU (previa da ultima mensagem,
  -- published_version_id, proveniencia do plano em patients) e que a origem e
  -- PROVADAMENTE IMUTAVEL: registro salvo nao volta a rascunho, e sintoma de
  -- registro salvo nao se altera — os dois triggers da fatia 1 garantem isso
  -- inclusive para service_role. Copia que nao pode divergir nao e segunda
  -- fonte de verdade.
  symptom_id uuid NOT NULL REFERENCES public.symptoms (id) ON DELETE RESTRICT,
  grade      smallint NOT NULL CHECK (grade BETWEEN 0 AND 5),
  -- A #22 em forma de coluna: sintoma registrado pelo acompanhante dispara
  -- alerta normalmente, e o profissional que atende VE A ORIGEM NA TELA — nao
  -- basta estar no log. Copiado de diary_entries.acting_as pelo trigger.
  source_actor_kind public.diary_actor_kind NOT NULL,
  status public.alert_status NOT NULL DEFAULT 'open',
  -- QUEM ASSUMIU: a navegadora. NAO muda na designacao — e o que distingue
  -- quem triou de quem responde agora (ADR-019 §4).
  triaged_by_professional_id uuid REFERENCES public.professionals (id) ON DELETE RESTRICT,
  triaged_at timestamptz,
  -- RESPONSAVEL ATUAL: a navegadora, ou o profissional a quem ela designou.
  assigned_professional_id   uuid REFERENCES public.professionals (id) ON DELETE RESTRICT,
  assigned_at timestamptz,
  conduct_kind  public.alert_conduct_kind,
  conduct_notes text CHECK (conduct_notes IS NULL OR length(btrim(conduct_notes)) > 0),
  conduct_at    timestamptz,
  resolved_at   timestamptz,
  resolved_by_professional_id uuid REFERENCES public.professionals (id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_alerts_symptom_report UNIQUE (symptom_report_id),

  -- Estado e colunas nao podem divergir. Sem estes pares, a fila mostra
  -- "assumido por —" e ninguem sabe se e defeito de tela ou de dado.
  CONSTRAINT ck_alerts_triage
    CHECK ((triaged_by_professional_id IS NULL) = (status = 'open')),
  CONSTRAINT ck_alerts_triage_pair
    CHECK ((triaged_at IS NULL) = (triaged_by_professional_id IS NULL)),
  CONSTRAINT ck_alerts_assignment
    CHECK ((assigned_professional_id IS NULL) = (status = 'open')),
  CONSTRAINT ck_alerts_assignment_pair
    CHECK ((assigned_at IS NULL) = (assigned_professional_id IS NULL)),
  CONSTRAINT ck_alerts_resolution
    CHECK ((resolved_at IS NULL) = (status <> 'resolved')),
  CONSTRAINT ck_alerts_resolution_pair
    CHECK ((resolved_by_professional_id IS NULL) = (resolved_at IS NULL)),
  CONSTRAINT ck_alerts_conduct_pair
    CHECK ((conduct_kind IS NULL) = (conduct_at IS NULL)),
  -- Resolver EXIGE conduta. E o que permite que "alarme falso" seja um desfecho
  -- legivel sem quarto estado — a conduta e onde ele fica escrito (ADR-019 §1).
  CONSTRAINT ck_alerts_resolved_has_conduct
    CHECK (status <> 'resolved' OR conduct_kind IS NOT NULL),
  CONSTRAINT ck_alerts_open_has_no_conduct
    CHECK (status <> 'open' OR conduct_kind IS NULL)
);

COMMENT ON TABLE public.alerts IS
  'Alerta de sintoma critico. SEM coluna de gravidade: critico e condicao de existencia da linha, nao atributo (ADR-019 §2). SEM origin_specialty_id/visibility: herda a excecao declarada do diario (ADR-007 §4).';
COMMENT ON COLUMN public.alerts.triaged_by_professional_id IS
  'Quem ASSUMIU o alerta — a enfermagem navegadora. Congelado por trigger: o fato da triagem sobrevive ao repasse.';
COMMENT ON COLUMN public.alerts.assigned_professional_id IS
  'Responsavel ATUAL. A designacao troca esta coluna; o encadeamento de repasses fica em audit_log, nao numa tabela de atribuicoes (ADR-019 §4).';
COMMENT ON COLUMN public.alerts.grade IS
  'Copia imutavel de diary_symptom_reports.grade. Ver o comentario da coluna no DDL: a origem nao pode mudar, entao a copia nao pode divergir.';

-- A FILA: ordenada por TEMPO DE ESPERA, porque nao existe o que priorizar
-- (ADR-019 §2). Uma fila ordenada por espera e, por construcao, o oposto de
-- uma fila triada — que e o que o nivel COMPLETO contrata.
CREATE INDEX idx_alerts_queue ON public.alerts (status, created_at);

-- "Consulta ao historico de alertas tratados anteriormente", por paciente.
CREATE INDEX idx_alerts_patient ON public.alerts (patient_id, created_at DESC);

-- "Os alertas que designaram a mim".
CREATE INDEX idx_alerts_assigned
  ON public.alerts (assigned_professional_id)
  WHERE status <> 'resolved';

-- O Postgres nao cria indice de FK sozinho.
CREATE INDEX idx_alerts_entry       ON public.alerts (diary_entry_id);
CREATE INDEX idx_alerts_rule        ON public.alerts (alert_rule_id);
CREATE INDEX idx_alerts_symptom     ON public.alerts (symptom_id);
CREATE INDEX idx_alerts_triaged_by  ON public.alerts (triaged_by_professional_id);
CREATE INDEX idx_alerts_resolved_by ON public.alerts (resolved_by_professional_id);


-- ============================================================
-- 4. gemed_outbox — referencia, NUNCA payload
-- ============================================================
--
-- ADR-007 §3: a ADR-005 aplicada ao caminho de SAIDA. Materializar o payload
-- criaria uma segunda copia de sintoma e grau FORA do alcance da rotina de
-- anonimizacao — e congelaria hoje uma forma que so o anexo tecnico (#15)
-- define. O payload e montado no instante do envio.

CREATE TABLE public.gemed_outbox (
  -- bigint identity e nao uuidv7, como audit_log: tabela interna, de volume
  -- alto, que ninguem referencia por FK e que nenhum front-end enumera.
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- CHECK com um valor so, de proposito: modela-se o que tem escrevente. O
  -- resumo do Diario entra como segundo valor no dia em que a rotina agendada
  -- existir — ALTER de CHECK, barato (ADR-007 §2).
  kind      text NOT NULL CHECK (kind IN ('alert')),
  entity_id uuid NOT NULL,
  patient_id uuid NOT NULL REFERENCES public.patients (id) ON DELETE RESTRICT,
  -- Idempotencia por CHAVE DE NEGOCIO, nunca por hash de payload (ADR-004).
  dedup_key text NOT NULL CHECK (length(btrim(dedup_key)) > 0),
  status    public.gemed_outbox_status NOT NULL DEFAULT 'pending',
  attempt_count   smallint NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  -- Sem teto, uma indisponibilidade prolongada do fornecedor vira fila infinita
  -- de retentativas sobre dado de saude.
  give_up_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  -- Mensagem de ERRO do fornecedor, como notification_deliveries. Nao e canal
  -- de conteudo clinico: quem escreve aqui e a Edge Function, e o contrato e
  -- que o texto do provedor entra e o payload nao.
  last_error text,
  sent_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_gemed_outbox_dedup UNIQUE (kind, dedup_key),
  CONSTRAINT ck_gemed_outbox_sent CHECK ((status = 'sent') = (sent_at IS NOT NULL))
);

COMMENT ON TABLE public.gemed_outbox IS
  'Fila de escrita para o Gemed. REFERENCIA (kind, entity_id), nunca payload — a ADR-005 estendida ao caminho de saida (ADR-007 §3). O envio roda em PARALELO ao fluxo interno: indisponibilidade do fornecedor nao bloqueia disparo, fila, assuncao nem resolucao do alerta.';
COMMENT ON COLUMN public.gemed_outbox.last_error IS
  'Erro devolvido pelo fornecedor. Nunca payload, nunca sintoma, nunca grau.';

CREATE INDEX idx_gemed_outbox_due
  ON public.gemed_outbox (next_attempt_at)
  WHERE status = 'pending';
CREATE INDEX idx_gemed_outbox_entity  ON public.gemed_outbox (kind, entity_id);
CREATE INDEX idx_gemed_outbox_patient ON public.gemed_outbox (patient_id);


-- ============================================================
-- 5. Tipo de notificacao da designacao
-- ============================================================
--
-- `critical_alert` ja existe desde create_notifications, e nasceu SEM PRODUTOR
-- de proposito — para que o invariante da ADR-015 §1 fosse testavel antes de
-- haver alerta. A partir desta migration ele tem produtor.
--
-- is_silenceable = false, como o irmao: ser designado a um alerta critico e
-- dever clinico, e a FK composta de notification_preferences torna a linha
-- "desliguei o push de alerta" impossivel para os quatro perfis E para
-- service_role, que ignora RLS mas nao ignora chave estrangeira.

INSERT INTO public.notification_types (code, label, category, is_silenceable, sort_order) VALUES
  ('alert_assigned', 'Alerta designado a você', 'alert', false, 9)
ON CONFLICT (code) DO NOTHING;


-- ============================================================
-- 6. Quem pode triar, e quem pode resolver
-- ============================================================

-- A primeira perna e a de sempre; a segunda e a que faz a DESIGNACAO
-- FUNCIONAR. Sem ela, designar seria entregar o alerta a quem nao pode
-- fecha-lo, e a fila acumularia casos em atendimento eternamente (ADR-019 §5).
--
-- has_permission SEMPRE em AND com is_active_professional(), nunca sozinha: a
-- primeira perna do OR dela concede quando o codigo esta FORA do catalogo, e o
-- dia em que alguem remover a linha por engano, tudo reabre em silencio.
CREATE FUNCTION private.can_triage_alert()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_active_professional()
     AND private.has_permission('alerts.triage');
$$;

COMMENT ON FUNCTION private.can_triage_alert() IS
  'Assumir e designar alerta: a enfermagem navegadora (ADR-017 §1). Nasce SEM CONCESSAO NENHUMA — fail-closed, como alert_rules.';

CREATE FUNCTION private.can_resolve_alert(p_alert_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.is_active_professional()
     AND (
           private.has_permission('alerts.triage')
        OR EXISTS (
             SELECT 1 FROM public.alerts a
              WHERE a.id = p_alert_id
                AND a.assigned_professional_id = private.my_professional_id()
           )
         );
$$;

COMMENT ON FUNCTION private.can_resolve_alert(uuid) IS
  'Resolve quem tria OU quem foi designado (ADR-019 §5). Quem nunca esteve envolvido nao alcanca nem um nem outro.';

-- Quem e notificado tem de ser EXATAMENTE quem pode agir — senao o alerta
-- chega a quem nao pode assumi-lo, ou nao chega a quem pode. Reproduz a
-- semantica invertida de has_permission fora da sessao do usuario: codigo
-- ausente do catalogo => todo profissional ativo; codigo presente => so quem
-- tem concessao vigente.
CREATE FUNCTION private.professionals_with_permission(p_code text)
RETURNS TABLE (professional_id uuid, account_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, a.id
    FROM public.professionals p
    JOIN public.accounts a ON a.id = p.account_id
   WHERE p.is_active
     AND a.is_active
     AND (
           NOT EXISTS (SELECT 1 FROM public.permissions pm WHERE pm.code = p_code)
        OR EXISTS (
             SELECT 1
               FROM public.professional_permissions pp
               JOIN public.permissions pm ON pm.id = pp.permission_id
              WHERE pp.professional_id = p.id
                AND pp.revoked_at IS NULL
                AND pm.code = p_code
           )
         );
$$;

COMMENT ON FUNCTION private.professionals_with_permission(text) IS
  'Destinatarios de notificacao de um alerta, espelhando has_permission fora da sessao. Com alerts.triage sem concessao nenhuma, o disparo nasce SILENCIOSO — que e o mesmo fail-closed de alert_rules, e nao defeito.';


-- ============================================================
-- 7. O gatilho — na transicao draft -> saved
-- ============================================================
--
-- NAO no INSERT de diary_symptom_reports: ficaria disparando alerta de
-- RASCUNHO, contra requisito literal ("rascunho nao dispara alerta e nao entra
-- em estatistica"). Fica na transicao de estado do registro (ADR-007 §6).

CREATE FUNCTION private.raise_alerts_for_diary_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alert     record;
  v_recipient record;
BEGIN
  FOR v_alert IN
    WITH ins AS (
      INSERT INTO public.alerts (
        patient_id, diary_entry_id, symptom_report_id, alert_rule_id,
        symptom_id, grade, source_actor_kind)
      SELECT NEW.patient_id, NEW.id, r.id, ar.id, r.symptom_id, r.grade, NEW.acting_as
        FROM public.diary_symptom_reports r
        JOIN public.alert_rules ar
          ON ar.symptom_id = r.symptom_id
         AND ar.effective_to IS NULL
        WHERE r.diary_entry_id = NEW.id
          AND r.grade >= ar.min_grade
      ON CONFLICT ON CONSTRAINT uq_alerts_symptom_report DO NOTHING
      RETURNING id, patient_id
    )
    SELECT i.id, i.patient_id FROM ins i
  LOOP
    -- "Envio automatico do alerta critico ao Gemed NO MOMENTO DO DISPARO, em
    -- paralelo ao fluxo interno de atendimento."
    INSERT INTO public.gemed_outbox (kind, entity_id, patient_id, dedup_key)
    VALUES ('alert', v_alert.id, v_alert.patient_id, 'alert:' || v_alert.id::text)
    ON CONFLICT ON CONSTRAINT uq_gemed_outbox_dedup DO NOTHING;

    FOR v_recipient IN
      SELECT w.account_id FROM private.professionals_with_permission('alerts.triage') w
    LOOP
      PERFORM private.notify(
        v_recipient.account_id,
        'critical_alert',
        'alert:' || v_alert.id::text,
        'alerts',
        v_alert.id,
        v_alert.patient_id);
    END LOOP;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.raise_alerts_for_diary_entry() IS
  'O caminho quente: diario -> regra -> alerta -> notificacao -> outbox do Gemed. Dispara so na transicao draft->saved. Com alert_rules vazia nao produz nada, e esse e o estado esperado (ADR-007 §1).';

CREATE TRIGGER trg_raise_alerts
AFTER UPDATE ON public.diary_entries
FOR EACH ROW
WHEN (OLD.status = 'draft' AND NEW.status = 'saved')
EXECUTE FUNCTION private.raise_alerts_for_diary_entry();


-- ============================================================
-- 8. Maquina de estados do alerta — em TRIGGER
-- ============================================================
--
-- Em trigger e nao so em RPC porque service_role ignora RLS e nao passa pelas
-- funcoes: a Edge Function de sincronizacao e a rotina agendada tem de obedecer
-- a mesma regra. Testado como postgres, com BYPASSRLS ativo.

CREATE FUNCTION private.enforce_alert_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  -- O que o alerta E nao se reescreve: sem isto, um UPDATE mudaria o paciente,
  -- o sintoma ou a regra que o explica. RLS nao compara OLD com NEW.
  IF NEW.patient_id        IS DISTINCT FROM OLD.patient_id
  OR NEW.diary_entry_id    IS DISTINCT FROM OLD.diary_entry_id
  OR NEW.symptom_report_id IS DISTINCT FROM OLD.symptom_report_id
  OR NEW.alert_rule_id     IS DISTINCT FROM OLD.alert_rule_id
  OR NEW.symptom_id        IS DISTINCT FROM OLD.symptom_id
  OR NEW.grade             IS DISTINCT FROM OLD.grade
  OR NEW.source_actor_kind IS DISTINCT FROM OLD.source_actor_kind THEN
    RAISE EXCEPTION 'origem do alerta % e imutavel', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;

  -- Quem triou NAO muda na designacao. E a assercao que a ADR-019 §4 pede: o
  -- fato da triagem sobrevive ao repasse.
  IF OLD.triaged_by_professional_id IS NOT NULL
     AND NEW.triaged_by_professional_id IS DISTINCT FROM OLD.triaged_by_professional_id THEN
    RAISE EXCEPTION 'triaged_by_professional_id e congelado apos a assuncao'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- A matriz inteira, explicita. O que nao esta aqui nao acontece — inclusive
  -- resolvido -> aberto, que e o unico caminho de volta que alguem tentaria.
  IF NOT (
       (OLD.status = 'open'        AND NEW.status = 'in_progress')
    OR (OLD.status = 'in_progress' AND NEW.status = 'resolved')
  ) THEN
    RAISE EXCEPTION 'transicao invalida em alerts: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_alert_transition
BEFORE UPDATE ON public.alerts
FOR EACH ROW EXECUTE FUNCTION private.enforce_alert_transition();

COMMENT ON FUNCTION private.enforce_alert_transition() IS
  'Maquina de tres estados sem volta. Resolvido e terminal — vale tambem para service_role, que ignora RLS mas nao ignora trigger.';


-- ============================================================
-- 9. RLS
-- ============================================================

ALTER TABLE public.alert_rules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gemed_outbox ENABLE ROW LEVEL SECURITY;

-- --- alert_rules: configuracao da clinica, nao dado de paciente -------------
--
-- Nao paga o pedagio da ADR-008: nao ha titular a quem o acesso pertenca. E o
-- profissional le porque a tela do alerta precisa dizer POR QUE ele disparou.

CREATE POLICY alert_rules_select_professional ON public.alert_rules
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY alert_rules_select_admin ON public.alert_rules
  FOR SELECT TO authenticated
  USING ( (SELECT private.is_active_admin()) );

-- Sem politica de escrita: o ciclo e RPC (set_alert_rule/disable_alert_rule),
-- porque trocar o limiar e encerrar uma vigencia e abrir outra — duas escritas
-- que o front-end poderia fazer pela metade.

-- --- alerts: a equipe le pelo pedagio; o titular NAO le ---------------------
--
-- DECISAO DECLARADA, nao esquecimento: nenhuma fonte descreve tela de alerta
-- no app do paciente, e as telas contratadas sao diario, agenda, orientacoes,
-- chat, notificacoes, perfil e NPS. Mesma familia da ADR-009 §6 (o titular nao
-- le a anotacao da equipe, por default deny DECLARADO). A ausencia esta sob
-- assercao para titular e cuidador; abrir depois e politica aditiva.

CREATE POLICY alerts_select_professional ON public.alerts
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_professional()) );

-- #11: a administracao ve conteudo clinico. Sem recorte por especialidade — o
-- alerta nasce do diario, que nao tem especialidade de origem, e por isso a
-- excecao da psicologia (#23) nao se aplica.
CREATE POLICY alerts_select_admin ON public.alerts
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) );

-- --- gemed_outbox: o indicador "ja foi registrado no Gemed" -----------------
--
-- Sob clinical_reader pelo mesmo motivo de alerts: a linha diz que ESTE
-- paciente teve alerta critico. Legivel direto com `authenticated`, seria
-- enumeracao de paciente com alerta sem deixar rastro — a familia de vazamento
-- por metadado que ja apareceu cinco vezes neste projeto.

CREATE POLICY gemed_outbox_select_professional ON public.gemed_outbox
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_professional()) );

CREATE POLICY gemed_outbox_select_admin ON public.gemed_outbox
  FOR SELECT TO clinical_reader
  USING ( (SELECT private.is_active_admin()) );


-- ============================================================
-- 10. RPCs — o ciclo do alerta
-- ============================================================

-- ASSUNCAO EXCLUSIVA. "Impede atendimento duplicado" e condicao de corrida
-- REAL: dois profissionais clicando ao mesmo tempo. A garantia e o UPDATE
-- CONDICIONAL sobre o estado — checar antes e atualizar depois deixaria a
-- janela aberta entre as duas consultas.
CREATE FUNCTION public.claim_alert(p_alert_id uuid)
RETURNS public.alert_status
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_professional_id uuid;
  v_updated         integer;
BEGIN
  IF NOT private.can_triage_alert() THEN
    RAISE EXCEPTION 'assumir alerta exige a permissao alerts.triage'
      USING ERRCODE = '42501';
  END IF;

  v_professional_id := private.my_professional_id();

  UPDATE public.alerts a
     SET status = 'in_progress',
         triaged_by_professional_id = v_professional_id,
         triaged_at = pg_catalog.now(),
         -- Quem tria vira o responsavel atual; a designacao troca esta coluna
         -- depois, e so ela.
         assigned_professional_id = v_professional_id,
         assigned_at = pg_catalog.now()
   WHERE a.id = p_alert_id
     AND a.status = 'open';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'alerta inexistente ou ja assumido' USING ERRCODE = 'no_data_found';
  END IF;

  RETURN 'in_progress';
END;
$$;

-- A DESIGNACAO e RPC, nao UPDATE direto: troca o responsavel, grava a trilha e
-- dispara a notificacao ao designado — tres escritas que o front-end poderia
-- fazer pela metade. Quem designa precisa de alerts.triage; quem RECEBE, nao
-- (ADR-019 §5).
CREATE FUNCTION public.assign_alert(
  p_alert_id        uuid,
  p_professional_id uuid
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_alert   public.alerts;
  v_account uuid;
BEGIN
  IF NOT private.can_triage_alert() THEN
    RAISE EXCEPTION 'designar alerta exige a permissao alerts.triage'
      USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_alert FROM public.alerts a WHERE a.id = p_alert_id FOR UPDATE;

  IF v_alert.id IS NULL THEN
    RAISE EXCEPTION 'alerta inexistente' USING ERRCODE = 'no_data_found';
  END IF;

  -- Designar so faz sentido depois da avaliacao inicial: "a enfermagem vai ou
  -- encerrar ou designar para o profissional responsavel".
  IF v_alert.status <> 'in_progress' THEN
    RAISE EXCEPTION 'so alerta em atendimento pode ser designado (estado atual: %)',
      v_alert.status USING ERRCODE = 'check_violation';
  END IF;

  SELECT p.account_id INTO v_account
    FROM public.professionals p
    JOIN public.accounts ac ON ac.id = p.account_id
   WHERE p.id = p_professional_id AND p.is_active AND ac.is_active;

  IF v_account IS NULL THEN
    RAISE EXCEPTION 'profissional inexistente ou inativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.alerts a
     SET assigned_professional_id = p_professional_id,
         assigned_at = pg_catalog.now()
   WHERE a.id = p_alert_id;

  -- O designado precisa saber. Chave de dedup por (alerta, designado): repassar
  -- de volta a quem ja recebeu nao produz notificacao nova.
  PERFORM private.notify(
    v_account,
    'alert_assigned',
    'alert:' || p_alert_id::text || ':assigned:' || p_professional_id::text,
    'alerts',
    p_alert_id,
    v_alert.patient_id);
END;
$$;

-- A conduta e ATRIBUTO, e resolver EXIGE registra-la. Alarme falso e resolvido
-- com a conduta dizendo isso — e por isso nao ha quarto estado (ADR-019 §1).
CREATE FUNCTION public.resolve_alert(
  p_alert_id      uuid,
  p_conduct_kind  public.alert_conduct_kind,
  p_conduct_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF NOT private.can_resolve_alert(p_alert_id) THEN
    RAISE EXCEPTION 'resolver alerta exige alerts.triage ou ser o profissional designado'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.alerts a
     SET status = 'resolved',
         conduct_kind  = p_conduct_kind,
         conduct_notes = nullif(btrim(coalesce(p_conduct_notes, '')), ''),
         conduct_at    = pg_catalog.now(),
         resolved_at   = pg_catalog.now(),
         resolved_by_professional_id = private.my_professional_id()
   WHERE a.id = p_alert_id
     AND a.status = 'in_progress';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated = 0 THEN
    RAISE EXCEPTION 'alerta inexistente ou nao esta em atendimento'
      USING ERRCODE = 'no_data_found';
  END IF;
END;
$$;

-- Configuracoes da clinica: o limiar clinico e ato do ADMINISTRADOR. Encerrar a
-- vigencia anterior e abrir a nova no mesmo comando e o que garante que o
-- alerta antigo continue explicavel pela regra da epoca.
CREATE FUNCTION public.set_alert_rule(
  p_symptom_id uuid,
  p_min_grade  smallint
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador ativo configura gatilho de alerta'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.symptoms s WHERE s.id = p_symptom_id AND s.is_active) THEN
    RAISE EXCEPTION 'sintoma inexistente ou inativo' USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.alert_rules ar
     SET effective_to = pg_catalog.now()
   WHERE ar.symptom_id = p_symptom_id
     AND ar.effective_to IS NULL;

  INSERT INTO public.alert_rules (symptom_id, min_grade, created_by_account)
  VALUES (p_symptom_id, p_min_grade, auth.uid())
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE FUNCTION public.disable_alert_rule(p_symptom_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_active_admin() THEN
    RAISE EXCEPTION 'apenas administrador ativo desliga gatilho de alerta'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.alert_rules ar
     SET effective_to = pg_catalog.now()
   WHERE ar.symptom_id = p_symptom_id
     AND ar.effective_to IS NULL;
END;
$$;


-- ============================================================
-- 11. As funcoes read_* — o pedagio da ADR-008
-- ============================================================

-- A FILA. Sem paciente no parametro, de proposito: a fila e unica e atravessa
-- a base — por isso a linha de trilha sai com patient_id NULL e row_count
-- preenchido, que e exatamente o que distingue "abriu a fila" de "varreu a
-- base" (mesma forma de read_patients).
CREATE FUNCTION public.read_alerts(
  p_status public.alert_status DEFAULT NULL,
  p_limit  integer     DEFAULT 50,
  p_before timestamptz DEFAULT NULL
)
RETURNS SETOF public.alerts
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT a.* FROM public.alerts a
     WHERE (p_status IS NULL OR a.status = p_status)
       AND (p_before IS NULL OR a.created_at < p_before)
     -- Tempo de espera, nao prioridade: e o indice idx_alerts_queue.
     ORDER BY a.created_at
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('alerts', NULL, v_count);
END;
$$;

-- "Consulta ao historico de alertas tratados anteriormente", por paciente.
CREATE FUNCTION public.read_patient_alerts(
  p_patient_id uuid,
  p_limit      integer     DEFAULT 50,
  p_before     timestamptz DEFAULT NULL
)
RETURNS SETOF public.alerts
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_count integer;
BEGIN
  RETURN QUERY
    SELECT a.* FROM public.alerts a
     WHERE a.patient_id = p_patient_id
       AND (p_before IS NULL OR a.created_at < p_before)
     ORDER BY a.created_at DESC
     LIMIT LEAST(p_limit, 200);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  PERFORM private.log_clinical_read('alerts', p_patient_id, v_count);
END;
$$;

-- O indicador "ja foi / esta sendo registrado no Gemed", em LOTE: a fila tem
-- N alertas e uma chamada por alerta seria N+1 sobre a tela mais quente do
-- painel. Sem linha em audit_log de proposito — estado de ENTREGA nao e
-- conteudo clinico, e o alerta a que ele se refere ja foi lido sob o pedagio.
-- Mesma isencao de read_notifications (ADR-015 §7).
CREATE FUNCTION public.read_alert_gemed_status(p_alert_ids uuid[])
RETURNS TABLE (alert_id uuid, status public.gemed_outbox_status, sent_at timestamptz)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT o.entity_id, o.status, o.sent_at
    FROM public.gemed_outbox o
   WHERE o.kind = 'alert'
     AND o.entity_id = ANY (p_alert_ids);
$$;


-- ============================================================
-- 12. Trilha de escrita (#12) e updated_at
-- ============================================================

CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('patient_id');
-- Configuracao da clinica: nao ha paciente, mas ha "quem fez o que".
CREATE TRIGGER trg_audit_write AFTER INSERT OR UPDATE OR DELETE ON public.alert_rules
  FOR EACH ROW EXECUTE FUNCTION private.audit_write('-');
-- gemed_outbox NAO tem trilha: e estado de maquina, de volume alto, escrito
-- pela rotina de envio. A trilha existe para acesso humano a dado clinico.

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.alert_rules
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.alerts
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.gemed_outbox
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*) EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 13. Privilegios — SEMPRE no fim
-- ============================================================

-- O leitor auditado le exatamente o que paga pedagio, nem uma tabela a mais.
GRANT SELECT ON public.alerts, public.gemed_outbox TO clinical_reader;
-- alert_rules nao paga pedagio, mas as read_* podem precisar do limiar para
-- explicar o disparo, e a politica TO clinical_reader nao existe: e leitura
-- de configuracao, nao de paciente.
GRANT SELECT ON public.alert_rules TO clinical_reader;

GRANT EXECUTE ON FUNCTION private.can_triage_alert()                TO authenticated, clinical_reader;
GRANT EXECUTE ON FUNCTION private.can_resolve_alert(uuid)           TO authenticated;
GRANT EXECUTE ON FUNCTION private.my_professional_id()              TO clinical_reader;

-- Escrita do alerta so pelas RPCs. DELETE proibido inclusive a service_role
-- (ADR-005): alerta e dado clinico, e a eliminacao passa pela rotina do
-- titular, nao por comando solto.
REVOKE INSERT, UPDATE, DELETE ON public.alerts      FROM authenticated;
REVOKE DELETE                  ON public.alerts      FROM service_role;
REVOKE INSERT, UPDATE, DELETE ON public.alert_rules FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.gemed_outbox FROM authenticated;
-- A fila de envio e da Edge Function: ela marca sending/sent/failed.
GRANT SELECT, UPDATE ON public.gemed_outbox TO service_role;

REVOKE EXECUTE ON FUNCTION private.raise_alerts_for_diary_entry()      FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.enforce_alert_transition()          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.professionals_with_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_triage_alert()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION private.can_resolve_alert(uuid)             FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.claim_alert(uuid)                                        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.assign_alert(uuid, uuid)                                 FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.resolve_alert(uuid, public.alert_conduct_kind, text)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_alert_rule(uuid, smallint)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.disable_alert_rule(uuid)                                 FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.claim_alert(uuid)                                     TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_alert(uuid, uuid)                              TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_alert(uuid, public.alert_conduct_kind, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_alert_rule(uuid, smallint)                        TO authenticated;
GRANT EXECUTE ON FUNCTION public.disable_alert_rule(uuid)                              TO authenticated;

-- As read_* pertencem ao leitor auditado. E isto — e so isto — que faz a RLS de
-- clinical_reader valer dentro delas. Se uma ficasse com dono `postgres`,
-- furaria a RLS em silencio, que e o erro mais caro possivel aqui.
-- CREATE no schema serve so ao instante do ALTER ... OWNER TO, e e devolvido.
GRANT CREATE ON SCHEMA public TO clinical_reader;

ALTER FUNCTION public.read_alerts(public.alert_status, integer, timestamptz) OWNER TO clinical_reader;
ALTER FUNCTION public.read_patient_alerts(uuid, integer, timestamptz)       OWNER TO clinical_reader;
ALTER FUNCTION public.read_alert_gemed_status(uuid[])                       OWNER TO clinical_reader;

REVOKE CREATE ON SCHEMA public FROM clinical_reader;

-- A troca de dono REINTRODUZ a concessao a PUBLIC pelo default privilege do
-- novo dono — por isso o REVOKE das read_* vem DEPOIS do ALTER OWNER, e
-- precisa ser feito COMO clinical_reader: REVOKE so remove concessao de quem
-- executa o comando, e um REVOKE como `postgres` nelas e no-op SILENCIOSO
-- (ADR-016, armadilha nº 4).
--
-- ARMADILHA Nº 6, MEDIDA EM 11/09/2026 — o GRANT tambem precisa vir daqui.
-- Os tres GRANT EXECUTE das read_* viviam FORA deste bloco, como `postgres`.
-- Passa em `db reset` e FALHA em `db push` com 42501 "permission denied for
-- function read_alerts". A causa nao e privilegio de fundo, e a CADEIA DE
-- SET ROLE: no push, `cli_login_postgres` e membro de `postgres` com
-- inherit_option=false, e `postgres` e membro de `clinical_reader` em duas
-- linhas, TAMBEM com inherit_option=false — admin_option e set_option em
-- linhas SEPARADAS. Sob SET ROLE encadeado o direito de administrar objeto
-- alheio nao se propaga, e so o DONO pode conceder sobre ele.
--
-- Por isso o teste local nao pegou: `db reset` conecta DIRETO como `postgres`,
-- sem o SET ROLE intermediario, e ali o GRANT passa. Mesmo SQL, mesmo banco,
-- resultado diferente conforme o caminho de aplicacao — e o push e o caminho
-- que vale. Verificado nos dois ambientes antes desta correcao.
DO $$
DECLARE v_fn record;
BEGIN
  SET LOCAL ROLE clinical_reader;

  FOR v_fn IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_catalog.pg_proc      p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_roles     r ON r.oid = p.proowner
     WHERE n.nspname = 'public'
       AND r.rolname = 'clinical_reader'
  LOOP
    EXECUTE pg_catalog.format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_fn.sig);
  END LOOP;

  -- Concessao nominal, COMO DONO. Escopo restrito as tres desta migration:
  -- um ON ALL aqui alcancaria as read_* das migrations anteriores, que ja
  -- tem a concessao correta, e mascararia engano futuro.
  GRANT EXECUTE ON FUNCTION public.read_alerts(public.alert_status, integer, timestamptz) TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.read_patient_alerts(uuid, integer, timestamptz)        TO authenticated, service_role;
  GRANT EXECUTE ON FUNCTION public.read_alert_gemed_status(uuid[])                        TO authenticated, service_role;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  -- Sem o RESET, o papel vaza para o resto da migration e o primeiro comando
  -- que dependa de uuid_generate_v7 morre por privilegio. Medido.
  RESET ROLE;
  RAISE;
END;
$$;

-- ASSERCAO DE EFEITO, nao de execucao (ADR-016): os GRANT acima estao dentro de
-- um bloco com EXCEPTION, e um bloco que so emitisse NOTICE seria
-- indistinguivel de sucesso no output do push. Aqui o RAISE e incondicional se
-- o privilegio nao existir de fato.
DO $$
DECLARE v_faltando text;
BEGIN
  SELECT string_agg(sig, ', ') INTO v_faltando
    FROM (VALUES
      ('public.read_alerts(public.alert_status, integer, timestamptz)'),
      ('public.read_patient_alerts(uuid, integer, timestamptz)'),
      ('public.read_alert_gemed_status(uuid[])')
    ) AS t(sig)
   WHERE NOT pg_catalog.has_function_privilege('authenticated', sig, 'EXECUTE');

  IF v_faltando IS NOT NULL THEN
    RAISE EXCEPTION
      'authenticated ficou SEM EXECUTE nas read_* de alerta: %. A fila de alertas estaria muda no painel.',
      v_faltando;
  END IF;
END;
$$;

-- O default privilege do supabase_admin reabre tabela nova para `anon` sem que
-- migration nenhuma o alcance (ADR-016). Medido em anon_surface.test.sql.
--
-- COMO DONO, pelo mesmo motivo dos GRANT acima (armadilha nº 6). Aqui a
-- medicao corrigiu uma premissa que o guia do projeto dava como certa:
-- sob `db push` desta CLI (v2.116), `current_user` E `cli_login_postgres`,
-- NAO `postgres`. Nao ha SET ROLE para o dono — e `cli_login_postgres` e
-- membro de `postgres` com inherit_option=false, entao nao herda o direito
-- de revogar sobre tabela alheia. Sondado dentro desta migration em
-- 11/09/2026: dono=postgres, current_user=cli_login_postgres.
--
-- O SET LOCAL ROLE postgres resolve porque set_option=true na associacao: o
-- direito de ASSUMIR o papel existe, so a HERANCA automatica e que nao.
DO $$
BEGIN
  SET LOCAL ROLE postgres;

  REVOKE ALL ON public.alerts       FROM anon;
  REVOKE ALL ON public.alert_rules  FROM anon;
  REVOKE ALL ON public.gemed_outbox FROM anon;

  RESET ROLE;
EXCEPTION WHEN OTHERS THEN
  RESET ROLE;
  RAISE;
END;
$$;

-- ASSERCAO DE EFEITO (ADR-016): mede o privilegio do papel, nunca a execucao
-- dos comandos acima — que seria auto-referente. Os dois lados importam:
-- que `anon` perdeu, e que `authenticated` NAO perdeu junto.
DO $$
DECLARE v_aberto text; v_quebrado text;
BEGIN
  SELECT string_agg(t.tab, ', ') INTO v_aberto
    FROM (VALUES ('public.alerts'), ('public.alert_rules'), ('public.gemed_outbox')) AS t(tab)
   WHERE pg_catalog.has_table_privilege('anon', t.tab, 'SELECT');

  IF v_aberto IS NOT NULL THEN
    RAISE EXCEPTION 'anon AINDA LE tabela de alerta: %. Dado clinico alcancavel sem login.', v_aberto;
  END IF;

  SELECT string_agg(t.tab, ', ') INTO v_quebrado
    FROM (VALUES ('public.alerts'), ('public.alert_rules'), ('public.gemed_outbox')) AS t(tab)
   WHERE NOT pg_catalog.has_table_privilege('authenticated', t.tab, 'SELECT');

  IF v_quebrado IS NOT NULL THEN
    RAISE EXCEPTION 'authenticated PERDEU SELECT junto com anon em: %. A fila de alertas estaria muda.', v_quebrado;
  END IF;
END;
$$;

-- Realtime NAO recebe alerts: o canal entrega linha sob o role `authenticated`,
-- do qual o pedagio tirou o profissional — a equipe receberia dado clinico sem
-- trilha (ADR-011). O tempo real do alerta chega por `notifications`, que ja
-- esta na publication e carrega REFERENCIA, nunca conteudo.
