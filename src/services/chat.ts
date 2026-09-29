// Chat com a equipe: assuntos, conversas, mensagens, imagens e o Realtime.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { AppError, appError } from '../lib/appError';
import { randomUuid } from '../utils/randomId';
import { requireSupabase, supabase } from './supabaseClient';
import { formatRelativeTime } from '../utils/date';
import { PDF_MIME_TYPE, getFileExtension } from '../utils/files';
import { getSubjectInfo, IMAGE_WITHOUT_CAPTION_TEXT } from '../utils/chat';
import type {
  ApiSuccessResult,
  ConversationSummary,
  MessageAuthor,
  MessageAttachment,
  EnrichedMessage,
  ConversationHeader,
  MessagesPage,
  ChatSubjectOption,
  UnreadConversationsSummary,
  SendMessageResult,
  PendingChatAttachment,
  SendImageResult,
  StartConversationInput,
  StartConversationResult,
} from '../types';

/**
 * Traduz a falha de uma escrita do chat.
 *
 * A recusa mais provável não é falta de permissão genérica: é conversa
 * `resolved`. A política de INSERT exige `status = 'open'`, então tentar
 * responder numa conversa encerrada volta como violação de RLS — e o texto
 * precisa dizer o que aconteceu, senão o paciente reescreve a mensagem
 * achando que foi falha de rede.
 */
function describeChatError(error: { code?: string; message?: string }, fallback: string): string {
  if (error.code === '42501') {
    return 'Você não tem permissão para essa ação.';
  }

  if (error.code === '23503') {
    return 'Esse assunto não está mais disponível. Escolha outro para iniciar a conversa.';
  }

  if (error.message?.includes('row-level security')) {
    return 'Esta conversa foi encerrada pela equipe. Inicie uma nova conversa para continuar.';
  }

  return fallback;
}

/**
 * Colunas de uma conversa na lista — a prévia, nunca o histórico.
 *
 * `conversations` **não guarda prévia nem contador de não lidas** — é decisão
 * declarada do banco (prévia numa tabela de metadado seria conteúdo clínico
 * fora do pedágio de auditoria). A prévia é a última mensagem, embutida com
 * `order` + `limit 1` no próprio embed (ver `getConversations`); as não lidas
 * saem por contagem, sem trazer linha nenhuma (`countUnreadFromPreview`).
 * Antes o embed trazia todas as mensagens de todas as conversas a cada
 * abertura da lista.
 *
 * `conversation_read_marks` é embed sem `!inner`: quem nunca abriu a conversa
 * não tem marca, e é justamente esse caso que conta tudo como não lido. A
 * política só devolve a marca da própria conta.
 */
const CONVERSATION_SELECT =
  'id, status, last_message_at, ' +
  'conversation_subjects(code, label), ' +
  'specialties(label), ' +
  'conversation_read_marks(last_read_at), ' +
  'messages(body, author_account_id, created_at, message_attachments(id))';

/** O mínimo para saber se uma conversa tem mensagem por ler — o indicador da Home. */
const UNREAD_PROBE_SELECT =
  'id, conversation_read_marks(last_read_at), messages(author_account_id, created_at)';

/** Cabeçalho de uma conversa — tudo, exceto as mensagens (ver `getConversationMessages`). */
const CONVERSATION_HEADER_SELECT =
  'id, status, team_last_read_at, ' +
  'conversation_subjects(code, label), ' +
  'specialties(label), ' +
  'conversation_read_marks(last_read_at)';

/** Página de mensagens, sem embutir a conversa inteira — ver `getConversationMessages`. */
const MESSAGE_SELECT =
  'id, body, author_kind, author_account_id, created_at, ' +
  'message_attachments(id, storage_path, mime_type, byte_size)';

/** Mensagens por página — teto que evita carregar o histórico inteiro de uma vez. */
const MESSAGES_PAGE_SIZE = 30;

interface MessageAttachmentRow {
  id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
}

interface ConversationMessageRow {
  id: string;
  body: string;
  author_kind: string;
  author_account_id: string | null;
  created_at: string;
  // Ausente no retorno de um `.insert().select()` de mensagem de texto (não
  // se pede o embed ali) — sempre presente vindo de `MESSAGE_SELECT`.
  message_attachments?: MessageAttachmentRow[];
}

