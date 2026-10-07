// Orientações (conteúdo educativo publicado pela equipe): biblioteca,
// categorias, detalhe, lido, favorito e o anexo em PDF.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import type { Database } from '../types/database';
import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import { getContentTypeInfo } from '../utils/resources';
import { PDF_MIME_TYPE } from '../utils/files';
import type {
  ApiSuccessResult,
  ContentType,
  Diagnosis,
  ResourceAttachment,
  ResourceCategory,
  EnrichedResource,
  ResourceFilters,
  ResourceStateInput,
  SetResourceFavoriteInput,
} from '../types';

/**
 * Traduz a falha de uma escrita em `patient_content_states`.
 *
 * Favorito e lido são os únicos dados de paciente deste módulo, e a política
 * exige `patient_id = my_own_patient_id()` — daí a mensagem específica de
 * sessão que não confere.
 */
function describeResourceError(
  error: { code?: string; message?: string },
  fallback: string
): string {
  if (error.code === '42501') {
    return 'Você não tem permissão para essa ação.';
  }

  if (error.message?.includes('row-level security')) {
    return 'Não foi possível salvar: sua sessão não confere com o cadastro. Entre novamente.';
  }

  return fallback;
}

/**
 * Colunas de uma orientação visível ao paciente.
 *
 * Os dois `!inner` não são otimização: `content_versions` só devolve a versão
 * PUBLICADA (a RLS recusa rascunho, revisão e arquivada), então o join
 * interno é o que garante que um item sem versão visível não chegue à tela
 * como card vazio. `patient_content_states` fica de fora do `!inner` de
 * propósito — quem nunca favoritou nem leu não tem linha, e um join interno
 * ali esconderia justamente as orientações novas.
 */
const RESOURCE_SELECT =
  'id, ' +
  'content_categories!inner(code, label, sort_order), ' +
  'content_versions!inner(title, body, media_kind, video_url, estimated_reading_minutes, updated_at, ' +
  'content_attachments(id, storage_path, mime_type, byte_size, created_at)), ' +
  'patient_content_states(is_favorite, read_at)';

/** Linha de `content_items` com os embeds de `RESOURCE_SELECT`. */
interface ResourceRow {
  id: string;
  content_categories: { code: string; label: string; sort_order: number };
  content_versions: {
    title: string;
    body: string;
    media_kind: MediaKind;
    video_url: string | null;
    estimated_reading_minutes: number | null;
    updated_at: string;
    // `content_version_id` é FK de `content_attachments`, não de
    // `content_items` — por isso o embed mora aqui dentro, não no nível
    // de fora. Uma versão pode ter vários anexos (imagens e PDFs).
    content_attachments: AttachmentRow[];
  }[];
  patient_content_states: { is_favorite: boolean; read_at: string | null }[];
}

interface AttachmentRow {
  id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  created_at: string;
}

/** O enum do banco, tal como ele é hoje — o mapa abaixo tem que cobrir todos. */
type MediaKind = Database['public']['Enums']['content_media_kind'];

/** `content_media_kind` (banco) → `ContentType` (UI). */
const MEDIA_KIND_TO_TYPE: Record<MediaKind, ContentType> = {
  text: 'text',
  video: 'video',
  pdf: 'pdf',
};

/** `ContentType` (UI) → `content_media_kind` (banco), para o filtro. */
const TYPE_TO_MEDIA_KIND: Record<ContentType, MediaKind> = {
  text: 'text',
  video: 'video',
  pdf: 'pdf',
};

/**
 * Quebra o corpo em parágrafos.
 *
 * `body` é uma coluna de texto única; a tela renderiza um `<p>` por
 * parágrafo. Divide em qualquer sequência de quebras de linha, o que cobre
 * tanto o texto separado por linha em branco quanto o separado por uma só.
 * O CHECK da coluna garante conteúdo não-vazio, então sempre sobra ao menos
 * um parágrafo.
 */
