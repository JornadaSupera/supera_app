// Notificações: a caixa e o arquivo, marcar como lida, o Realtime, as
// preferências por tipo e a janela de silêncio.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../types/database';
import { appError } from '../lib/appError';
import { requireSupabase, supabase } from './supabaseClient';
import { formatDayLabel, formatRelativeTime, formatTimeOfDay } from '../utils/date';
import { getNotificationCategoryInfo, getNotificationDestination } from '../utils/notifications';
import type {
  ApiSuccessResult,
  NotificationCategory,
  NotificationDetail,
  NotificationPreferenceToggle,
  NotificationsQueryOptions,
  QuietHours,
} from '../types';

/**
 * Colunas de uma notificação, com o tipo já embutido — é dali que vêm
 * `label` e `category`, já que a linha em si não guarda texto nenhum.
 */
const NOTIFICATION_SELECT =
  'id, read_at, archived_at, created_at, target_table, target_id, ' +
  'notification_types(id, code, label, category)';

interface NotificationTypeEmbed {
  id: string;
  code: string;
  label: string;
  category: NotificationCategory;
}

interface NotificationRow {
  id: string;
  read_at: string | null;
  archived_at: string | null;
  created_at: string;
  target_table: string | null;
  target_id: string | null;
  // Nulável: o vocabulário se aposenta com `is_active = false`, nunca se
  // apaga (README, seção 10), e a política de `notification_types` só
  // devolve linhas ativas. Uma notificação antiga cujo tipo foi desativado
  // continua existindo em `notifications` — é o próprio embed que some.
  notification_types: NotificationTypeEmbed | null;
}

/** Título de quem perdeu o tipo — ver `NotificationRow`. */
const FALLBACK_TITLE = 'Notificação';

/** Teto por consulta, no mesmo patamar das outras listas. */
const NOTIFICATION_PAGE_SIZE = 200;

/**
 * Folga das consultas com `limit` (a prévia da Início): os avisos de conversa
 * apagada saem depois da leitura, e sem a folga eles comiam as vagas dos
 * avisos de verdade.
 */
const ORPHAN_SLACK = 10;

/** Prévias montadas e os alvos que a leitura confirmou que não existem mais. */
interface NotificationTargets {
  previews: Map<string, string>;
  /** Conversas pedidas que não voltaram: apagadas (ou fora da RLS). */
  missingConversationIds: Set<string>;
}

function enrichNotification(row: NotificationRow, preview: string | null): NotificationDetail {
  const notificationType = row.notification_types;
  const category = notificationType?.category ?? null;

  return {
    id: row.id,
    category,
    categoryInfo: getNotificationCategoryInfo(category),
    title: notificationType?.label ?? FALLBACK_TITLE,
    preview,
    isRead: row.read_at !== null,
    isArchived: row.archived_at !== null,
    createdAt: row.created_at,
    timeLabel: formatRelativeTime((Date.now() - new Date(row.created_at).getTime()) / 60000),
    destination: getNotificationDestination(row.target_table, row.target_id),
  };
}

/** Agrupa os alvos por tabela — uma consulta por tipo de alvo, não uma por aviso. */
function groupTargetsByTable(rows: NotificationRow[]): Map<string, string[]> {
  const byTable = new Map<string, string[]>();

  rows.forEach((row) => {
    if (!row.target_table || !row.target_id) return;
    const current = byTable.get(row.target_table) ?? [];
    current.push(row.target_id);
    byTable.set(row.target_table, current);
  });

  return byTable;
}

/**
 * Prévia de cada notificação, lida do registro de origem.
 *
 * A linha de `notifications` não tem texto: o guia (5.8) manda o cliente
 * montar a prévia com o que já pode ler. Cada consulta abaixo passa pela RLS
 * do próprio módulo — alvo que a pessoa não pode ver simplesmente não ganha
 * prévia, em vez de a tela inventar uma.
 *
 * Do chat vai o ASSUNTO, nunca o texto da mensagem: a prévia aparece em lista
 * e não precisa carregar conteúdo clínico para dizer o que aconteceu.
 *
 * A mesma leitura das conversas diz quais não existem mais: o banco não apaga
 * o aviso quando a conversa é apagada (o alvo é polimórfico, sem chave
 * estrangeira), e o aviso abria uma conversa que não está lá (07/10).
 */
