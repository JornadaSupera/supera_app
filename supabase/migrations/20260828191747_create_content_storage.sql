-- Politica do bucket de anexos — a questao #33.
-- Design e racional: supera-docs/Modelo de Dados/Conteudo e engajamento.md
-- Decisao sob teste:  ADR-010 §3 (elegibilidade) estendida ao Storage.
--
-- create_content_library deixou uma lacuna NOMEADA: content_attachments guarda
-- o caminho, mas nenhuma politica de bucket existia — o PDF da orientacao
-- estava protegido apenas pela obscuridade do caminho. Isto fecha a lacuna.
--
-- PRIMEIRA MIGRATION DO PROJETO A TOCAR O SCHEMA `storage`.
--
-- A DECISAO CENTRAL: o caminho NAO carrega a regra; a LINHA carrega.
--
-- O caminho obvio seria codificar a autorizacao no nome do objeto
-- (`<content_version_id>/arquivo.pdf`) e a politica extrair a pasta com
-- `(storage.foldername(name))[1]::uuid`. Recusado por duas razoes:
--   1. O CAST EXPLODE. `name` e texto livre: um objeto com nome fora do
--      padrao faz o `::uuid` levantar erro DENTRO da politica — e o AND do
--      Postgres nao garante curto-circuito, entao nem um `name ~ '...'`
--      antes salva. O erro nao nega o acesso: derruba a query de quem
--      lista o bucket.
--   2. Seria uma SEGUNDA COPIA da regra de elegibilidade. A do banco vive
--      em private.is_content_visible_to_me(); a do caminho viveria aqui, e
--      as duas divergiriam na primeira mudanca.
--
-- A forma adotada casa `storage.objects.name` com
-- `content_attachments.storage_path` e deixa a RLS de content_attachments
-- responder. Dentro da politica, a subconsulta roda SOB A RLS DE QUEM
-- CONSULTA — logo o espelho e exato por construcao, nao por manutencao:
-- quem enxerga a linha do anexo enxerga o arquivo, e ninguem mais.
--
-- CONTRATO DE ORDEM que isto impoe ao front-end: REGISTRA, DEPOIS SOBE.
-- A linha em content_attachments precede o upload — sem ela, nao ha o que
-- espelhar e o INSERT no bucket e negado. O cliente ja conhece nome, tamanho
-- e mime antes de subir, entao nada se perde.


-- ============================================================
-- 1. O bucket
-- ============================================================
--
-- PRIVADO. `public = true` serviria o objeto por URL adivinhavel, sem RLS
-- nenhuma — e o anexo da orientacao e recortado por CID do paciente.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'content-attachments',
  'content-attachments',
  false,
  -- 20 MiB. O anexo e material educativo — PDF de orientacao, imagem
  -- ilustrativa. Video NAO passa por aqui: e embed externo (YouTube/Vimeo),
  -- decisao das fontes registrada em content_versions.video_url.
  20971520,
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- 2. A convencao de caminho — util, e nao e a defesa
-- ============================================================
--
-- `<content_version_id>/<arquivo>`: agrupa os anexos por versao, o que torna
-- a limpeza legivel e mantem aberta a porta para uma politica por caminho no
-- futuro. E CONVENCAO, nao seguranca — a autorizacao esta na secao 4.
--
-- NOT VALID + VALIDATE em migration separada: padrao do projeto para
-- constraint sobre tabela existente (Squawk, constraint-missing-not-valid).
-- Na mesma transacao, o VALIDATE bloquearia leitura — anulando o motivo de
-- ter separado.

ALTER TABLE public.content_attachments
  ADD CONSTRAINT ck_content_attachments_path_prefix
  CHECK (storage_path LIKE content_version_id::text || '/%')
  NOT VALID;

COMMENT ON COLUMN public.content_attachments.storage_path IS
  'Caminho RELATIVO AO BUCKET content-attachments, no formato <content_version_id>/<arquivo> — identico a storage.objects.name. E por esta igualdade que a politica do bucket espelha a RLS da tabela.';