/** O que a prévia e a contagem de não lidas precisam da última mensagem. */
interface LastMessageRow {
  author_account_id: string | null;
  created_at: string;
}

/** O que `UNREAD_PROBE_SELECT` devolve — e o mínimo de `countUnreadFromPreview`. */
interface UnreadProbeRow {
  id: string;
  conversation_read_marks: { last_read_at: string }[];
  /** Só a última mensagem (`limit 1` no embed); vazio numa conversa sem mensagem. */
  messages: LastMessageRow[];
}

interface ConversationRow extends UnreadProbeRow {
  status: string;
  last_message_at: string;
  conversation_subjects: { code: string; label: string };
  /** `null` enquanto a conversa não é roteada — que é o estado de toda conversa nova. */
  specialties: { label: string } | null;
  messages: (LastMessageRow & { body: string; message_attachments: { id: string }[] })[];
}

/** O que `CONVERSATION_HEADER_SELECT` pede. */
interface ConversationHeaderRow {
  id: string;
  status: string;
  team_last_read_at: string | null;
  conversation_subjects: { code: string; label: string };
  specialties: { label: string } | null;
  conversation_read_marks: { last_read_at: string }[];
}

/** `message_author_kind` (banco) → `MessageAuthor` (UI). */
const AUTHOR_KIND_TO_AUTHOR: Record<string, MessageAuthor> = {
  patient: 'patient',
  caregiver: 'caregiver',
  professional: 'professional',
  system: 'system',
};

/** Uma mensagem carrega no máximo um anexo hoje — o primeiro (e único) que existir. */
function firstAttachment(attachmentRows: MessageAttachmentRow[] | undefined): MessageAttachment | null {
  const attachmentRow = attachmentRows?.[0];
  if (!attachmentRow) return null;

  return {
    id: attachmentRow.id,
    storagePath: attachmentRow.storage_path,
    mimeType: attachmentRow.mime_type,
    byteSize: attachmentRow.byte_size,
  };
}

function enrichMessage(row: ConversationMessageRow): EnrichedMessage {
  const author = AUTHOR_KIND_TO_AUTHOR[row.author_kind] ?? 'system';
  const date = new Date(row.created_at);

  // O "Enviada/Lida" não é montado aqui: depende de `team_last_read_at`, que
  // muda sem a mensagem mudar, e sai na tela (`getDeliveryStatus`).
  return {
    id: row.id,
    author,
    authorAccountId: row.author_account_id,
    text: row.body,
    createdAt: row.created_at,
    attachment: firstAttachment(row.message_attachments),
    date,
    timeLabel: date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  };
}

/**
 * A última mensagem pede contagem de não lidas? Só quando é de outra pessoa
 * (inclusive de sistema, que não tem conta) e chegou depois da marca de
 * leitura desta conta — ou quando não há marca.
 *
 * Quando a última é minha, a conversa conta como lida: para escrever, a
 * pessoa abriu a conversa, e abrir com mensagem nova já marca como lida. Assim
 * só vai ao banco a conversa com mensagem nova de verdade.
 */
function hasUnreadAfter(
  lastMessage: LastMessageRow | undefined,
  readMark: string | null,
  myAccountId: string | null
): boolean {
  if (!lastMessage) return false;
  if (myAccountId !== null && lastMessage.author_account_id === myAccountId) return false;

  return !readMark || new Date(lastMessage.created_at).getTime() > new Date(readMark).getTime();
}

/**
 * Não lidas de uma conversa a partir da prévia: sem mensagem nova de outra
 * pessoa, zero sem ir ao banco; com, a contagem exata. Se a contagem falhar,
 * fica 1 — a prévia já provou que há pelo menos uma.
 */
async function countUnreadFromPreview(
  client: SupabaseClient<Database>,
  row: UnreadProbeRow,
  myAccountId: string | null,
  signal?: AbortSignal
): Promise<number> {
  const readMark = row.conversation_read_marks[0]?.last_read_at ?? null;
  if (!hasUnreadAfter(row.messages[0], readMark, myAccountId)) return 0;

  const count = await countConversationUnread(client, row.id, myAccountId, readMark, signal);
  return count ?? 1;
}

