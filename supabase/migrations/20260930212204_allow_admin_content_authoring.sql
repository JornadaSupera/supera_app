-- O administrador escreve orientacao: cria, redige, anexa, marca CID e envia
-- para revisao, como o profissional.
-- Plano das pendencias do painel de 30/09/2026, Fase G, item G.1a (painel #1),
-- decisao D1a (30/09/2026: o administrador escreve em QUALQUER categoria).
-- Design e racional: supera-docs/Modelo de Dados/Conteudo e engajamento.md e
-- ADR-010, emenda de 30/09/2026.
--
-- O QUE FALTAVA. "Cadastro de Conteudo" e MVP do painel administrativo, e o
-- cliente confirmou em 29/09 que a autoria entra nos dois paineis. Mas toda
-- politica de escrita do agregado exigia my_professional_id(), e as colunas de
-- autoria eram NOT NULL para professionals: o administrador era recusado em
-- todas as etapas.
--
-- AS PECAS:
--
--   1. content_items.author_admin_id e content_versions.created_by_admin_id,
--      ao lado das colunas do profissional, que passam a nullable. Um CHECK
--      exige EXATAMENTE UMA autoria por linha (num_nonnulls = 1). E a mesma
--      forma de duas colunas de sempre, o PERFIL e a CONTA: authored_by e
--      created_by continuam NOT NULL e continuam sendo a conta.
--   2. private.my_admin_id(): o id do administrador da sessao, ou NULL. Passa
--      por is_active_admin(), e por isso herda a exigencia de segundo fator
--      (require_admin_mfa) sem repeti-la.
--   3. content_items_insert_admin: politica PROPRIA, porque a regra de
--      categoria e outra. O profissional escreve so na categoria da propria
--      especialidade (#9); o administrador, em qualquer categoria ativa,
--      INCLUSIVE Psicologia. Conteudo educativo nao e dado de paciente
--      (ADR-010): o sigilo da psicologia protege o acompanhamento do paciente,
--      e uma orientacao sobre ansiedade na biblioteca nao revela ninguem.
--   4. A perna do administrador nas politicas de AUTOR, que ja eram por
--      autoria e nao por perfil: atualizar o item, criar e editar versao,
--      marcar CID, registrar anexo e as tres de escrita do bucket.
--
-- O QUE NAO MUDA:
--   * O administrador continua sem escrever no item de outra pessoa, como o
--     profissional: cada um cria versao so no proprio item. A regra e de
--     autoria, e a autoria nao muda (privilegio de coluna, secao 13 de
--     create_content_library).
--   * A leitura: a equipe e a administracao ja liam a biblioteca inteira.
--   * O workflow: a versao do administrador nasce draft e passa pela fila
--     como qualquer outra.
--
-- ESTA MIGRATION NAO SOBE SOZINHA. Sem forbid_self_review, que vem logo
-- depois, o administrador aprovaria o texto que ele mesmo escreveu, e o
-- workflow de publicacao, criterio de aceite do painel, deixaria de existir
-- para o conteudo dele.


-- ============================================================
-- 1. As colunas
-- ============================================================
--
-- FK em ADD CONSTRAINT ... NOT VALID, e nao inline no ADD COLUMN: o padrao
-- do projeto para FK sobre tabela ja existente (Squawk,
-- adding-foreign-key-constraint). O VALIDATE mora em
-- validate_phase_g_constraints.

-- O aviso ban-drop-not-null esta CERTO: um cliente que le a coluna do
-- profissional sem esperar nulo quebra na primeira orientacao do
-- administrador. E o preco da decisao, e o guia avisa os tres front-ends
-- (§5.5). Suprimido na linha, e nao no .squawk.toml, para continuar doendo
-- na proxima migration.
ALTER TABLE public.content_items
  -- squawk-ignore ban-drop-not-null
  ALTER COLUMN author_professional_id DROP NOT NULL,
  ADD COLUMN author_admin_id uuid;

ALTER TABLE public.content_items
  ADD CONSTRAINT content_items_author_admin_id_fkey
  FOREIGN KEY (author_admin_id) REFERENCES public.admins (id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.content_items
  ADD CONSTRAINT ck_content_items_single_author
  CHECK (pg_catalog.num_nonnulls(author_professional_id, author_admin_id) = 1)
  NOT VALID;

ALTER TABLE public.content_versions
  -- squawk-ignore ban-drop-not-null
  ALTER COLUMN created_by_professional_id DROP NOT NULL,
  ADD COLUMN created_by_admin_id uuid;

ALTER TABLE public.content_versions
  ADD CONSTRAINT content_versions_created_by_admin_id_fkey
  FOREIGN KEY (created_by_admin_id) REFERENCES public.admins (id) ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.content_versions
  ADD CONSTRAINT ck_content_versions_single_author
  CHECK (pg_catalog.num_nonnulls(created_by_professional_id, created_by_admin_id) = 1)
  NOT VALID;

COMMENT ON COLUMN public.content_items.author_admin_id IS
  'Perfil de administrador autor (30/09/2026, painel #1). Exatamente uma de author_professional_id e author_admin_id e preenchida (ck_content_items_single_author); authored_by segue sendo a conta.';
COMMENT ON COLUMN public.content_items.author_professional_id IS
  'Perfil de profissional autor. NULL quando quem escreveu foi o administrador (author_admin_id).';
COMMENT ON COLUMN public.content_versions.created_by_admin_id IS
  'Perfil de administrador que criou a versao (30/09/2026, painel #1). Exatamente uma de created_by_professional_id e created_by_admin_id e preenchida; created_by segue sendo a conta, e e ela que forbid_self_review compara.';
COMMENT ON COLUMN public.content_versions.created_by_professional_id IS
  'Perfil de profissional que criou a versao. NULL quando quem criou foi o administrador (created_by_admin_id).';

-- Um indice por FK: panel_reads.test.sql falha nomeando a FK que nascer sem.
-- Parciais, porque a coluna e nula em quase toda linha.
CREATE INDEX idx_content_items_author_admin
  ON public.content_items (author_admin_id)
  WHERE author_admin_id IS NOT NULL;
CREATE INDEX idx_content_versions_created_by_admin
  ON public.content_versions (created_by_admin_id)
  WHERE created_by_admin_id IS NOT NULL;


-- ============================================================
-- 2. O helper
-- ============================================================

CREATE FUNCTION private.my_admin_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ad.id
    FROM public.admins ad
   WHERE ad.account_id = auth.uid()
     AND private.is_active_admin();
$$;

COMMENT ON FUNCTION private.my_admin_id() IS
  'Id do administrador da sessao, ou NULL. Passa por is_active_admin(): conta e papel ativos, papel nao pendente e, com require_admin_mfa ligado, sessao aal2. O par de my_professional_id() para as politicas de autoria do conteudo.';


-- ============================================================
-- 3. content_items
-- ============================================================

-- Qualquer categoria ATIVA (D1a). A categoria desativada continua fechada,
-- como para o profissional.
CREATE POLICY content_items_insert_admin ON public.content_items
  FOR INSERT TO authenticated
  WITH CHECK (
    author_admin_id = (SELECT private.my_admin_id())
    AND author_professional_id IS NULL
    AND authored_by = (SELECT public.get_my_uid())
    AND EXISTS (
      SELECT 1 FROM public.content_categories c
       WHERE c.id = category_id
         AND c.is_active
    )
  );

COMMENT ON POLICY content_items_insert_admin ON public.content_items IS
  'O administrador cria orientacao em qualquer categoria ativa, inclusive Psicologia (D1a, 30/09/2026). A regra "so na propria area" continua valendo para o profissional, em content_items_insert_professional.';

DROP POLICY content_items_update_author ON public.content_items;

CREATE POLICY content_items_update_author ON public.content_items
  FOR UPDATE TO authenticated
  USING (
    author_professional_id = (SELECT private.my_professional_id())
    OR author_admin_id = (SELECT private.my_admin_id())
  )
  WITH CHECK (
    author_professional_id = (SELECT private.my_professional_id())
    OR author_admin_id = (SELECT private.my_admin_id())
  );


-- ============================================================
-- 4. content_versions
-- ============================================================

DROP POLICY content_versions_insert_author ON public.content_versions;

CREATE POLICY content_versions_insert_author ON public.content_versions
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by = (SELECT public.get_my_uid())
    AND (
      ( (SELECT private.is_active_professional())
        AND created_by_professional_id = (SELECT private.my_professional_id())
        AND created_by_admin_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.content_items i
           WHERE i.id = content_item_id
             AND i.author_professional_id = (SELECT private.my_professional_id())
        ) )
      OR
      ( created_by_admin_id = (SELECT private.my_admin_id())
        AND created_by_professional_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.content_items i
           WHERE i.id = content_item_id
             AND i.author_admin_id = (SELECT private.my_admin_id())
        ) )
    )
  );

