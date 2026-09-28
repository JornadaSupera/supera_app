-- Fase 5.2 das pendencias consolidadas (app #28, painel G-2): a mensagem
-- automatica fora do horario de atendimento.
-- Design e racional: supera-docs/ADRs/ADR-027 — Configuracao da clinica e vocabularios editaveis.md
-- Requisito: supera-docs/Requisitos/App do Paciente/Chat com a equipe.md
--
-- O QUE E: quando o paciente ou o acompanhante escreve com a clinica fechada,
-- o banco grava UMA mensagem `system` na conversa com o texto configurado —
-- "em caso de urgencia, procure atendimento 24h ou emergencia". E texto FIXO
-- da clinica. Resposta gerada por IA ou por protocolo e nivel COMPLETO, e
-- nada aqui olha o conteudo da mensagem do paciente.
--
-- UMA POR CONVERSA E POR JANELA. A janela e o periodo fechado corrente, e a
-- chave dela e o instante em que a clinica fechou (`clinic_closed_since`).
-- Tres mensagens na mesma madrugada recebem uma resposta; a primeira da noite
-- seguinte recebe outra. A marca fica em tabela propria, com PK composta, e
-- o INSERT ... ON CONFLICT e o que torna duas mensagens simultaneas uma
-- resposta so — um "ja respondi?" por SELECT perderia a corrida.
--
-- DESLIGA-SE SOZINHA em dois casos, e os dois sao o estado de fabrica: sem
-- texto configurado (D.12 ainda aberta) e sem horario cadastrado. Nenhuma das
-- duas coisas foi semeada: texto sobre urgencia em nome da equipe e decisao
-- da clinica.
--
-- NAO NOTIFICA. O produtor do chat (Fase 2.2) so dispara para autor
-- `professional`, e a mensagem `system` passa ao largo dele. Quem acabou de
-- escrever esta com o app aberto e ve a resposta chegar pelo Realtime.


-- ============================================================
-- 1. A marca da janela
-- ============================================================
--
-- Em `private`, e nao em `public`: ninguem le esta tabela alem do gatilho.
-- Nao e dado de paciente — e o registro de que o banco ja respondeu aquela
-- conversa naquele fechamento. CASCADE para a conversa: a eliminacao da
-- ADR-005 nao pode tropecar num carimbo tecnico.

CREATE TABLE private.chat_off_hours_replies (
  conversation_id uuid NOT NULL REFERENCES public.conversations (id) ON DELETE CASCADE,
  closed_since    timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, closed_since)
);

COMMENT ON TABLE private.chat_off_hours_replies IS
  'Uma linha por (conversa, fechamento) em que a resposta automatica ja saiu. A PK e a deduplicacao; so o gatilho escreve.';

ALTER TABLE private.chat_off_hours_replies ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 2. O gatilho
-- ============================================================

CREATE FUNCTION private.reply_off_hours()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- escreve mensagem `system`, que politica nenhuma aceita
SET search_path = ''
AS $$
DECLARE
  v_text  text;
  v_since timestamptz;
  v_novas integer;
BEGIN
  SELECT s.off_hours_message INTO v_text FROM public.clinic_settings s WHERE s.id = 1;
  IF v_text IS NULL THEN
    RETURN NULL;
  END IF;

  v_since := private.clinic_closed_since(NEW.created_at);
  IF v_since IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO private.chat_off_hours_replies (conversation_id, closed_since)
  VALUES (NEW.conversation_id, v_since)
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_novas = ROW_COUNT;
  IF v_novas = 0 THEN
    RETURN NULL;              -- esta janela ja teve resposta nesta conversa
  END IF;

  -- clock_timestamp e nao now(): dentro da transacao now() e o instante da
  -- mensagem do paciente, e a resposta empataria com ela na ordenacao da
  -- tela. A resposta vem depois da pergunta.
  INSERT INTO public.messages (conversation_id, author_kind, body, created_at)
  VALUES (NEW.conversation_id, 'system', v_text, pg_catalog.clock_timestamp());

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION private.reply_off_hours() IS
  'Grava UMA mensagem system com o texto de clinic_settings.off_hours_message quando paciente ou acompanhante escreve com a clinica fechada. Deduplica por (conversa, inicio do fechamento).';

CREATE TRIGGER trg_reply_off_hours
AFTER INSERT ON public.messages
FOR EACH ROW
WHEN (NEW.author_kind IN ('patient', 'caregiver'))
EXECUTE FUNCTION private.reply_off_hours();


-- ============================================================
-- 3. A ordenacao da conversa nao anda para tras
-- ============================================================
--
-- Os gatilhos AFTER da mesma linha disparam em ordem alfabetica, e o INSERT
-- da resposta, feito de dentro de trg_reply_off_hours, dispara os DELE antes
-- de o trg_touch_conversation da mensagem do paciente rodar. Medido: sem
-- esta correcao, `last_message_at` terminava no instante da mensagem do
-- paciente, anterior a resposta que ja estava gravada. GREATEST torna o
-- carimbo indiferente a ordem de chegada.

CREATE OR REPLACE FUNCTION private.touch_conversation_on_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- escreve em conversations, que o usuario nao atualiza
SET search_path = ''
AS $$
BEGIN
  UPDATE public.conversations c
     SET last_message_at   = GREATEST(c.last_message_at, NEW.created_at),
         team_last_read_at = CASE
           WHEN NEW.author_kind IN ('patient', 'caregiver') THEN NULL
           ELSE c.team_last_read_at
         END
   WHERE c.id = NEW.conversation_id;
  RETURN NULL;
END;
$$;


-- ============================================================
-- 4. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE ALL ON private.chat_off_hours_replies FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION private.reply_off_hours() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  IF pg_catalog.has_table_privilege('authenticated', 'private.chat_off_hours_replies', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated ESCREVE a marca da resposta automatica: o paciente poderia silenciar a mensagem de urgencia da propria conversa';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.messages'::regclass
       AND tgname = 'trg_reply_off_hours'
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'trg_reply_off_hours ausente ou desabilitado em messages';
  END IF;
END;
$$;