async function loadNotificationTargets(
  client: SupabaseClient<Database>,
  rows: NotificationRow[],
  signal?: AbortSignal
): Promise<NotificationTargets> {
  const byTable = groupTargetsByTable(rows);
  const previews = new Map<string, string>();
  const missingConversationIds = new Set<string>();

  // `PromiseLike` porque o builder do PostgREST não é uma Promise completa.
  const reads: PromiseLike<void>[] = [];

  const appointmentIds = byTable.get('appointments');
  if (appointmentIds?.length) {
    let query = client
      .from('appointments')
      .select('id, title, starts_at')
      .in('id', appointmentIds);
    if (signal) query = query.abortSignal(signal);

    reads.push(
      query.then(({ data }) => {
        (data ?? []).forEach((appointment) => {
          const startsAt = new Date(appointment.starts_at);
          // O dia como a Agenda e a Início o dizem ("Amanhã", "Hoje"): o mesmo
          // compromisso aparecia como "07/10" aqui e "Amanhã" lá.
          previews.set(
            appointment.id,
            `${appointment.title} · ${formatDayLabel(startsAt)} às ${formatTimeOfDay(startsAt)}`
          );
        });
      })
    );
  }

  const conversationIds = byTable.get('conversations');
  if (conversationIds?.length) {
    let query = client
      .from('conversations')
      .select('id, conversation_subjects(label)')
      .in('id', conversationIds);
    if (signal) query = query.abortSignal(signal);

    reads.push(
      query.then(({ data, error }) => {
        (data ?? []).forEach((conversation) => {
          const subject = conversation.conversation_subjects?.label;
          if (subject) previews.set(conversation.id, `Assunto: ${subject}`);
        });
        // Só com a leitura certa: falha de rede não é conversa apagada.
        if (error || !data) return;
        const found = new Set(data.map((conversation) => conversation.id));
        conversationIds.forEach((conversationId) => {
          if (!found.has(conversationId)) missingConversationIds.add(conversationId);
        });
      })
    );
  }

  const resourceIds = byTable.get('content_items');
  if (resourceIds?.length) {
    let query = client
      .from('content_items')
      .select('id, content_versions(title)')
      .in('id', resourceIds);
    if (signal) query = query.abortSignal(signal);

    reads.push(
      query.then(({ data }) => {
        (data ?? []).forEach((resource) => {
          const title = resource.content_versions?.[0]?.title;
          if (title) previews.set(resource.id, title);
        });
      })
    );
  }

  // Falha de uma prévia não derruba a lista: o aviso aparece sem ela.
  await Promise.allSettled(reads);

  return { previews, missingConversationIds };
}

/** Aviso de conversa que não existe mais: sai da lista (ver `loadNotificationTargets`). */
function pointsToMissingConversation(row: NotificationRow, missingConversationIds: Set<string>): boolean {
  return row.target_table === 'conversations' && row.target_id !== null && missingConversationIds.has(row.target_id);
}

/**
 * Notificações da caixa (ou do arquivo, com `archived`), da mais recente
 * para a mais antiga.
 */
export async function getNotifications(
  { limit, unreadOnly, archived = false }: NotificationsQueryOptions = {},
  signal?: AbortSignal
): Promise<NotificationDetail[]> {
  const client = requireSupabase();

  let query = client
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit === undefined ? NOTIFICATION_PAGE_SIZE : limit + ORPHAN_SLACK);

  query = archived
    ? query.not('archived_at', 'is', null)
    : query.is('archived_at', null);

  if (unreadOnly) {
    query = query.is('read_at', null);
  }

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar suas notificações.', error);
  }

  const rows = data as unknown as NotificationRow[];
  const { previews, missingConversationIds } = await loadNotificationTargets(client, rows, signal);

  // Os contadores (sino, "não lidas") saem desta mesma lista: sem o aviso
  // órfão aqui, ele também não conta.
  const visibleRows = rows
    .filter((row) => !pointsToMissingConversation(row, missingConversationIds))
    .slice(0, limit ?? NOTIFICATION_PAGE_SIZE);

  return visibleRows.map((row) =>
    enrichNotification(row, row.target_id ? (previews.get(row.target_id) ?? null) : null)
  );
}

/**
 * Desarquiva. Arquivar não é apagar: sem este caminho de volta, a
 * notificação sumia para sempre com um toque, e o mapa contratado pede um
 * arquivo consultável.
 */
export async function unarchiveNotification(id: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client.from('notifications').update({ archived_at: null }).eq('id', id);

  if (error) {
    throw appError('Não foi possível tirar a notificação do arquivo.', error);
  }

  return { success: true };
}

