-- Agregado Comunicacao — FATIA 2: o anexo do chat.
-- Design e racional: supera-docs/Modelo de Dados/Comunicacao.md
-- Decisao sob teste:  ADR-013 (trilha do anexo clinico no Storage), sobre a
--                     ADR-008 (pedagio) e a ADR-011 (as superficies onde ele
--                     nao alcanca).
-- Medicoes que a fundamentam: supera-docs/Pesquisas/
--                     "Anexo do chat — politica de bucket sob o pedagio"
--
-- O caminho H da ADR-013, em uma linha: a POLITICA e o piso (elegibilidade
-- correta, medida), e o `storage_path` da equipe so se obtem por RPC
-- AUDITADA — a divulgacao do caminho deixa rastro, ainda que o download em si
-- nao passe pelo Postgres.
--
-- O que NAO se faz aqui, e por que:
--   * espelho puro `EXISTS (... FROM message_attachments)` na politica do
--     bucket — medido: deixa TODA a equipe de fora (HTTP 400), porque a
--     subconsulta roda sob `authenticated` e a ADR-008 tirou o profissional
--     desse role. E o padrao da #33, que nao sobrevive ao pedagio.
--   * URL assinada por service_role — medido: contorna a politica INTEIRA e
--     e buscada SEM header de autorizacao. E credencial ao portador, e fica
--     para a evolucao (caminho A), sob Edge Function que registre a emissao.


-- ============================================================
-- 1. message_attachments
-- ============================================================

CREATE TABLE public.message_attachments (
  id         uuid PRIMARY KEY DEFAULT public.uuid_generate_v7(),
  message_id uuid NOT NULL REFERENCES public.messages (id) ON DELETE RESTRICT,

  -- Identico a storage.objects.name. A igualdade e o que permite a politica
  -- do bucket falar da MESMA linha que a RLS da tabela recorta.
  storage_path text NOT NULL UNIQUE,

  mime_type text   NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),

  created_at timestamptz NOT NULL DEFAULT now(),

  -- Convencao, NAO defesa: agrupa por mensagem e torna a limpeza legivel.
  -- A autorizacao esta na secao 3 — nunca no nome do objeto (licao da #33).
  CONSTRAINT ck_message_attachments_path_prefix
    CHECK (storage_path LIKE message_id::text || '/%')
);

COMMENT ON TABLE public.message_attachments IS
  'Anexo de mensagem do chat: imagem (ambos os lados) e arquivo (lado profissional). Conteudo clinico — paga o pedagio da ADR-008 pela RPC read_message_attachments.';
COMMENT ON COLUMN public.message_attachments.storage_path IS
  'Caminho relativo ao bucket chat-attachments, no formato <message_id>/<arquivo>. Para a EQUIPE, so se obtem por read_message_attachments — e essa e a trilha (ADR-013, caminho H).';

-- SEM updated_at: o anexo, como a mensagem que o carrega, nao muda.


-- ============================================================
-- 2. O bucket
-- ============================================================
--
-- PRIVADO. `public = true` serviria dado de saude por URL adivinhavel.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'chat-attachments',
  'chat-attachments',
  false,
  -- 20 MiB, como o bucket editorial. Foto de lesao e resultado de exame
  -- cabem; video nao entra no chat em fonte nenhuma.
  20971520,
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/webp',
    -- Lado profissional: "texto, imagem e anexos".
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 3. As duas funcoes que carregam a regra
-- ============================================================
--
-- SECURITY DEFINER porque a politica do bucket e avaliada sob `authenticated`,
-- e com esse role o profissional nao enxerga conversations nem messages
-- (ADR-008). MEDIDO: dentro da funcao a regra completa vale — a enfermagem
-- recebe 400 no anexo de conversa da psicologia, e a psicologa recebe 200.