function splitParagraphs(body: string): string[] {
  return body
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
}

function toAttachment(row: AttachmentRow): ResourceAttachment {
  return {
    id: row.id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
  };
}

/**
 * Separa os anexos em imagens e PDFs, na ordem em que a equipe anexou.
 *
 * Ordenado aqui porque a ordem do embed do PostgREST não é garantida. Tipo
 * fora dos dois grupos não existe hoje (o bucket só aceita PDF, PNG, JPEG e
 * WebP) e, se aparecer, fica de fora em vez de virar um card que não abre.
 */
function splitAttachments(rows: AttachmentRow[]): Pick<EnrichedResource, 'images' | 'documents'> {
  const sorted = [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return {
    images: sorted.filter((row) => row.mime_type.startsWith('image/')).map(toAttachment),
    documents: sorted.filter((row) => row.mime_type === PDF_MIME_TYPE).map(toAttachment),
  };
}

function enrichResource(row: ResourceRow): EnrichedResource {
  // O índice parcial `uq_content_versions_published` garante no máximo uma
  // versão publicada por item, e a RLS não deixa o paciente ver as demais —
  // então este [0] é a versão publicada, não "a primeira de várias".
  const version = row.content_versions[0];
  const state = row.patient_content_states[0];

  const type = MEDIA_KIND_TO_TYPE[version.media_kind] ?? 'text';
  const typeInfo = getContentTypeInfo(type);
  const paragraphs = splitParagraphs(version.body);
  const readingMinutes = version.estimated_reading_minutes;

  return {
    id: row.id,
    category: row.content_categories.label,
    categoryCode: row.content_categories.code,
    title: version.title,
    summary: paragraphs[0] ?? '',
    type,
    readingMinutes,
    videoUrl: version.video_url,
    publishedAt: version.updated_at,
    content: paragraphs,
    isFavorite: state?.is_favorite ?? false,
    isRead: Boolean(state?.read_at),
    ...splitAttachments(version.content_attachments),
    typeLabel: typeInfo.label,
    icon: typeInfo.icon,
    colorVar: typeInfo.colorVar,
    durationLabel: type === 'video' && readingMinutes ? `${readingMinutes}:00` : null,
    publishedLabel: `Publicado em ${new Date(version.updated_at).toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
    })}`,
  };
}

/**
 * Ordena por categoria (a ordem do catálogo) e, dentro dela, do mais recente
 * ao mais antigo.
 *
 * Em memória porque a chave primária da ordenação mora no embed
 * (`content_categories.sort_order`), e ordenação por coluna de tabela
 * referenciada no PostgREST ordena as linhas EMBUTIDAS, não as do pai.
 */
function compareResourceRows(a: ResourceRow, b: ResourceRow): number {
  const categoryOrder = a.content_categories.sort_order - b.content_categories.sort_order;
  if (categoryOrder !== 0) return categoryOrder;

  return (b.content_versions[0]?.updated_at ?? '').localeCompare(
    a.content_versions[0]?.updated_at ?? ''
  );
}

/**
 * Biblioteca de orientações do paciente.
 *
 * ⚠️ Não existe filtro por CID aqui, e isso é deliberado: a elegibilidade
 * (versão publicada E — sem marcação de CID OU marcação que cruza com o
 * diagnóstico) é imposta por `private.is_content_visible_to_me` dentro da
 * política de `content_items`. Refiltrar no cliente seria substituir a RLS
 * por uma segunda verdade, que é exatamente o que não se pode fazer.
 *
 * `category` e `type` vão para o servidor. `favoritesOnly` e `unreadOnly` são
 * aplicados em memória por necessidade: "não lida" é "sem linha em
 * `patient_content_states` OU com `read_at` nulo" — um LEFT JOIN com teste de
 * nulo, que o PostgREST não expressa (filtro em embed sem `!inner` recorta o
 * embed, não o pai; com `!inner` sumiriam justamente os itens sem linha, que
 * são os não lidos). São marcadores do próprio paciente, não fronteira de
 * isolamento, então filtrá-los no cliente não contorna RLS nenhuma.
 */
export async function getResources(
  { category, type, favoritesOnly, unreadOnly, search }: ResourceFilters = {},
  signal?: AbortSignal
): Promise<EnrichedResource[]> {
  const client = requireSupabase();

  let query = client.from('content_items').select(RESOURCE_SELECT);

  if (category) {
    query = query.eq('content_categories.code', category);
  }

  if (type) {
    query = query.eq('content_versions.media_kind', TYPE_TO_MEDIA_KIND[type]);
  }

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar as orientações.', error);
  }

  let list = (data as unknown as ResourceRow[])
    .filter((row) => row.content_versions.length > 0)
    .sort(compareResourceRows)
    .map(enrichResource);

  if (favoritesOnly) list = list.filter((resource) => resource.isFavorite);
  if (unreadOnly) list = list.filter((resource) => !resource.isRead);
  // Em memória, mesmo motivo de `favoritesOnly`/`unreadOnly`: a lista já veio da
  // RLS, e o volume por paciente é pequeno o bastante pra não justificar um
  // `ilike` no servidor a cada tecla digitada. O corpo entra na comparação
  // porque `body` já veio na mesma consulta — procurar pelo assunto e não
  // achar a orientação que fala dele é pior que uma varredura a mais.
  if (search?.trim()) {
    const term = search.trim().toLowerCase();
    list = list.filter(
      (resource) =>
        resource.title.toLowerCase().includes(term) ||
        resource.content.some((paragraph) => paragraph.toLowerCase().includes(term))
    );
  }

  return list;
}

