-- Os tipos de notificacao ganham acento, publico-alvo e uma categoria nova, e
-- o destinatario passa a ler o tipo das proprias notificacoes mesmo depois de
-- o tipo ser aposentado.
-- Design e racional: supera-docs/ADRs/ADR-028 — Leituras e resumos do painel.md
-- Itens 6.10 (app #11) e 6.12 (app #29) da lista consolidada, e a categoria
-- que o 6.9 (create_report_schedules) precisa.


-- ============================================================
-- 1. Rotulos acentuados (6.10)
-- ============================================================
--
-- O rotulo e o TITULO do push e da caixa (ADR-015 §2), e saiu sem acento no
-- seed de 28/08. O app mantinha uma lista propria so para corrigir isso.
--
-- SO TROCA O QUE AINDA E O TEXTO DO SEED. Desde a Fase 5 o administrador edita
-- rotulo pelo painel (update_vocabulary_term), e um rotulo que ele ja corrigiu
-- — ou reescreveu de outro jeito — nao pode ser sobrescrito por migration. O
-- WHERE compara com o texto original; o que nao casar fica como esta.
UPDATE public.notification_types t
   SET label = v.novo
  FROM (VALUES
    ('appointment_reminder_2h', 'Seu compromisso e em breve', 'Seu compromisso é em breve'),
    ('chat_assigned',           'Conversa atribuida a voce',  'Conversa atribuída a você'),
    ('content_published',       'Nova orientacao disponivel', 'Nova orientação disponível'),
    ('critical_alert',          'Alerta de sintoma critico',  'Alerta de sintoma crítico')
  ) AS v(code, antigo, novo)
 WHERE t.code = v.code
   AND t.label = v.antigo;


-- ============================================================
-- 2. Publico-alvo (6.10)
-- ============================================================
--
-- `patient` — o que o app mostra ao titular e ao acompanhante (a tela de
-- preferencias do app lista estes). `team` — o que so a equipe e a
-- administracao recebem, no painel. E o recorte que o app fazia numa lista
-- propria, e que envelheceria no primeiro tipo novo.
--
-- CHECK e nao tabela nem enum, pela ADR-002: dominio local de dois valores,
-- numa tabela sem dado de paciente, e um terceiro publico e ALTER de CHECK.
-- Nasce NOT VALID e valida em migration propria, o padrao da casa para
-- constraint em tabela existente (validate_notification_type_constraints).
--
-- Sem DEFAULT depois do preenchimento: tipo novo precisa DIZER a quem se
-- destina. Um default "patient" mandaria ao app, em silencio, o proximo tipo da
-- equipe que alguem esquecesse de classificar.
ALTER TABLE public.notification_types ADD COLUMN audience text;

UPDATE public.notification_types
   SET audience = CASE
         WHEN code IN ('chat_assigned', 'critical_alert', 'alert_assigned') THEN 'team'
         ELSE 'patient'
       END;

ALTER TABLE public.notification_types
  ADD CONSTRAINT ck_notification_types_audience
  CHECK (audience IS NOT NULL AND audience IN ('patient', 'team')) NOT VALID;

COMMENT ON COLUMN public.notification_types.audience IS
  'patient = aparece no app (titular e acompanhante); team = so no painel (equipe e administracao). O app filtra por aqui em vez de manter lista propria.';


-- ============================================================
-- 3. A categoria "report" (para o 6.9)
-- ============================================================
--
-- O aviso de relatorio agendado nao e agenda, chat, conteudo nem alerta. O
-- CHECK de 28/08 ja previa isto: "um quinto filtro e ALTER de CHECK numa
-- tabela sem dado de paciente". A constraint antiga sai e a nova entra NOT
-- VALID; as linhas existentes sao todas de categorias que continuam validas.
ALTER TABLE public.notification_types DROP CONSTRAINT notification_types_category_check;

ALTER TABLE public.notification_types
  ADD CONSTRAINT ck_notification_types_category
  CHECK (category IN ('agenda', 'chat', 'content', 'alert', 'report')) NOT VALID;


-- ============================================================
-- 4. O destinatario le o tipo das proprias notificacoes (6.12)
-- ============================================================
--
-- A politica de 28/08 era `USING (is_active)`. Aposentar um tipo pelo painel
-- (Fase 5) fazia sumir o ROTULO das notificacoes que ja estavam na caixa: o
-- embed `notification_types(label, …)` voltava nulo, e a tela mostrava uma
-- notificacao sem titulo. O historico precisa continuar legivel depois que o
-- vocabulario muda — e a regra do projeto inteiro para vocabulario.
--
-- UMA POLITICA, NAO TRES. A Fase 5 tinha somado a do administrador ao lado da
-- original, e esta somaria uma terceira. As tres viram uma so, com as tres
-- pernas em OR. Nao e ganho de desempenho: medido em 25/09/2026, o Postgres ja
-- junta politicas permissivas num OR unico, e o plano e identico (ADR-028 §5).
-- E que aqui a regra de leitura do vocabulario cabe numa frase, e ler tres
-- politicas para reconstrui-la e pior.
--
-- A terceira perna consulta `notifications` sob a RLS de quem chama, que so ve
-- a propria caixa; o predicado repete o destinatario para casar o indice
-- idx_notifications_type (recipient_account_id, type_id, …). Nao ha recursao:
-- a politica de notifications nao olha notification_types.
DROP POLICY notification_types_select_authenticated ON public.notification_types;
DROP POLICY notification_types_select_admin         ON public.notification_types;

CREATE POLICY notification_types_select_authenticated ON public.notification_types
  FOR SELECT TO authenticated
  USING (
    is_active
    OR (SELECT private.is_active_admin())
    OR EXISTS (SELECT 1
                 FROM public.notifications n
                WHERE n.recipient_account_id = (SELECT public.get_my_uid())
                  AND n.type_id = notification_types.id)
  );


-- ============================================================
-- 5. Asserção de efeito
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notification_types WHERE audience IS NULL) THEN
    RAISE EXCEPTION 'tipo de notificacao sem publico-alvo depois do preenchimento';
  END IF;

  IF (SELECT count(*) FROM pg_catalog.pg_policies
       WHERE schemaname = 'public' AND tablename = 'notification_types') <> 1 THEN
    RAISE EXCEPTION 'notification_types deveria ter exatamente uma politica de leitura';
  END IF;

  -- O caminho de escrita continua fechado: a tabela e editada so por RPC.
  IF pg_catalog.has_table_privilege('authenticated', 'public.notification_types', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated ganhou UPDATE em notification_types';
  END IF;
END;
$$;
