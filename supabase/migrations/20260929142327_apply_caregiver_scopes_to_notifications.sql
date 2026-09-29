-- As notificacoes respeitam as areas do acompanhante. Pendencia 32.8, de
-- 28/09/2026 (Fase C2 do plano de 29/09/2026). Decisao na ADR-030 §8.
--
-- A Fase C1 fechou a LEITURA: com o chat desligado, `.from('conversations')`
-- volta vazio para o acompanhante. Mas a notificacao e outro caminho ate o
-- mesmo fato. Sem esta migration, a equipe responde, o acompanhante recebe o
-- push "Nova mensagem da equipe", toca nele e cai numa tela vazia — o push
-- revela o que a politica escondeu. Sao tres pontos, e os tres tem de fechar:
--
--   1. NA CRIACAO   private.notify_patient_audience nao cria a linha para o
--                   acompanhante sem a area do tipo.
--   2. NO ENVIO     private.recipient_still_eligible reavalia a area: o
--                   lembrete criado com a agenda ligada, e desligada depois,
--                   sai como `skipped`, nao como `sent`.
--   3. NA CAIXA     notifications_select_recipient e _update_recipient
--                   escondem do acompanhante a notificacao antiga cuja area
--                   foi desligada. Religar devolve.
--
-- O MAPA TIPO -> AREA mora em notification_types.caregiver_scope, e nao numa
-- lista dentro das funcoes: o produtor, o envio e a politica leem a mesma
-- coluna, e um tipo novo diz, na propria linha, a que area pertence.
--   appointment_scheduled, appointment_changed,
--   appointment_reminder_24h, appointment_reminder_2h   schedule
--   chat_message                                        chat
--   content_published                                   resources
--   demais (equipe, alerta, relatorio)                  NULL — sem recorte
--
-- ORIENTACAO MARCADA POR CID PEDE TAMBEM clinical_record, o mesmo acrescimo da
-- C1 em my_library_cid10_ids: "Nova orientacao: cuidados no cancer de mama"
-- revela o diagnostico. Com so `resources`, o acompanhante e avisado das
-- universais.
--
-- DECISAO DA PERGUNTA #6 DO PLANO (ADR-030 §8): o acompanhante REVOGADO deixa
-- de ver as notificacoes com area. O recorte nao pergunta "voce ainda e
-- acompanhante deste paciente?" para decidir SE aplica; ele exige, para
-- MOSTRAR, vinculo `active` com a area ligada. Quem perdeu o vinculo perde
-- junto a caixa daquele tutelado — o mesmo fail-closed da linha ausente.
-- A alternativa do plano (so recortar enquanto o vinculo existir) faria a
-- notificacao antiga REAPARECER no instante da revogacao.
--
-- QUEM NAO E RECORTADO, e por que o predicado diz isso antes de perguntar a
-- area: o titular (a ficha e dele), a equipe e a administracao (tipos `team`
-- nunca tem area — CHECK abaixo) e notificacao sem paciente. Os tres atalhos
-- sao InitPlan (avaliados uma vez por consulta); a funcao por linha so roda
-- para a caixa do acompanhante.
--
-- O QUE NAO MUDA: export_my_data continua levando TODAS as notificacoes da
-- conta. O pacote do titular dos dados e o registro do que a conta recebeu,
-- nao uma tela; recortar o pacote seria esconder do titular um dado dele.


-- ============================================================
-- 1. notification_types.caregiver_scope
-- ============================================================

ALTER TABLE public.notification_types
  ADD COLUMN caregiver_scope public.caregiver_scope;

COMMENT ON COLUMN public.notification_types.caregiver_scope IS
  'Area do acompanhante que este tipo exige (ADR-030 §8). NULL = sem recorte. Escrita so por migration: guard_notification_type recusa a troca, e o painel edita so rotulo e ordem.';