DROP POLICY content_versions_update_author ON public.content_versions;

CREATE POLICY content_versions_update_author ON public.content_versions
  FOR UPDATE TO authenticated
  USING (
    ( created_by_professional_id = (SELECT private.my_professional_id())
      OR created_by_admin_id = (SELECT private.my_admin_id()) )
    AND status = 'draft'
  )
  WITH CHECK (
    ( created_by_professional_id = (SELECT private.my_professional_id())
      OR created_by_admin_id = (SELECT private.my_admin_id()) )
    AND status IN ('draft', 'in_review')
  );


-- ============================================================
-- 5. Marcacao por CID e anexos
-- ============================================================

DROP POLICY content_cid10_write_author ON public.content_cid10;

CREATE POLICY content_cid10_write_author ON public.content_cid10
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.content_items i
             WHERE i.id = content_item_id
               AND ( i.author_professional_id = (SELECT private.my_professional_id())
                     OR i.author_admin_id = (SELECT private.my_admin_id()) ))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.content_items i
             WHERE i.id = content_item_id
               AND ( i.author_professional_id = (SELECT private.my_professional_id())
                     OR i.author_admin_id = (SELECT private.my_admin_id()) ))
  );

DROP POLICY content_attachments_write_author ON public.content_attachments;

CREATE POLICY content_attachments_write_author ON public.content_attachments
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.content_versions v
             WHERE v.id = content_version_id
               AND ( v.created_by_professional_id = (SELECT private.my_professional_id())
                     OR v.created_by_admin_id = (SELECT private.my_admin_id()) )
               AND v.status = 'draft')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.content_versions v
             WHERE v.id = content_version_id
               AND ( v.created_by_professional_id = (SELECT private.my_professional_id())
                     OR v.created_by_admin_id = (SELECT private.my_admin_id()) )
               AND v.status = 'draft')
  );