interface LibraryDiagnosisRow {
  cid10: { code: string; label: string } | null;
}

/**
 * Os diagnósticos pelos quais o banco recorta a biblioteca — TODOS, e não só o
 * principal da ficha. A regra é do banco (`private.is_content_visible_to_me`):
 * orientação sem CID marcado vai a todos; com CID, só a quem tem um dos
 * diagnósticos de `private.my_library_cid10_ids()`, que junta todas as linhas
 * de `patient_diagnoses` que a sessão enxerga. A faixa "Filtrado pelo seu
 * diagnóstico" mostra exatamente esta lista; com só o principal, ela escondia
 * os outros diagnósticos que também liberam conteúdo.
 *
 * Sem filtro de paciente: a RLS de `patient_diagnoses` devolve os da própria
 * ficha e, ao acompanhante, os do tutelado só com a ficha clínica
 * compartilhada — o mesmo recorte da função do banco. Principal primeiro, e
 * cada CID uma vez.
 */
export async function getLibraryDiagnoses(): Promise<Diagnosis[]> {
  const { data, error } = await requireSupabase()
    .from('patient_diagnoses')
    .select('cid10(code, label)')
    .order('is_primary', { ascending: false })
    .order('diagnosed_on', { ascending: false });

  if (error) {
    throw appError('Não foi possível carregar seu diagnóstico.', error);
  }

  const byCode = new Map<string, Diagnosis>();
  (data as unknown as LibraryDiagnosisRow[]).forEach(({ cid10 }) => {
    if (cid10 && !byCode.has(cid10.code)) {
      byCode.set(cid10.code, { cid: cid10.code, description: cid10.label });
    }
  });

  return [...byCode.values()];
}

/**
 * Categorias que têm ao menos uma orientação visível a este paciente.
 *
 * Lê a partir de `content_items` (e não do catálogo `content_categories`
 * inteiro) porque o chip só deve existir se levar a algum conteúdo: o
 * catálogo tem categoria de toda especialidade, e a biblioteca de um paciente
 * costuma cobrir poucas.
 */