/**
 * Marca uma notificação como lida.
 *
 * `GRANT UPDATE (read_at, archived_at)` é o único jeito de escrever nesta
 * tabela — não é RPC porque não há regra de negócio além de "é minha", e a
 * política já garante isso.
 */
export async function markNotificationRead(id: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw appError('Não foi possível marcar a notificação como lida.', error);
  }

  return { success: true };
}

/**
 * Marca como lidas todas as notificações ainda não lidas.
 *
 * `.is('read_at', null)` restringe às realmente pendentes — sem isso o
 * `UPDATE` reescreveria `read_at` de notificações já lidas há muito tempo,
 * o que não muda o resultado mas atualiza `updated_at` à toa.
 */
export async function markAllNotificationsRead(): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);

  if (error) {
    throw appError('Não foi possível marcar as notificações como lidas.', error);
  }

  return { success: true };
}

/**
 * Arquiva uma notificação. `GRANT UPDATE (read_at, archived_at)` é o mesmo
 * privilégio que já cobre marcar como lida — não é RPC pelo mesmo motivo
 * (README §5.8, seção 6): não há regra de negócio além de "é minha".
 *
 * Arquivada some das duas listas (`getNotifications`/`getTodasNotificacoes`
 * filtram `.is('archived_at', null)`) — não é uma segunda leitura, é a mesma
 * consulta de sempre depois que a linha muda.
 */
export async function archiveNotification(id: string): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const { error } = await client
    .from('notifications')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw appError('Não foi possível arquivar a notificação.', error);
  }

  return { success: true };
}

/**
 * Realtime da caixa de entrada (README §8: `notifications` está na
 * publication). Mesmo padrão de `subscribeToChat` — um canal, callback único
 * que dispara refetch em vez de tentar remontar a linha à mão a partir do
 * payload do evento (`enrichNotification` já resolve tudo isso na leitura).
 */
export function subscribeToNotifications(onChange: () => void): () => void {
  if (!supabase) return () => {};

  const client = supabase;
  const channel = client.channel('notifications:inbox');

  channel.on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'notifications' },
    onChange
  );

  // UPDATE cobre ler/arquivar feito por OUTRA sessão da mesma conta (ex.:
  // marcado como lida no celular enquanto o tablet está aberto) — a própria
  // mutation local já invalida o cache sozinha, então isto é sobre o que
  // acontece fora desta aba.
  channel.on(
    'postgres_changes',
    { event: 'UPDATE', schema: 'public', table: 'notifications' },
    onChange
  );

  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

/** `notification_types` com a preferência de canal `push` desta conta embutida. */
interface NotificationTypeWithPreferenceEmbed extends NotificationTypeEmbed {
  notification_preferences: { is_enabled: boolean }[];
}

/**
 * Tipos silenciáveis, com o estado do toggle (canal `push`) desta conta.
 *
 * Uma consulta só: o filtro incide sobre `channel`, que é ortogonal ao valor
 * que se quer ler (`is_enabled`) — diferente do caso de "não lidas" em
 * Orientações, onde filtrar no embed recorta pelo próprio campo testado e
 * perde a distinção. Aqui o embed (`!left`) devolve array vazio quando não
 * há linha de preferência para o canal push, e um item quando há — "sem
 * linha" e "preferência habilitada" continuam distinguíveis.
 */
export async function getNotificationPreferences(
  signal?: AbortSignal
): Promise<NotificationPreferenceToggle[]> {
  const client = requireSupabase();

  // `audience` separa os tipos do paciente dos da equipe ("Conversa atribuída
  // a você", "Relatório agendado disponível"): a RLS deixa qualquer conta ler
  // todos os tipos ativos, e sem este filtro os da equipe viravam
  // interruptores na tela do paciente. O acompanhante recebe os do paciente.
  let query = client
    .from('notification_types')
    .select('id, code, label, category, notification_preferences!left(is_enabled)')
    .eq('audience', 'patient')
    .eq('is_active', true)
    .eq('is_silenceable', true)
    .eq('notification_preferences.channel', 'push')
    .order('sort_order');

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar as preferências de notificação.', error);
  }

  return (data as unknown as NotificationTypeWithPreferenceEmbed[]).map((notificationType) => ({
    typeId: notificationType.id,
    code: notificationType.code,
    label: notificationType.label,
    category: notificationType.category,
    // Sem linha = habilitado. É o "fail-open" que o banco documenta: só
    // existe restrição para quem explicitamente desligou.
    enabled: notificationType.notification_preferences[0]?.is_enabled ?? true,
  }));
}