-- ============================================================
-- 3. Sem orfao: o arquivo sai antes da linha
-- ============================================================
--
-- Se a linha pudesse ser apagada com o objeto no bucket, o arquivo ficaria
-- sem nada que o referencie — invisivel para qualquer rotina de eliminacao
-- (ADR-005) e para o inventario da LGPD. Um arquivo que ninguem sabe que
-- existe e exatamente o que nao pode existir num sistema com dado de saude,
-- mesmo sendo material educativo.
--
-- A ordem imposta e a inversa da de criacao, e e a correta: sobe depois de
-- registrar; apaga antes de desregistrar.

CREATE FUNCTION private.reject_attachment_delete_with_object()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER              -- le storage.objects sem depender da RLS do bucket
SET search_path = ''
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM storage.objects o
     WHERE o.bucket_id = 'content-attachments'
       AND o.name = OLD.storage_path
  ) THEN
    RAISE EXCEPTION 'o arquivo % ainda esta no bucket: remova-o pela Storage API antes de desregistrar o anexo', OLD.storage_path
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_reject_delete_with_object
BEFORE DELETE ON public.content_attachments
FOR EACH ROW EXECUTE FUNCTION private.reject_attachment_delete_with_object();

COMMENT ON FUNCTION private.reject_attachment_delete_with_object() IS
  'Impede orfao no bucket. Vale tambem para DELETE em cascata e para service_role — e por isso e trigger, nao politica.';


-- ============================================================
-- 4. As quatro politicas do bucket
-- ============================================================
--
-- Todas presas a bucket_id = 'content-attachments': este arquivo nao decide
-- nada sobre nenhum outro bucket que o projeto venha a ter.

-- ACHADO EMPIRICO: `postgres` NAO e dono de storage.objects (o dono e
-- supabase_storage_admin) e nao e superuser — `ALTER TABLE ... ENABLE ROW
-- LEVEL SECURITY` falha com "must be owner of table objects". CREATE POLICY,
-- por outro lado, PASSA: o Supabase concede esse caminho de proposito, porque
-- e assim que o painel cria politica de bucket.
--
-- Nao ha o que ligar: o Storage ja nasce com RLS ativa em storage.objects.
-- A assercao que prova isso vive no teste, e nao aqui — segunda ocorrencia da
-- regra "decisao de nao escrever DDL tambem se testa".

-- --- leitura: o espelho ---------------------------------------------------
--
-- NENHUM predicado de perfil aqui, de proposito. Paciente elegivel, cuidador,
-- profissional e administrador tem regras diferentes para ver o anexo — e as
-- quatro ja estao escritas nas politicas de content_attachments. Repeti-las
-- seria criar a segunda copia que esta migration existe para evitar.
CREATE POLICY content_attachment_objects_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1 FROM public.content_attachments a
       WHERE a.storage_path = storage.objects.name
    )
  );

-- --- upload ---------------------------------------------------------------
--
-- So o autor da versao, e so enquanto ela e editavel. Repare que aqui o
-- predicado NAO pode ser so o espelho: qualquer profissional enxerga a linha
-- do anexo (politica de staff), entao o espelho puro deixaria um profissional
-- subir arquivo no caminho registrado por outro.
CREATE POLICY content_attachment_objects_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status IN ('draft', 'returned')
    )
  );

-- --- substituicao (upsert da Storage API) ---------------------------------
CREATE POLICY content_attachment_objects_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status IN ('draft', 'returned')
    )
  )
  WITH CHECK (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status IN ('draft', 'returned')
    )
  );

-- --- remocao --------------------------------------------------------------
--
-- Mesmo predicado: o autor tira o arquivo enquanto a versao e rascunho. Uma
-- vez publicada, o anexo e imutavel como o corpo da versao — corrigir e
-- versao nova, a regra que vale para o texto desde a secao 5 de
-- create_content_library.
CREATE POLICY content_attachment_objects_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'content-attachments'
    AND EXISTS (
      SELECT 1
        FROM public.content_attachments a
        JOIN public.content_versions v ON v.id = a.content_version_id
       WHERE a.storage_path = storage.objects.name
         AND v.created_by_professional_id = (SELECT private.my_professional_id())
         AND v.status IN ('draft', 'returned')
    )
  );


-- ============================================================
-- 5. Privilegios — SEMPRE no fim
-- ============================================================

REVOKE EXECUTE ON FUNCTION private.reject_attachment_delete_with_object() FROM PUBLIC;