/**
 * Minutos decorridos desde um instante ISO.
 *
 * `formatRelativeTime` recebe "minutos atrás" como número, e o banco guarda o
 * instante — esta conversão é a ponte, e evita duplicar a formatação de tempo
 * relativo só por causa do formato de entrada.
 */
function minutesSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

function enrichConversationSummary(row: ConversationRow, unreadCount: number): ConversationSummary {
  const subject = row.conversation_subjects;
  // A única mensagem embutida é a última (`limit 1` em `getConversations`).
  const latest = row.messages[0];

  return {
    id: row.id,
    // Não há coluna de título: a conversa é identificada pelo assunto.
    title: subject.label,
    specialty: row.specialties?.label ?? null,
    subjectCode: subject.code,
    subjectInfo: getSubjectInfo(subject.code),
    lastMessage: latest?.body ?? '',
    lastMessageHasAttachment: Boolean(latest?.message_attachments.length),
    timeLabel: formatRelativeTime(minutesSince(row.last_message_at)),
    lastActivityAt: row.last_message_at,
    unreadCount,
    isOpen: row.status === 'open',
  };
}

/** Id da conta na sessão, ou `null` fora de sessão. */
async function getMyAccountId(): Promise<string | null> {
  const client = requireSupabase();
  const {
    data: { session },
  } = await client.auth.getSession();

  return session?.user.id ?? null;
}

/**
 * Assuntos disponíveis para abrir uma conversa.
 *
 * Vem do catálogo (`conversation_subjects`) e não de uma constante do front
 * porque `start_conversation` recebe o **UUID** do assunto — o código sozinho
 * não abre conversa. `is_active` já é filtrado pela própria política.
 */
export async function getConversationSubjects(): Promise<ChatSubjectOption[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('conversation_subjects')
    .select('id, code, label, sort_order')
    .order('sort_order');

  if (error) {
    throw appError('Não foi possível carregar os assuntos.', error);
  }

  return (data as { id: string; code: string; label: string }[]).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    info: getSubjectInfo(row.code),
  }));
}

/**
 * Conversas do paciente, da mais recente à mais antiga, cada uma com a
 * última mensagem como prévia.
 *
 * Sem filtro por paciente na query: a política de `conversations` já limita à
 * própria linha, e repetir o filtro aqui só criaria uma segunda verdade.
 */
export async function getConversations(signal?: AbortSignal): Promise<ConversationSummary[]> {
  const client = requireSupabase();
  const myAccountId = await getMyAccountId();

  let query = client
    .from('conversations')
    .select(CONVERSATION_SELECT)
    .order('last_message_at', { ascending: false })
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' });

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar suas conversas.', error);
  }

  const rows = data as unknown as ConversationRow[];
  const unreadCounts = await Promise.all(
    rows.map((row) => countUnreadFromPreview(client, row, myAccountId, signal))
  );

  return rows.map((row, index) => enrichConversationSummary(row, unreadCounts[index]));
}

/**
 * Conta as mensagens não lidas de UMA conversa sem trazer linha nenhuma — só
 * a contagem (`head: true`). Mensagem de quem não é eu (inclusive de sistema,
 * que não tem autor) depois da marca d'água, ou qualquer uma, se nunca leu.
 *
 * Compara por conta, e não por tipo de autor: numa conversa em que o
 * acompanhante também escreve, a mensagem dele é "de outra pessoa" para o
 * paciente — e vice-versa.
 *
 * `null` quando a contagem falha: quem chama decide quanto vale (o cabeçalho
 * usa 0; a lista, 1).
 */
async function countConversationUnread(
  client: SupabaseClient<Database>,
  conversationId: string,
  myAccountId: string | null,
  lastReadAt: string | null,
  signal?: AbortSignal
): Promise<number | null> {
  let query = client
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (myAccountId) {
    query = query.or(`author_account_id.neq.${myAccountId},author_account_id.is.null`);
  }
  if (lastReadAt) {
    query = query.gt('created_at', lastReadAt);
  }
  if (signal) query = query.abortSignal(signal);

  const { count, error } = await query;
  return error ? null : (count ?? 0);
}