CREATE FUNCTION private.can_read_chat_attachment(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.message_attachments a
      JOIN public.messages      m ON m.id = a.message_id
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE a.storage_path = p_name
       AND (
         -- Titular e cuidador: a mesma derivacao de sempre.
         c.patient_id = private.my_own_patient_id()
         OR c.patient_id = ANY (ARRAY(SELECT unnest(private.my_ward_patient_ids())))
         -- Equipe: a matriz da #9, identica a da conversa.
         OR ( private.is_active_professional()
              AND ( c.visibility = 'team'
                    OR c.origin_specialty_id = ANY (ARRAY(SELECT unnest(private.my_specialty_ids()))) ) )
         -- #11 + #23: administracao ve tudo, exceto psicologia.
         OR ( private.is_active_admin() AND c.visibility = 'team' )
       )
  );
$$;

COMMENT ON FUNCTION private.can_read_chat_attachment(text) IS
  'Elegibilidade do arquivo, para a politica do bucket. Espelha a RLS de conversations SEM depender do role de quem consulta — e o que faz o espelho da #33 sobreviver ao pedagio da ADR-008.';

-- Quem anexa: o AUTOR da mensagem, e so enquanto a linha ja existe. E isto
-- que impoe "registra, depois sobe" — sem a linha, nao ha o que autorizar.
CREATE FUNCTION private.can_write_chat_attachment(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.message_attachments a
      JOIN public.messages m ON m.id = a.message_id
     WHERE a.storage_path = p_name
       AND m.author_account_id = auth.uid()
  );
$$;

COMMENT ON FUNCTION private.can_write_chat_attachment(text) IS
  'Sobe/remove o arquivo quem escreveu a mensagem. Exige a linha registrada antes — a ordem "registra, depois sobe" nao e convencao de front-end, e privilegio.';


-- ============================================================
-- 4. RLS da tabela
-- ============================================================

ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;

-- Titular e cuidador leem direto — e por isso o anexo aparece no app em tempo
-- real, como a mensagem (ADR-011 §1).
CREATE POLICY message_attachments_select_via_message ON public.message_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.id = message_id
    )
  );

-- Equipe: gemea com predicado identico, sob o leitor auditado.
CREATE POLICY message_attachments_select_via_message_reader ON public.message_attachments
  FOR SELECT TO clinical_reader
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
       WHERE m.id = message_id
    )
  );

-- Registrar o anexo e do autor da mensagem. A checagem passa por funcao
-- SECURITY DEFINER pelo mesmo motivo da politica de escrita de messages: um
-- EXISTS sobre messages aqui seria sempre falso para o profissional.
CREATE FUNCTION private.can_attach_to_message(p_message_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.messages      m
      JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = p_message_id
       AND m.author_account_id = auth.uid()
       AND c.status = 'open'
  );
$$;

CREATE POLICY message_attachments_insert_author ON public.message_attachments
  FOR INSERT TO authenticated
  WITH CHECK ( private.can_attach_to_message(message_id) );


-- ============================================================
-- 5. Sem orfao: o arquivo sai antes da linha
-- ============================================================
--
-- A funcao da #33 nasceu com o bucket fixo no corpo. Generalizada por
-- TG_ARGV: dois buckets, uma regra. Arquivo que nenhuma linha referencia e
-- invisivel para a rotina de eliminacao (ADR-005) e para o inventario da
-- LGPD — e aqui ele e dado de saude, nao material educativo.

CREATE OR REPLACE FUNCTION private.reject_attachment_delete_with_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- le storage.objects sem depender da RLS do bucket
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.bucket_id = TG_ARGV[0]
       AND o.name = OLD.storage_path
  ) THEN
    RAISE EXCEPTION 'o arquivo % ainda esta no bucket %: remova-o pela Storage API antes de desregistrar o anexo', OLD.storage_path, TG_ARGV[0]
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

-- O gatilho do bucket editorial passa a nomear o bucket que sempre foi o dele.
DROP TRIGGER trg_reject_delete_with_object ON public.content_attachments;
CREATE TRIGGER trg_reject_delete_with_object
BEFORE DELETE ON public.content_attachments
FOR EACH ROW EXECUTE FUNCTION private.reject_attachment_delete_with_object('content-attachments');

CREATE TRIGGER trg_reject_delete_with_object
BEFORE DELETE ON public.message_attachments
FOR EACH ROW EXECUTE FUNCTION private.reject_attachment_delete_with_object('chat-attachments');


