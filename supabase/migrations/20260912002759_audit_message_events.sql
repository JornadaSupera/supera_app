-- A mensagem do chat passa a deixar rastro — o rastro, nunca o texto.
-- Design e racional: supera-docs/ADRs/ADR-022 — O que ainda dependia so de nos.md
-- Requisito: supera-docs/Requisitos/Segurança e Dados/Auditoria e trilha de acesso.md
--
-- A DECISAO ANTERIOR ERA DELIBERADA, e metade dela cai aqui. `messages` ficou
-- fora da trilha de escrita por dois argumentos: volume, porque e a tabela de
-- maior escrita do sistema, e o principio de que a trilha e metadado e nunca
-- conteudo. O segundo argumento continua inteiro. O primeiro nao sobrevive ao
-- contra-argumento do dev do painel, e ele esta certo: **o chat e o canal mais
-- usado entre paciente e equipe e e o que menos rastro deixa**. Numa reclamacao
-- sobre o que foi ou nao foi orientado, a trilha hoje nao ajuda em nada —
-- registra que a conversa foi aberta e encerrada, e silencia sobre tudo o que
-- aconteceu no meio.
--
-- A CONTA DE VOLUME, REFEITA COM O ARGUMENTO NA MESA. O receio original media a
-- escrita contra um sistema de mensageria; este nao e um. O contratado e uma
-- clinica — o CEON, em Chapeco —, no nivel MEDIO, com uma equipe de sete
-- especialidades e chat assincrono de acompanhamento, nao de atendimento em
-- tempo real. Uma linha de `audit_log` por mensagem custa um INSERT em tabela
-- append-only com dois indices. Na ordem de grandeza real, isso e ruido; a
-- ordem de grandeza que justificaria o receio nao existe neste contrato. Se um
-- dia existir, a saida e particionar `audit_log` por periodo, que ja esta
-- registrado como decisao adiada, e nao voltar a apagar o rastro do chat.
--
-- O QUE ENTRA NA LINHA: quem escreveu, quando, em qual conversa, de qual
-- paciente. **O corpo da mensagem nao entra**, e nao ha coluna onde ele
-- caberia. E o mesmo limite que ja recusou a previa da conversa, o texto livre
-- do sinal e a previa da notificacao — quarta vez que a familia aparece, e a
-- resposta e a mesma.
--
-- SO INSERT. `messages` tem gatilho de imutabilidade desde que nasceu: UPDATE e
-- DELETE levantam excecao antes de chegar aqui. Um gatilho AFTER UPDATE OR
-- DELETE seria codigo que nunca executa, e codigo inalcancavel numa trilha de
-- auditoria e pior que ausencia: parece cobertura.


CREATE FUNCTION private.audit_message_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE v_patient_id uuid;
BEGIN
  -- SECURITY DEFINER para alcancar a conversa sem depender da RLS de quem
  -- escreve: o paciente enxerga a propria conversa, mas o profissional so a
  -- enxerga sob `clinical_reader`, e a trilha nao pode ficar sem titular
  -- conforme o papel de quem mandou a mensagem.
  SELECT c.patient_id INTO v_patient_id
    FROM public.conversations c
   WHERE c.id = NEW.conversation_id;

  INSERT INTO public.audit_log
    (actor_account_id, action, resource_table, resource_id, patient_id,
     origin, actor_capacity)
  VALUES
    -- `NEW.author_account_id` e nao `auth.uid()`: a mensagem de sistema nasce
    -- dentro de uma RPC chamada por uma pessoa, e atribuir o ato a ela diria
    -- que ela escreveu um texto que o banco escreveu. Para 'system' a autoria
    -- fica nula, que e o que a coluna ja significa.
    (NEW.author_account_id, 'create', 'messages', NEW.id, v_patient_id,
     private.request_origin(), private.actor_capacity());

  RETURN NULL;  -- AFTER trigger: o retorno e ignorado.
END;
$$;

COMMENT ON FUNCTION private.audit_message_write() IS
  'Registra QUE houve mensagem: autor, instante, conversa e paciente. O corpo nao entra, e nao ha coluna onde caberia.';

CREATE TRIGGER trg_audit_write
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION private.audit_message_write();


-- O modulo de auditoria pergunta pela conversa ("o que se trocou neste
-- atendimento?"), e `idx_audit_log_patient` responde pelo titular, nao pelo
-- recurso. Parcial: so a fatia de mensagem usa este recorte.
CREATE INDEX idx_audit_log_message
  ON public.audit_log (resource_id, occurred_at DESC)
  WHERE resource_table = 'messages';


REVOKE EXECUTE ON FUNCTION private.audit_message_write() FROM PUBLIC, anon;


-- ASSERCAO DE EFEITO (ADR-016): o gatilho existe e esta ativo. Um trigger
-- desabilitado nao levanta erro nenhum, e a trilha simplesmente para de
-- crescer — que e indistinguivel de "ninguem conversou".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid = 'public.messages'::regclass
       AND tgname  = 'trg_audit_write'
       AND NOT tgisinternal
       AND tgenabled <> 'D'
  ) THEN
    RAISE EXCEPTION 'trg_audit_write ausente ou desabilitado em messages: o chat voltaria a nao deixar rastro.';
  END IF;
END;
$$;