/**
 * Cabeçalho da conversa — tudo, exceto as mensagens, que são paginadas à
 * parte por `getConversationMessages`.
 * @throws {Error} Se não existir ou não for do paciente da sessão.
 */
export async function getConversationHeader(
  id: string,
  signal?: AbortSignal
): Promise<ConversationHeader> {
  const client = requireSupabase();
  const myAccountId = await getMyAccountId();

  let query = client.from('conversations').select(CONVERSATION_HEADER_SELECT).eq('id', id);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw appError('Não foi possível carregar a conversa.', error);
  }

  const row = data as unknown as ConversationHeaderRow | null;

  if (!row) {
    // Conversa de outro paciente e conversa inexistente são a mesma resposta:
    // a RLS devolve vazio nos dois casos.
    throw appError('Conversa não encontrada.');
  }

  const subject = row.conversation_subjects;
  const lastReadAt = row.conversation_read_marks[0]?.last_read_at ?? null;
  // Falhar a contagem não impede ler a conversa: só não marca como lida agora.
  const unreadCount =
    (await countConversationUnread(client, id, myAccountId, lastReadAt, signal)) ?? 0;

  return {
    id: row.id,
    title: subject.label,
    specialty: row.specialties?.label ?? null,
    subjectCode: subject.code,
    subjectInfo: getSubjectInfo(subject.code),
    unreadCount,
    isOpen: row.status === 'open',
    teamLastReadAt: row.team_last_read_at,
  };
}

/**
 * Uma página de mensagens de uma conversa, da mais recente para trás — não
 * embute mais em `conversations`, para não trazer (e assinar anexo de) o
 * histórico inteiro a cada abertura.
 *
 * `cursor` é o `criadoEm` (ISO) da mensagem mais antiga já carregada; `null`
 * pede a página mais recente. Mesmo contrato de paginação por chave que
 * `p_before` das funções `read_*` usa (README §3) — só que via `.from()`
 * direto: `read_messages` é do painel clínico/administrativo (grava a
 * trilha de auditoria de acesso da equipe) e não deve ser chamada a partir
 * do app do paciente.
 */
export async function getConversationMessages(
  conversationId: string,
  cursor: string | null,
  signal?: AbortSignal
): Promise<MessagesPage> {
  const client = requireSupabase();

  let query = client
    .from('messages')
    .select(MESSAGE_SELECT)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);

  if (cursor) {
    query = query.lt('created_at', cursor);
  }
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar as mensagens.', error);
  }

  const newestFirst = (data as unknown as ConversationMessageRow[]) ?? [];

  // Vieram da mais nova para a mais antiga (para o cursor pegar a borda certa
  // da página seguinte); a tela precisa da ordem cronológica normal. A imagem
  // não vem aqui: cada bolha baixa a sua (`downloadChatAttachment`).
  const messages = [...newestFirst]
    .reverse()
    .map((messageRow) => enrichMessage(messageRow));

  const oldest = newestFirst[newestFirst.length - 1];
  const nextCursor =
    newestFirst.length === MESSAGES_PAGE_SIZE && oldest
      ? oldest.created_at
      : null;

  return { messages, nextCursor };
}

/**
 * Soma das mensagens não lidas de todas as conversas (indicador da Home e da
 * aba Chat).
 *
 * Consulta própria, mais magra que `getConversations`: da última mensagem só o
 * autor e a hora, sem corpo, assunto nem especialidade. A contagem só vai ao
 * banco nas conversas com mensagem nova (`countUnreadFromPreview`).
 */
export async function getUnreadConversationsSummary(
  signal?: AbortSignal
): Promise<UnreadConversationsSummary> {
  const client = requireSupabase();
  const myAccountId = await getMyAccountId();

  let query = client
    .from('conversations')
    .select(UNREAD_PROBE_SELECT)
    .order('created_at', { referencedTable: 'messages', ascending: false })
    .limit(1, { referencedTable: 'messages' });

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível verificar suas mensagens.', error);
  }

  const rows = data as unknown as UnreadProbeRow[];
  const perConversation = await Promise.all(
    rows.map((row) => countUnreadFromPreview(client, row, myAccountId, signal))
  );

  return { total: perConversation.reduce((acc, unread) => acc + unread, 0) };
}