-- ============================================================
-- 6. As politicas do bucket
-- ============================================================
--
-- Dois achados de ambiente da #33 valem aqui: `postgres` NAO e dono de
-- storage.objects (ALTER TABLE ... ENABLE RLS falharia com "must be owner"),
-- mas CREATE POLICY passa e a RLS ja vem ligada. E storage.protect_delete()
-- bloqueia DELETE direto nas tabelas do Storage a menos que a Storage API
-- ligue storage.allow_delete_query — sem esse set_config, um teste da politica
-- de DELETE mede o trigger do Supabase, nao a politica.
--
-- Todas presas a bucket_id = 'chat-attachments': este arquivo nao decide nada
-- sobre o bucket editorial.

CREATE POLICY chat_attachment_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND private.can_read_chat_attachment(storage.objects.name)
  );

CREATE POLICY chat_attachment_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND private.can_write_chat_attachment(storage.objects.name)
  );

CREATE POLICY chat_attachment_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND private.can_write_chat_attachment(storage.objects.name)
  )
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND private.can_write_chat_attachment(storage.objects.name)
  );

CREATE POLICY chat_attachment_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'chat-attachments'
    AND private.can_write_chat_attachment(storage.objects.name)
  );


-- ============================================================
-- 7. A trilha — o caminho H da ADR-013
-- ============================================================
--
-- Esta funcao e o UNICO jeito de a equipe descobrir um storage_path. O
-- download em si nao passa pelo Postgres (medido: zero linhas em audit_log em
-- todos os caminhos), entao o que se registra e a DIVULGACAO do caminho.
-- Limitacao declarada: caminho em cache permite rebaixar sem novo rastro. E o
-- que o caminho A (Edge Function) fecharia.

GRANT SELECT ON public.message_attachments TO clinical_reader;
GRANT EXECUTE ON FUNCTION private.can_read_chat_attachment(text) TO clinical_reader;

CREATE FUNCTION public.read_message_attachments(p_conversation_id uuid)
RETURNS SETOF public.message_attachments
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
    SELECT a.*
      FROM public.message_attachments a
      JOIN public.messages m ON m.id = a.message_id
     WHERE m.conversation_id = p_conversation_id
     ORDER BY a.created_at;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT c.patient_id INTO v_patient_id
    FROM public.conversations c WHERE c.id = p_conversation_id;

  PERFORM private.log_clinical_read('message_attachments', v_patient_id, v_count, p_conversation_id);
END;
$$;


-- ============================================================
-- 8. Realtime e indices
-- ============================================================

-- Mesma regra da ADR-011: quem le direto recebe. O anexo chega no app do
-- paciente junto com a mensagem; o painel nao recebe, e isso e a decisao.
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;

CREATE INDEX idx_message_attachments_message ON public.message_attachments (message_id);


-- ============================================================
-- 9. Privilegios — SEMPRE no fim
-- ============================================================

-- O anexo nao se edita. Apagar e possivel (o arquivo sai antes, secao 5),
-- porque desfazer um envio errado e o caso real — e a mensagem, essa, fica.
REVOKE UPDATE ON public.message_attachments FROM authenticated, service_role;

GRANT CREATE ON SCHEMA public TO clinical_reader;
ALTER FUNCTION public.read_message_attachments(uuid) OWNER TO clinical_reader;
REVOKE CREATE ON SCHEMA public FROM clinical_reader;

REVOKE EXECUTE ON FUNCTION private.can_read_chat_attachment(text)  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_write_chat_attachment(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION private.can_attach_to_message(uuid)     FROM PUBLIC;

-- As tres entram em POLITICA avaliada em runtime sob `authenticated`: sem
-- EXECUTE, o GET do objeto e o INSERT da linha morrem com "permission denied
-- for function". Mesma armadilha ja anotada para uuid_generate_v7,
-- get_my_uid, my_professional_id e can_reply_as_professional.
GRANT EXECUTE ON FUNCTION private.can_read_chat_attachment(text)   TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_write_chat_attachment(text)  TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_attach_to_message(uuid)      TO authenticated;

REVOKE EXECUTE ON FUNCTION public.read_message_attachments(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.read_message_attachments(uuid) TO authenticated, service_role;

REVOKE SELECT ON public.message_attachments FROM anon;
