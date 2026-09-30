-- Fase 5.3 (app #14) e 5.4 (painel G-1): os dois primeiros arquivos do
-- projeto que NAO sao clinicos — a foto de perfil e o logo da clinica.
-- Design e racional: supera-docs/ADRs/ADR-027 — Configuracao da clinica e vocabularios editaveis.md
--
-- Os dois buckets existentes (content-attachments e chat-attachments) derivam
-- quem le de uma LINHA: a politica do bucket consulta a tabela e herda a RLS
-- dela. Aqui nao ha linha a consultar, e a regra e mais simples de proposito:
--
--   * avatars         — privado. A pasta e a conta: `<account_id>/<arquivo>`.
--                       So o dono le e escreve. A comparacao e de TEXTO com o
--                       primeiro segmento do nome, nunca cast do nome para
--                       uuid — um nome fora do padrao explodiria o cast dentro
--                       da politica (o motivo registrado em content-storage).
--   * clinic-branding — PUBLICO para leitura por URL, escrita so da
--                       administracao. E o logo que a tela de entrada mostra
--                       antes do login (ADR-027 §3).
--
-- A EQUIPE NAO VE A FOTO DO PACIENTE, nem o paciente a do profissional:
-- decisao do usuario em 25/09/2026, pela assimetria de custo. Abrir depois e
-- uma politica aditiva; fechar depois de a foto ter circulado nao desfaz a
-- exposicao. O pedido do app (#14) e a foto no proprio perfil.


-- ============================================================
-- 1. Os buckets
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  -- 5 MiB: foto de celular, ja recortada pelo app.
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinic-branding',
  'clinic-branding',
  -- O unico bucket publico do projeto. Publico no Supabase significa: le-se
  -- por /object/public/<caminho> sem token. NAO significa listar — a listagem
  -- passa pelas politicas de storage.objects, e anon nao tem nenhuma.
  true,
  2097152,
  -- Sem SVG, de proposito: SVG carrega script, e este arquivo e servido a
  -- quem nem fez login.
  ARRAY['image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. Politicas do avatar — so o dono
-- ============================================================

CREATE POLICY avatar_objects_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'avatars'
    AND pg_catalog.split_part(name, '/', 1) = (SELECT public.get_my_uid())::text
  );

CREATE POLICY avatar_objects_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND pg_catalog.split_part(name, '/', 1) = (SELECT public.get_my_uid())::text
  );

-- Trocar e apagar a propria foto sao legitimos: ao contrario do anexo do chat,
-- a foto nao e registro clinico que alguem ja viu e usou.
CREATE POLICY avatar_objects_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND pg_catalog.split_part(name, '/', 1) = (SELECT public.get_my_uid())::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND pg_catalog.split_part(name, '/', 1) = (SELECT public.get_my_uid())::text
  );

CREATE POLICY avatar_objects_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND pg_catalog.split_part(name, '/', 1) = (SELECT public.get_my_uid())::text
  );


-- ============================================================
-- 3. Politicas do logo — escrita da administracao
-- ============================================================
--
-- SELECT para o admin tambem: `download()` e `list()` do supabase-js passam
-- pela API autenticada, e nao pela URL publica. O paciente e a tela de entrada
-- usam a URL publica e nao precisam de politica nenhuma.

CREATE POLICY branding_objects_select_admin ON storage.objects
  FOR SELECT TO authenticated
  USING ( bucket_id = 'clinic-branding' AND (SELECT private.is_active_admin()) );

CREATE POLICY branding_objects_insert_admin ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK ( bucket_id = 'clinic-branding' AND (SELECT private.is_active_admin()) );

CREATE POLICY branding_objects_update_admin ON storage.objects
  FOR UPDATE TO authenticated
  USING      ( bucket_id = 'clinic-branding' AND (SELECT private.is_active_admin()) )
  WITH CHECK ( bucket_id = 'clinic-branding' AND (SELECT private.is_active_admin()) );

CREATE POLICY branding_objects_delete_admin ON storage.objects
  FOR DELETE TO authenticated
  USING ( bucket_id = 'clinic-branding' AND (SELECT private.is_active_admin()) );


-- ============================================================
-- 4. accounts.avatar_path
-- ============================================================
--
-- Na CONTA, e nao em patients: todo perfil tem foto (paciente, acompanhante,
-- profissional, administrador), e a conta e o que eles tem em comum.
--
-- O CHECK amarra o caminho a pasta do DONO DA LINHA. Sem ele, a coluna
-- aceitaria o caminho da foto de outra pessoa — inutil para ler, porque a
-- politica do bucket barraria, mas um apontador falso num campo de perfil.
-- NOT VALID + VALIDATE em migration separada, como manda o padrao do projeto
-- para constraint em tabela existente; aqui a coluna e nova e toda nula, e o
-- VALIDATE e instantaneo.

ALTER TABLE public.accounts ADD COLUMN avatar_path text;

ALTER TABLE public.accounts
  ADD CONSTRAINT ck_accounts_avatar_path_own_folder
  CHECK (
    avatar_path IS NULL
    OR (avatar_path LIKE id::text || '/%'
        AND avatar_path !~ '\.\.'
        AND length(avatar_path) <= 200)
  ) NOT VALID;

COMMENT ON COLUMN public.accounts.avatar_path IS
  'Caminho no bucket privado avatars, sempre <account_id>/<arquivo>. So o dono le o arquivo: a equipe ve a coluna e nao ve a foto (ADR-027 §4). Ordem: sobe, depois grava o caminho.';

-- O GRANT e por coluna, e e a defesa: accounts_update_own deixa o dono
-- atualizar a propria linha, e o privilegio diz QUAIS colunas.
GRANT UPDATE (avatar_path) ON public.accounts TO authenticated;


-- ============================================================
-- 5. Asserção de efeito
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatars' AND NOT public) THEN
    RAISE EXCEPTION 'o bucket avatars precisa ser PRIVADO';
  END IF;

  IF EXISTS (SELECT 1 FROM storage.buckets
              WHERE id = 'clinic-branding'
                AND 'image/svg+xml' = ANY (allowed_mime_types)) THEN
    RAISE EXCEPTION 'clinic-branding aceita SVG: script servido sem login';
  END IF;

  -- So estes dois buckets podem ser publicos... e so um deles e.
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE public AND id <> 'clinic-branding') THEN
    RAISE EXCEPTION 'ha bucket publico alem de clinic-branding';
  END IF;

  IF NOT pg_catalog.has_column_privilege('authenticated', 'public.accounts', 'avatar_path', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated sem UPDATE em accounts.avatar_path: ninguem gravaria a foto';
  END IF;

  IF pg_catalog.has_column_privilege('authenticated', 'public.accounts', 'is_active', 'UPDATE') THEN
    RAISE EXCEPTION 'authenticated ganhou UPDATE em accounts.is_active: a conta desligada se religaria';
  END IF;
END;
$$;