/**
 * Marca a conversa como lida.
 *
 * É RPC e não escrita direta porque a função também precisa checar
 * visibilidade: ela é `SECURITY DEFINER`, e sem essa checagem qualquer conta
 * marcaria a conversa de qualquer paciente — o que vazaria a EXISTÊNCIA da
 * conversa por tentativa e erro.
 */
export async function markConversationRead(id: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.rpc('mark_conversation_read', { p_conversation_id: id });

  if (error) {
    throw appError(describeChatError(error, 'Não foi possível marcar a conversa como lida.'), error);
  }

  return { success: true };
}

/**
 * Grava a linha de `messages`. Comum a `sendMessage` e
 * `sendImageMessage` — a única diferença entre as duas é o que acontece
 * depois (nada, ou os dois passos do anexo).
 *
 * `.insert()` direto, e não RPC: o chat é caminho quente demais para uma
 * função por mensagem, e a autoria da linha imutável já é a trilha de
 * auditoria. A mensagem não se edita nem se apaga — corrigir é mandar outra.
 *
 * `autorTipo` é obrigatório porque a RLS tem uma política PRÓPRIA por
 * remetente (`messages_insert_patient` exige `author_kind = 'patient'` E
 * `conversations.patient_id = my_own_patient_id()`; `messages_insert_caregiver`
 * exige `author_kind = 'caregiver'` E o paciente estar entre
 * `my_ward_patient_ids()`). Gravar sempre `'patient'` faz as DUAS políticas
 * recusarem a escrita de um cuidador — nenhuma bate. Quem decide o valor é o
 * hook, a partir de `isCaregiver` da sessão (mesmo padrão de `actingAs` no
 * Diário) — `start_conversation` já resolve isso sozinho no servidor, mas
 * esta função cobre toda mensagem SEGUINTE numa conversa já aberta.
 */
async function insertMessage(
  client: SupabaseClient<Database>,
  conversationId: string,
  text: string,
  authorKind: 'patient' | 'caregiver'
): Promise<ConversationMessageRow> {
  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    throw appError('Sua sessão expirou. Entre novamente para enviar a mensagem.');
  }

  const { data, error } = await client
    .from('messages')
    .insert({
      conversation_id: conversationId,
      author_kind: authorKind,
      author_account_id: session.user.id,
      body: text,
    })
    .select('id, body, author_kind, author_account_id, created_at')
    .single();

  if (error || !data) {
    throw appError(describeChatError(error ?? {}, 'Não foi possível enviar a mensagem.'), error);
  }

  return data as unknown as ConversationMessageRow;
}

/** Envia uma mensagem de texto numa conversa aberta. */
export async function sendMessage(
  conversationId: string,
  text: string,
  authorKind: 'patient' | 'caregiver'
): Promise<SendMessageResult> {
  const client = requireSupabase();
  const messageRow = await insertMessage(client, conversationId, text, authorKind);

  return { success: true, message: enrichMessage(messageRow) };
}

/** Código do anexo cujo arquivo não está no bucket — ver `downloadChatAttachment`. */
export const CHAT_ATTACHMENT_MISSING = 'chat_attachment_missing';

/** O Storage diz que o arquivo não existe — ou que não é de quem pediu, que ele responde igual. */
function isStorageNotFound(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const raw = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  return raw.status === 404 || raw.statusCode === '404' || raw.code === 'NoSuchKey';
}

/** O arquivo já está no caminho — o bucket do chat não sobrescreve (guia §7). */
function isStorageConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const raw = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  return (
    raw.status === 409 ||
    raw.statusCode === '409' ||
    raw.code === 'ResourceAlreadyExists' ||
    raw.code === 'Duplicate'
  );
}