UPDATE public.notification_types
   SET caregiver_scope = CASE
         WHEN code IN ('appointment_scheduled', 'appointment_changed',
                       'appointment_reminder_24h', 'appointment_reminder_2h') THEN 'schedule'
         WHEN code = 'chat_message'      THEN 'chat'
         WHEN code = 'content_published' THEN 'resources'
       END::public.caregiver_scope
 WHERE code IN ('appointment_scheduled', 'appointment_changed',
                'appointment_reminder_24h', 'appointment_reminder_2h',
                'chat_message', 'content_published');

-- Tipo da equipe com area seria contradicao: o acompanhante nunca o recebe, e
-- o atalho da equipe na politica pressupoe que ele nao tenha. Nasce NOT VALID
-- e valida em migration propria, o padrao da casa para constraint em tabela
-- existente (validate_caregiver_scope_constraint).
ALTER TABLE public.notification_types
  ADD CONSTRAINT ck_notification_types_caregiver_scope
  CHECK (caregiver_scope IS NULL OR audience = 'patient') NOT VALID;

-- O painel edita rotulo e ordem (update_vocabulary_term), e o UPDATE direto
-- esta revogado. A guarda fecha a terceira porta — um UPDATE com privilegio —
-- como ja fazia com is_silenceable: a area de um tipo e regra de sigilo, nao
-- configuracao. Mudar o mapa e migration, e a migration desliga o gatilho de
-- proposito, a vista.
CREATE OR REPLACE FUNCTION private.guard_notification_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_silenceable IS DISTINCT FROM OLD.is_silenceable THEN
    RAISE EXCEPTION 'is_silenceable de % e regra de seguranca clinica, nao configuracao', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.caregiver_scope IS DISTINCT FROM OLD.caregiver_scope THEN
    RAISE EXCEPTION 'caregiver_scope de % e regra de sigilo do acompanhante, nao configuracao', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT NEW.is_silenceable AND NOT NEW.is_active THEN
    RAISE EXCEPTION 'o tipo % e obrigatorio e nao pode ser desligado: desligar o calaria para todos', OLD.code
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;


-- ============================================================
-- 2. O teste da area — por conta, e para a sessao
-- ============================================================
--
-- private.notification_area_allows(conta, paciente, tipo, alvo): a conta, como
-- acompanhante daquele paciente, alcanca a area que o tipo exige? Recebe a
-- conta porque o produtor e o envio rodam SEM sessao (trigger de outra pessoa,
-- service_role na rotina de push): auth.uid() ali e de quem disparou, ou nulo.
-- Tipo sem area -> true: a funcao responde so a pergunta da area; o vinculo
-- e checado por quem chama.
--
-- Mesmo recorte de my_ward_patient_ids_for — conta, perfil, ficha e vinculo
-- ativos, linha da area com enabled —, para um paciente so. Linha ausente nega.
--
-- private.notification_area_allows_me(tipo, paciente, alvo): a mesma pergunta
-- para a sessao, com auth.uid() dentro. E a que entra na politica; a de cima
-- nao e executavel por `authenticated` (perguntaria pela area de terceiros).