-- ============================================================
-- 6. O bucket content-attachments
-- ============================================================
--
-- As tres de escrita ganham a mesma perna. A de leitura nao muda: e o
-- espelho da RLS de content_attachments, e o administrador ja lia a linha.

DROP POLICY content_attachment_objects_insert ON storage.objects;
DROP POLICY content_attachment_objects_update ON storage.objects;
DROP POLICY content_attachment_objects_delete ON storage.objects;

CREATE POLICY content_attachment_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND ( v.created_by_professional_id = (SELECT private.my_professional_id())
               OR v.created_by_admin_id = (SELECT private.my_admin_id()) )
         AND v.status = 'draft'
    )
  );

CREATE POLICY content_attachment_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND ( v.created_by_professional_id = (SELECT private.my_professional_id())
               OR v.created_by_admin_id = (SELECT private.my_admin_id()) )
         AND v.status = 'draft'
    )
  )
  WITH CHECK (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND ( v.created_by_professional_id = (SELECT private.my_professional_id())
               OR v.created_by_admin_id = (SELECT private.my_admin_id()) )
         AND v.status = 'draft'
    )
  );

CREATE POLICY content_attachment_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND ( v.created_by_professional_id = (SELECT private.my_professional_id())
               OR v.created_by_admin_id = (SELECT private.my_admin_id()) )
         AND v.status = 'draft'
    )
  );


-- ============================================================
-- 7. Privilegios — SEMPRE no fim
-- ============================================================
--
-- EXECUTE e exigido em runtime por quem consulta: my_admin_id entra em
-- politica. `FROM PUBLIC, anon` pelas armadilhas 2 e 3 do CLAUDE.md.

REVOKE EXECUTE ON FUNCTION private.my_admin_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION private.my_admin_id() TO authenticated;

DO $$
BEGIN
  IF pg_catalog.has_function_privilege('anon', 'private.my_admin_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon executa private.my_admin_id()';
  END IF;
  IF NOT pg_catalog.has_function_privilege('authenticated', 'private.my_admin_id()', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated sem EXECUTE em private.my_admin_id(): toda politica de conteudo morreria por privilegio';
  END IF;
END;
$$;