/**
 * Baixa o arquivo de uma imagem do chat pela Storage API, sob a RLS
 * (`can_read_chat_attachment`: quem lê a mensagem lê o arquivo).
 *
 * Sem link assinado: o guia (§7 e §11) não tem emissor de link — o arquivo se
 * baixa, e a tela o mostra por um endereço `blob:` que só existe na memória do
 * aparelho. Um link assinado valia por uma hora para qualquer um que o tivesse.
 *
 * @throws {AppError} `CHAT_ATTACHMENT_MISSING` quando o arquivo não está no
 * bucket — o envio falhou depois da mensagem, ou ainda está subindo (a linha
 * do anexo chega pelo Realtime antes do arquivo).
 */
export async function downloadChatAttachment(storagePath: string, signal?: AbortSignal): Promise<Blob> {
  const { data, error } = await requireSupabase()
    .storage.from('chat-attachments')
    .download(storagePath, {}, signal ? { signal } : undefined);

  if (error || !data) {
    if (isStorageNotFound(error)) {
      throw new AppError('Esta imagem não está disponível.', CHAT_ATTACHMENT_MISSING, error);
    }
    throw appError('Não foi possível carregar a imagem.', error);
  }

  return data;
}

/**
 * Passo 2 do envio de imagem: a linha de `message_attachments`. A política do
 * bucket (`can_write_chat_attachment`) só aceita o arquivo depois dela.
 *
 * `23505` é a linha que já existe (`storage_path` é único): uma tentativa
 * anterior gravou e a resposta se perdeu. Vale como gravada.
 */
async function registerChatAttachment(
  client: SupabaseClient<Database>,
  pending: PendingChatAttachment,
  file: File
): Promise<void> {
  const { error } = await client.from('message_attachments').insert({
    message_id: pending.messageId,
    storage_path: pending.storagePath,
    mime_type: file.type,
    byte_size: file.size,
  });

  if (error && error.code !== '23505') {
    throw appError(describeChatError(error, 'Não foi possível registrar a imagem.'), error);
  }
}

/**
 * Passo 3: o arquivo, sem `upsert` (o bucket do chat não sobrescreve). O
 * conflito é o arquivo que já subiu numa tentativa cuja resposta se perdeu —
 * e, como nada sobrescreve, o que está lá é o que foi mandado.
 */
async function uploadChatAttachmentFile(
  client: SupabaseClient<Database>,
  storagePath: string,
  file: File
): Promise<void> {
  const { error } = await client.storage
    .from('chat-attachments')
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (error && !isStorageConflict(error)) {
    throw appError('Não foi possível enviar o arquivo da imagem.', error);
  }
}

/**
 * Envia uma imagem numa conversa aberta, com legenda opcional.
 *
 * Três passos, nesta ordem — não é convenção de front, é privilégio do banco:
 *
 * 1. A mensagem primeiro. `message_attachments.storage_path` tem CHECK de
 *    prefixo `<message_id>/…`, então o caminho só existe depois que a
 *    mensagem existe. Sem legenda, o `body` (não pode ser vazio) recebe o
 *    placeholder `IMAGE_WITHOUT_CAPTION_TEXT`.
 * 2. Registra o anexo (`registerChatAttachment`).
 * 3. Sobe o arquivo (`uploadChatAttachmentFile`).
 *
 * O nome do arquivo no bucket é `<message_id>/<uuid>.<ext>`, e não o nome
 * original: o nome que vem do aparelho pode trazer o nome da pessoa ou do
 * exame, e caractere que o Storage recusa.
 *
 * Sem transação entre os passos. Se o 2 ou o 3 falhar, a mensagem já existe e
 * não se apaga (é imutável): em vez de erro, a função devolve em `pending` o
 * que falta, para a tela oferecer "Reenviar" com o mesmo arquivo — o bucket
 * aceita o mesmo caminho enquanto o arquivo não existir (guia §7).
 *
 * @throws {AppError} Só quando nada foi gravado: tipo de arquivo que o bucket
 * não aceita, ou a própria mensagem recusada (conversa encerrada, sessão).
 */