/**
 * Liga/desliga o push de um tipo de notificação.
 *
 * `upsert` porque a linha pode não existir ainda (a conta nunca mexeu nesse
 * tipo) — inserir e atualizar são o mesmo ato do ponto de vista da tela.
 * `is_silenceable: true` é redundante com o filtro de `getNotificationPreferences`,
 * mas obrigatório aqui: é o segundo termo da FK composta que a tabela exige
 * (`fk_notification_preferences_type`), e mandar `false` faria o próprio
 * `CHECK` da tabela recusar a escrita antes mesmo de checar a FK.
 */
/**
 * A FK composta é como o alerta crítico se torna insilenciável: tentar
 * desligar um tipo com `is_silenceable = false` cai em 23503. Não deveria
 * acontecer pela UI (a lista de toggles já filtra por silenciável), mas a
 * mensagem cobre o caso de alguém chamar a função direto.
 */
function describeNotificationPreferenceError(
  error: { code?: string },
  fallback: string
): string {
  if (error.code === '23503') {
    return 'Este tipo de notificação não pode ser desativado.';
  }

  return fallback;
}

export async function setNotificationPreference(
  typeId: string,
  enabled: boolean
): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    throw appError('Sua sessão expirou. Entre novamente para salvar a preferência.');
  }

  const { error } = await client.from('notification_preferences').upsert(
    {
      account_id: session.user.id,
      type_id: typeId,
      channel: 'push',
      is_silenceable: true,
      is_enabled: enabled,
    },
    { onConflict: 'account_id,type_id,channel' }
  );

  if (error) {
    throw appError(
      describeNotificationPreferenceError(error, 'Não foi possível salvar a preferência.'),
      error
    );
  }

  return { success: true };
}

/**
 * Janela de silêncio (README §5.8) — atrasa o envio de notificações
 * silenciáveis, nunca cancela. É uma configuração da CONTA, mas a coluna vive
 * em `notification_preferences`, cuja chave é `(account_id, type_id,
 * channel)` — não existe uma linha "geral" separada das linhas por tipo.
 * Como a UI trata a janela como uma coisa só (uma pergunta do usuário: "não
 * decidimos isso por tipo"), lê-se o valor de QUALQUER linha existente — por
 * construção (`setQuietHours` abaixo) todas guardam o mesmo horário.
 */
export async function getQuietHours(signal?: AbortSignal): Promise<QuietHours> {
  const client = requireSupabase();

  let query = client
    .from('notification_preferences')
    .select('quiet_hours_start, quiet_hours_end')
    .limit(1);

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw appError('Não foi possível carregar a janela de silêncio.', error);
  }

  return {
    start: (data?.quiet_hours_start as string | null) ?? null,
    end: (data?.quiet_hours_end as string | null) ?? null,
  };
}

/**
 * Grava a janela de silêncio em TODAS as linhas de preferência da conta —
 * inclusive nas que ainda não existem (os tipos silenciáveis que a conta
 * nunca tocou, e que por isso valem `enabled: true` por padrão/fail-open, ver
 * `getNotificationPreferences`). Sem isso, uma conta que nunca desligou
 * nenhum tipo não teria onde gravar a janela — a tabela não tem linha
 * "geral", só por tipo.
 *
 * Lê o estado atual de cada tipo antes de escrever para não reativar um tipo
 * que a pessoa tinha desligado: o `upsert` sobrescreve a linha inteira, então
 * `is_enabled` precisa vir junto, preservado.
 */
export async function setQuietHours(start: string | null, end: string | null): Promise<ApiSuccessResult> {
  const client = requireSupabase();

  const {
    data: { session },
  } = await client.auth.getSession();

  if (!session) {
    throw appError('Sua sessão expirou. Entre novamente para salvar a janela de silêncio.');
  }

  const preferences = await getNotificationPreferences();

  const { error } = await client.from('notification_preferences').upsert(
    preferences.map((preference) => ({
      account_id: session.user.id,
      type_id: preference.typeId,
      channel: 'push' as const,
      is_silenceable: true,
      is_enabled: preference.enabled,
      quiet_hours_start: start,
      quiet_hours_end: end,
    })),
    { onConflict: 'account_id,type_id,channel' }
  );

  if (error) {
    throw appError('Não foi possível salvar a janela de silêncio.', error);
  }

  return { success: true };
}