CREATE FUNCTION private.notification_area_allows(
  p_account_id   uuid,
  p_patient_id   uuid,
  p_type_id      uuid,
  p_target_table text,
  p_target_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH areas AS (
    SELECT s.scope
      FROM public.patient_caregivers pc
      JOIN public.caregivers c ON c.id = pc.caregiver_id
      JOIN public.accounts   a ON a.id = c.account_id
      JOIN public.patients   p ON p.id = pc.patient_id
      JOIN public.patient_caregiver_scopes s
        ON s.link_id = pc.id
       AND s.enabled
     WHERE c.account_id  = p_account_id
       AND pc.patient_id = p_patient_id
       AND pc.status     = 'active'
       AND a.is_active
       AND c.is_active
       AND p.is_active
  )
  SELECT coalesce((
    SELECT CASE
             WHEN t.caregiver_scope IS NULL THEN true
             ELSE t.caregiver_scope IN (SELECT scope FROM areas)
                  -- orientacao marcada por CID revela o diagnostico
                  AND ( t.caregiver_scope <> 'resources'
                        OR p_target_table IS DISTINCT FROM 'content_items'
                        OR NOT EXISTS (SELECT 1 FROM public.content_cid10 cc
                                        WHERE cc.content_item_id = p_target_id)
                        OR 'clinical_record' IN (SELECT scope FROM areas) )
           END
      FROM public.notification_types t
     WHERE t.id = p_type_id
  ), false);
$$;

COMMENT ON FUNCTION private.notification_area_allows(uuid, uuid, uuid, text, uuid) IS
  'A conta, como acompanhante ativo do paciente, tem ligada a area que o tipo exige (e clinical_record, para orientacao marcada por CID)? Tipo sem area -> true. Para produtor e envio, que rodam sem a sessao do destinatario (ADR-030 §8).';


CREATE FUNCTION private.notification_area_allows_me(
  p_type_id      uuid,
  p_patient_id   uuid,
  p_target_table text,
  p_target_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT private.notification_area_allows(auth.uid(), p_patient_id, p_type_id,
                                          p_target_table, p_target_id);
$$;

COMMENT ON FUNCTION private.notification_area_allows_me(uuid, uuid, text, uuid) IS
  'notification_area_allows para a sessao. Entra nas politicas de notifications, depois dos atalhos do titular e da equipe.';


-- ============================================================
-- 3. Na criacao — o produtor
-- ============================================================
--
-- Mesma assinatura: CREATE OR REPLACE preserva dono e ACL. Muda so o ramo do
-- acompanhante, que ganha a area. O titular continua recebendo tudo.

CREATE OR REPLACE FUNCTION private.notify_patient_audience(
  p_patient_id         uuid,
  p_type_code          text,
  p_dedup_key          text,
  p_target_table       text,
  p_target_id          uuid,
  p_include_caregivers boolean,
  p_give_up_at         timestamptz DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_type_id uuid;
  v_account uuid;
  v_id      uuid;
  v_count   integer := 0;
BEGIN
  -- Tipo aposentado cala o produtor. private.notify levantaria erro, e o erro
  -- abortaria a marcacao do compromisso ou o envio da mensagem.
  SELECT t.id INTO v_type_id
    FROM public.notification_types t
   WHERE t.code = p_type_code AND t.is_active;
  IF v_type_id IS NULL THEN
    RETURN 0;
  END IF;

  FOR v_account IN
    SELECT p.account_id
      FROM public.patients p
      JOIN public.accounts a ON a.id = p.account_id
     WHERE p.id = p_patient_id
       AND p.is_active
       AND a.is_active
    UNION
    SELECT c.account_id
      FROM public.patient_caregivers pc
      JOIN public.caregivers c ON c.id = pc.caregiver_id
      JOIN public.accounts   a ON a.id = c.account_id
      JOIN public.patients   p ON p.id = pc.patient_id
     WHERE p_include_caregivers
       AND pc.patient_id = p_patient_id
       AND pc.status = 'active'
       AND c.is_active
       AND a.is_active
       AND p.is_active
       -- ADR-030 §8: a area do tipo, ligada neste vinculo.
       AND private.notification_area_allows(c.account_id, p_patient_id, v_type_id,
                                            p_target_table, p_target_id)
  LOOP
    v_id := private.notify(v_account, p_type_code, p_dedup_key,
                           p_target_table, p_target_id, p_patient_id);
    IF v_id IS NOT NULL THEN
      v_count := v_count + 1;
      IF p_give_up_at IS NOT NULL THEN
        UPDATE public.notification_deliveries d
           SET give_up_at = p_give_up_at
         WHERE d.notification_id = v_id
           AND d.status = 'pending'
           AND d.give_up_at IS NULL;
      END IF;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION private.notify_patient_audience(uuid, text, text, text, uuid, boolean, timestamptz) IS
  'Notifica o titular e, com p_include_caregivers, o acompanhante ativo que tenha ligada a area do tipo (ADR-030 §8). Alvo restrito passa false. Tipo inativo devolve 0 em vez de erro: o produtor nunca trava o fluxo que o dispara.';


-- ============================================================
-- 4. No envio — a peneira da rotina de push
-- ============================================================
--
-- Mesma assinatura: preserva o EXECUTE de service_role
-- (grant_delivery_helper_to_service_role). A area entra depois de o
-- destinatario ser reconhecido como acompanhante, antes das regras do alvo.

CREATE OR REPLACE FUNCTION private.recipient_still_eligible(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_n          record;
  v_titular    boolean;
  v_staff      boolean;
  v_caregiver  boolean;
  v_visibility public.clinical_visibility;
  v_status     text;
BEGIN
  SELECT n.recipient_account_id, n.patient_id, n.target_table, n.target_id,
         n.type_id, a.is_active AS account_active, t.code AS type_code
    INTO v_n
    FROM public.notifications n
    JOIN public.accounts a           ON a.id = n.recipient_account_id
    JOIN public.notification_types t ON t.id = n.type_id
   WHERE n.id = p_notification_id;

  IF NOT FOUND OR NOT v_n.account_active THEN
    RETURN false;
  END IF;

  IF v_n.patient_id IS NULL THEN
    RETURN true;
  END IF;

  v_titular := EXISTS (SELECT 1 FROM public.patients p
                        WHERE p.id = v_n.patient_id
                          AND p.account_id = v_n.recipient_account_id);
  -- A equipe: o vinculo dela nao e por paciente (resposta #10).
  v_staff := EXISTS (SELECT 1 FROM public.professionals pr
                      WHERE pr.account_id = v_n.recipient_account_id)
          OR EXISTS (SELECT 1 FROM public.admins ad
                      WHERE ad.account_id = v_n.recipient_account_id);
  -- O acompanhante: REAVALIADO agora, nao quando a linha nasceu.
  v_caregiver := NOT v_titular AND NOT v_staff
             AND EXISTS (SELECT 1
                           FROM public.patient_caregivers pc
                           JOIN public.caregivers c ON c.id = pc.caregiver_id
                          WHERE c.account_id = v_n.recipient_account_id
                            AND pc.patient_id = v_n.patient_id
                            AND pc.status = 'active');

  IF NOT (v_titular OR v_staff OR v_caregiver) THEN
    RETURN false;
  END IF;

  -- ADR-030 §8: a area tambem e reavaliada no envio.
  IF v_caregiver
     AND NOT private.notification_area_allows(v_n.recipient_account_id, v_n.patient_id,
                                              v_n.type_id, v_n.target_table, v_n.target_id) THEN
    RETURN false;
  END IF;

  IF v_n.target_table = 'appointments' THEN
    SELECT ap.visibility, s.code INTO v_visibility, v_status
      FROM public.appointments ap
      JOIN public.appointment_statuses s ON s.id = ap.status_id
     WHERE ap.id = v_n.target_id;

    IF v_caregiver AND v_visibility IS DISTINCT FROM 'team' THEN
      RETURN false;
    END IF;
    IF v_n.type_code IN ('appointment_reminder_24h', 'appointment_reminder_2h')
       AND v_status IS DISTINCT FROM 'scheduled' THEN
      RETURN false;
    END IF;

  ELSIF v_n.target_table = 'conversations' AND v_caregiver THEN
    IF NOT EXISTS (SELECT 1 FROM public.conversations c
                    WHERE c.id = v_n.target_id AND c.visibility = 'team') THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

COMMENT ON FUNCTION private.recipient_still_eligible(uuid) IS
  'Reavalia NO ENVIO o vinculo do destinatario, a area do acompanhante (ADR-030 §8) e o alvo: acompanhante revogado ou sem a area, alvo que passou a restrito e lembrete de compromisso que deixou de estar agendado saem como skipped, nunca como sent (ADR-015 §4, ADR-024).';


-- ============================================================
-- 5. Na caixa — as duas politicas do destinatario
-- ============================================================
--
-- A politica e UNICA para os quatro perfis (ADR-015 §5), entao o recorte
-- abre com os atalhos de quem nunca e recortado. Todos sao InitPlan; a funcao
-- por linha so e chamada para linha de paciente alheio, que so o acompanhante
-- tem. ALTER POLICY preserva o papel (authenticated).
--
-- WITH CHECK do UPDATE continua so o destinatario: o USING ja escolheu as
-- linhas alcancaveis, e o GRANT UPDATE por coluna (read_at, archived_at)
-- impede mexer em patient_id ou type_id.

ALTER POLICY notifications_select_recipient ON public.notifications
  USING (
    recipient_account_id = (SELECT public.get_my_uid())
    AND ( patient_id IS NULL
          OR patient_id = (SELECT private.my_own_patient_id())
          OR (SELECT private.is_active_professional())
          OR (SELECT private.is_active_admin())
          OR private.notification_area_allows_me(type_id, patient_id, target_table, target_id) )
  );

ALTER POLICY notifications_update_recipient ON public.notifications
  USING (
    recipient_account_id = (SELECT public.get_my_uid())
    AND ( patient_id IS NULL
          OR patient_id = (SELECT private.my_own_patient_id())
          OR (SELECT private.is_active_professional())
          OR (SELECT private.is_active_admin())
          OR private.notification_area_allows_me(type_id, patient_id, target_table, target_id) )
  );


-- ============================================================
-- 6. Privilegios — SEMPRE no fim
-- ============================================================
--
-- notification_area_allows recebe a conta: so o dono (postgres) a executa, por
-- dentro das funcoes DEFINER acima. notification_area_allows_me entra em
-- politica, e o papel que consulta precisa de EXECUTE.

REVOKE EXECUTE ON FUNCTION private.notification_area_allows(uuid, uuid, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.notification_area_allows_me(uuid, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.notification_area_allows_me(uuid, uuid, text, uuid)
  TO authenticated;


DO $$
DECLARE
  v_role text;
BEGIN
  -- Quem nao pode.
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF pg_catalog.has_function_privilege(v_role,
         'private.notification_area_allows(uuid, uuid, uuid, text, uuid)', 'EXECUTE') THEN
      RAISE EXCEPTION '% alcanca notification_area_allows — perguntaria pela area de terceiros', v_role;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('anon',
       'private.notification_area_allows_me(uuid, uuid, text, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon alcanca notification_area_allows_me';
  END IF;

  -- Quem nao pode perder: sem estes, a caixa de todo mundo morre com 42501.
  IF NOT pg_catalog.has_function_privilege('authenticated',
       'private.notification_area_allows_me(uuid, uuid, text, uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.my_own_patient_id()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.is_active_professional()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'private.is_active_admin()', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('authenticated', 'public.get_my_uid()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sem EXECUTE numa funcao das politicas de notifications';
  END IF;

  -- A rotina de push nao pode parar.
  IF NOT pg_catalog.has_function_privilege('service_role', 'private.recipient_still_eligible(uuid)', 'EXECUTE')
     OR NOT pg_catalog.has_function_privilege('service_role', 'public.claim_notification_deliveries(smallint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role perdeu a peneira de envio — o push pararia';
  END IF;

  -- O mapa: os seis tipos do paciente com area, nenhum da equipe.
  IF (SELECT count(*) FROM public.notification_types WHERE caregiver_scope IS NOT NULL) <> 6 THEN
    RAISE EXCEPTION 'esperava seis tipos com area do acompanhante';
  END IF;
END;
$$;