export async function sendImageMessage(
  conversationId: string,
  file: File,
  authorKind: 'patient' | 'caregiver',
  caption?: string
): Promise<SendImageResult> {
  const client = requireSupabase();
  const extension = getFileExtension(file.type);

  // Conferido antes de gravar a mensagem: depois, o erro deixaria uma mensagem
  // que nunca teria imagem.
  if (!extension || file.type === PDF_MIME_TYPE) {
    throw appError('Envie uma imagem em PNG, JPEG ou WEBP.');
  }

  const body = caption?.trim() || IMAGE_WITHOUT_CAPTION_TEXT;
  const messageRow = await insertMessage(client, conversationId, body, authorKind);
  const storagePath = `${messageRow.id}/${randomUuid()}.${extension}`;

  const pending: PendingChatAttachment = { messageId: messageRow.id, storagePath, registered: false };

  try {
    await registerChatAttachment(client, pending, file);
    pending.registered = true;
    await uploadChatAttachmentFile(client, storagePath, file);
  } catch {
    return { messageId: messageRow.id, storagePath, pending };
  }

  return { messageId: messageRow.id, storagePath, pending: null };
}

/**
 * Reenvia o arquivo de uma imagem cuja mensagem já existe — os passos que
 * faltaram em `sendImageMessage`, para o MESMO caminho. Repetível: a linha
 * e o arquivo que já estiverem lá contam como feitos.
 */
export async function retryChatAttachment(pending: PendingChatAttachment, file: File): Promise<void> {
  const client = requireSupabase();

  if (!pending.registered) await registerChatAttachment(client, pending, file);
  await uploadChatAttachmentFile(client, pending.storagePath, file);
}

/**
 * Abre uma conversa e grava a primeira mensagem, atomicamente.
 *
 * Os dois passos são uma RPC só porque conversa sem mensagem não existe do
 * ponto de vista do produto. A especialidade sai do assunto — hoje sempre
 * `NULL`, porque o mapa de roteamento nasce vazio de propósito e a conversa
 * fica na fila geral até um profissional assumi-la.
 */
export async function startConversation({
  subjectId,
  text,
}: StartConversationInput): Promise<StartConversationResult> {
  const client = requireSupabase();

  const { data, error } = await client.rpc('start_conversation', {
    p_subject_id: subjectId,
    p_body: text,
  });

  if (error || !data) {
    throw appError(describeChatError(error ?? {}, 'Não foi possível iniciar a conversa.'), error);
  }

  return { success: true, id: data as string };
}

/**
 * Escuta as mudanças do chat em tempo real e devolve a função de cancelamento.
 *
 * `messages` e `conversations` estão na publication de Realtime justamente
 * para o app do paciente — sem isto, a resposta da equipe só apareceria no
 * próximo refetch, e um chat que não atualiza sozinho não é um chat.
 *
 * A RLS vale igualmente no Realtime: o canal só entrega as linhas que este
 * paciente já poderia ler. O filtro por conversa é recorte de escopo, não de
 * segurança.
 *
 * Recebe um callback em vez de devolver as linhas: quem sabe reagir é o cache
 * do TanStack Query, e reconsultar mantém uma única forma de montar a
 * conversa (prévia e não lidas são derivadas, não vêm na linha).
 */
export function subscribeToChat(
  conversationId: string | undefined,
  onChange: () => void
): () => void {
  // Sem cliente configurado não há o que assinar — devolve um cancelamento
  // inócuo em vez de derrubar a tela que chamou.
  if (!supabase) return () => {};

  const client = supabase;
  const channel = client.channel(conversationId ? `chat:${conversationId}` : 'chat:list');

  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      ...(conversationId ? { filter: `conversation_id=eq.${conversationId}` } : {}),
    },
    onChange
  );

  // A conversa também muda sem mensagem nova: `team_last_read_at` é o que
  // vira "Lida" na bolha do paciente, e `status` é o que fecha o campo de
  // digitação quando a equipe encerra o atendimento.
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'conversations' },
    onChange
  );

  // O anexo chega DEPOIS da mensagem (passo 2 de `sendImageMessage`) —
  // sem escutar esta tabela também, o evento de INSERT em `messages` poderia
  // disparar o refetch antes da linha do anexo existir, e a imagem só
  // apareceria na próxima mudança qualquer. Sem filtro por conversa (a
  // tabela não tem a coluna `conversation_id` direto, só `message_id`):
  // mesma concessão já aceita no listener de `conversations` acima.
  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'message_attachments' },
    onChange
  );

  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
