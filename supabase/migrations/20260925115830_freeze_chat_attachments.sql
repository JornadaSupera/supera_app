-- Fase 1.4 das pendencias consolidadas (app #3): anexo de chat imutavel
-- depois de enviado.
--
-- O ESTADO ANTERIOR ERA INCOERENTE EM TRES CAMADAS:
--   * a mensagem e imutavel (trigger, vale ate para service_role);
--   * o bucket deixava o autor SOBRESCREVER (UPDATE) e APAGAR (DELETE) o
--     arquivo — o conteudo clinico que a equipe ja viu podia ser trocado por
--     outro sob o mesmo caminho, sem rastro nenhum no banco;
--   * a linha em message_attachments nao tinha politica de DELETE, mas o guia
--     §7 ensinava o front-end a apagar arquivo e linha ("REMOVER"). O fluxo
--     documentado morria no segundo passo e deixava a linha apontando para um
--     arquivo que nao existe mais.
--
-- A DECISAO e alinhar o anexo a mensagem: enviado, fica. "Desfazer um envio
-- errado", que justificava o DELETE em create_chat_attachments, e o mesmo caso
-- da mensagem errada — e a mensagem nunca pode ser apagada. A correcao e
-- mensagem nova.
--
-- O QUE CONTINUA:
--   * INSERT no bucket e da linha, pelo autor, na ordem "registra, depois
--     sobe". Se o upload falhar depois do registro, o autor tenta de novo: o
--     INSERT do objeto continua permitido enquanto o caminho nao existir;
--   * a eliminacao da ADR-005 (service_role) continua podendo apagar arquivo e
--     linha, nessa ordem — o gatilho trg_reject_delete_with_object segue
--     impedindo o orfao.

DROP POLICY chat_attachment_objects_update ON storage.objects;
DROP POLICY chat_attachment_objects_delete ON storage.objects;

-- A linha ja nao tinha politica de DELETE (default deny). O privilegio sai
-- tambem: politica ausente e privilegio concedido e a combinacao que uma
-- politica futura, escrita para outro fim, reabre sem perceber. service_role
-- fica — e ele que executa a eliminacao ao termino (ADR-005).
REVOKE DELETE ON public.message_attachments FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.message_attachments IS
  'Anexo do chat. IMUTAVEL depois de registrado, como a mensagem: sem UPDATE nem DELETE para usuario, e o bucket so aceita INSERT (25/09/2026). So a eliminacao da ADR-005, por service_role, remove arquivo e linha.';


-- ============================================================
-- Asserção de efeito
-- ============================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname LIKE 'chat_attachment_objects_%'
       AND cmd IN ('UPDATE', 'DELETE', 'ALL')
  ) THEN
    RAISE EXCEPTION 'ainda ha politica de UPDATE/DELETE no bucket chat-attachments';
  END IF;

  IF pg_catalog.has_table_privilege('authenticated', 'public.message_attachments', 'DELETE') THEN
    RAISE EXCEPTION 'authenticated ainda tem DELETE em message_attachments';
  END IF;

  -- O outro lado: o envio continua funcionando.
  IF NOT pg_catalog.has_table_privilege('authenticated', 'public.message_attachments', 'INSERT') THEN
    RAISE EXCEPTION 'authenticated perdeu INSERT em message_attachments — ninguem anexaria';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'chat_attachment_objects_insert'
  ) THEN
    RAISE EXCEPTION 'a politica de INSERT do bucket do chat sumiu';
  END IF;
END;
$$;