export async function getResourceCategories(): Promise<ResourceCategory[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('content_items')
    .select('content_categories!inner(code, label, sort_order)');

  if (error) {
    throw appError('Não foi possível carregar as categorias.', error);
  }

  const rows = data as unknown as Pick<ResourceRow, 'content_categories'>[];
  const byCode = new Map<string, ResourceRow['content_categories']>();

  rows.forEach(({ content_categories: category }) => {
    if (!byCode.has(category.code)) byCode.set(category.code, category);
  });

  return [...byCode.values()]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map(({ code, label }) => ({ code, label }));
}

/**
 * Uma orientação específica.
 * @throws {Error} Se não existir ou não for elegível para este paciente.
 */
export async function getResource(id: string): Promise<EnrichedResource> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('content_items')
    .select(RESOURCE_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw appError('Não foi possível carregar a orientação.', error);
  }

  const row = data as unknown as ResourceRow | null;

  if (!row || row.content_versions.length === 0) {
    // Conteúdo inelegível e conteúdo inexistente são a mesma resposta: a RLS
    // devolve vazio nos dois casos, e o app não confirma nem nega existência.
    throw appError('Orientação não encontrada.');
  }

  return enrichResource(row);
}

/**
 * Marca uma orientação como lida.
 *
 * O `upsert` manda só `read_at`: as colunas ausentes do payload não entram no
 * `DO UPDATE SET`, então favoritar continua intacto.
 *
 * ⚠️ Quem chama só deve chamar quando a orientação AINDA não foi lida — o
 * `read_at` registra a primeira leitura e não deve andar para frente a cada
 * reabertura (é o que a coluna guarda de propósito, em vez de um booleano).
 */
export async function markResourceRead({
  patientId,
  resourceId,
}: ResourceStateInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.from('patient_content_states').upsert(
    {
      patient_id: patientId,
      content_item_id: resourceId,
      read_at: new Date().toISOString(),
    },
    { onConflict: 'patient_id,content_item_id' }
  );

  if (error) {
    throw appError(describeResourceError(error, 'Não foi possível marcar como lida.'), error);
  }

  return { success: true };
}

/**
 * Grava o favorito de uma orientação com o estado que a tela pediu.
 *
 * Não lê o valor atual antes de escrever, de propósito: a leitura seguida da
 * negação transformava dois toques rápidos em duas gravações idênticas — as
 * duas liam o mesmo estado antigo, e o banco terminava no oposto do que a
 * estrela mostrava. Quem sabe o estado desejado é a tela, que já o tem em mãos.
 *
 * O `upsert` manda só `is_favorite`: `read_at` não entra no `DO UPDATE SET` e
 * a primeira leitura continua registrada.
 */
export async function setResourceFavorite({
  patientId,
  resourceId,
  favorite,
}: SetResourceFavoriteInput): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.from('patient_content_states').upsert(
    {
      patient_id: patientId,
      content_item_id: resourceId,
      is_favorite: favorite,
    },
    { onConflict: 'patient_id,content_item_id' }
  );

  if (error) {
    throw appError(describeResourceError(error, 'Não foi possível atualizar o favorito.'), error);
  }

  return { success: true };
}

/**
 * Baixa um anexo (PDF ou imagem) de uma orientação do bucket privado
 * `content-attachments`.
 *
 * A política de leitura do objeto espelha a de `content_attachments`
 * (`content_attachment_objects_select`) — mesma regra de elegibilidade que já
 * decide se a orientação aparece na biblioteca, então não há checagem extra
 * a fazer aqui: se o paciente vê o card, ele pode baixar o arquivo.
 *
 * Devolve o `Blob` — quem chama decide se o mostra na tela ou o grava no
 * aparelho (é interação de página, não acesso ao Supabase).
 */
export async function downloadResourceAttachment(storagePath: string, signal?: AbortSignal): Promise<Blob> {
  const client = requireSupabase();

  const { data, error } = await client.storage
    .from('content-attachments')
    .download(storagePath, {}, signal ? { signal } : undefined);

  if (error || !data) {
    throw appError('Não foi possível baixar o arquivo. Tente novamente.', error);
  }

  return data;
}
