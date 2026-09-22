import { useEffect } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  arquivarNotificacao,
  desarquivarNotificacao,
  getNotificacoes,
  getNotificationPreferences,
  getQuietHours,
  marcarNotificacaoComoLida,
  marcarTodasNotificacoesComoLidas,
  setNotificationPreference,
  setQuietHours,
  subscribeToNotifications,
} from '../services/mockApi';
import { useToast } from '../contexts/ToastContext';
import { describeMutationError } from './useAuth';
import type {
  NotificationDetail,
  NotificationPreferenceToggle,
  NotificationsQueryOptions,
  QuietHours,
} from '../types';

// Hooks de Notificações. Leitura é `.from()` direto — a política já limita
// à própria caixa; escrita é `UPDATE` de duas colunas (ler/arquivar) e
// `upsert` na matriz de preferências, ambos dentro da lista fechada do banco.

/**
 * Chaves do domínio. `lists()` é o prefixo de toda listagem — prévia da
 * Home, caixa e arquivo são a mesma consulta com opções diferentes, e
 * invalidar o prefixo cobre as três.
 *
 * A janela de silêncio tem chave própria, fora do prefixo das preferências:
 * antes ela morava debaixo dele e era refeita a cada troca de toggle, sem
 * nenhum motivo.
 */
export const notificationKeys = {
  all: ['notifications'] as const,
  lists: () => [...notificationKeys.all, 'list'] as const,
  list: (options: NotificationsQueryOptions) => [...notificationKeys.lists(), options] as const,
  preferences: () => ['notification-preferences'] as const,
  quietHours: () => ['notification-quiet-hours'] as const,
};

const NOTIFICATIONS_QUERY_KEY = notificationKeys.all;
const NOTIFICATION_PREFERENCES_QUERY_KEY = notificationKeys.preferences();

/**
 * Lista de notificações: a prévia da Home (`limit` + `unreadOnly`), a caixa
 * da Central ou o arquivo (`archived`).
 *
 * `keepPreviousData` mantém a lista anterior enquanto a nova carrega — sem
 * ele, trocar entre caixa e arquivo pisca um vazio no meio.
 */
export function useNotifications(options: NotificationsQueryOptions = {}) {
  return useQuery({
    queryKey: notificationKeys.list(options),
    // `signal`: trocar de aba rápido cancela a leitura anterior de verdade.
    queryFn: ({ signal }) => getNotificacoes(options, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Aplica `mapper` a toda listagem em cache e devolve o snapshot de cada uma,
 * para rollback em `onError`. É o que `useMarkNotificationRead` e
 * `useMarkAllNotificationsRead` têm em comum — a diferença entre as duas é
 * só o mapper.
 */
function aplicarAtualizacaoOtimistaDeNotificacoes(
  queryClient: QueryClient,
  mapper: (notificacao: NotificationDetail) => NotificationDetail
) {
  const anteriores = queryClient.getQueriesData<NotificationDetail[]>({
    queryKey: notificationKeys.lists(),
  });

  queryClient.setQueriesData<NotificationDetail[]>(
    { queryKey: notificationKeys.lists() },
    (atual) => atual?.map(mapper)
  );

  return anteriores;
}

/** Tira a notificação de toda listagem em cache — arquivar e desarquivar. */
function removerDasListas(queryClient: QueryClient, id: string) {
  const anteriores = queryClient.getQueriesData<NotificationDetail[]>({
    queryKey: notificationKeys.lists(),
  });

  queryClient.setQueriesData<NotificationDetail[]>(
    { queryKey: notificationKeys.lists() },
    (atual) => atual?.filter((notificacao) => notificacao.id !== id)
  );

  return anteriores;
}

function restaurarNotificacoes(
  queryClient: QueryClient,
  anteriores: [readonly unknown[], NotificationDetail[] | undefined][]
) {
  anteriores.forEach(([queryKey, data]) => {
    if (data) queryClient.setQueryData(queryKey, data);
  });
}

/**
 * Marca uma notificação como lida, com atualização otimista.
 *
 * Mexe em toda listagem em cache: a mesma notificação pode estar na prévia
 * da Home e na caixa da Central ao mesmo tempo, e o otimismo precisa valer
 * nas duas para a tela não piscar. Se a escrita
 * falhar (sessão expirada, RLS, rede), `onError` desfaz — sem isso a
 * notificação some da lista "não lidas" mesmo quando o servidor recusou.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: marcarNotificacaoComoLida,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

      const anteriores = aplicarAtualizacaoOtimistaDeNotificacoes(queryClient, (notificacao) =>
        notificacao.id === id ? { ...notificacao, lida: true } : notificacao
      );

      return { anteriores };
    },
    onError: (error, _id, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
      showToast(describeMutationError(error, 'Não foi possível marcar como lida.'), {
        variant: 'error',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/** Marca todas como lidas, também com atualização otimista e rollback. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: marcarTodasNotificacoesComoLidas,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

      const anteriores = aplicarAtualizacaoOtimistaDeNotificacoes(queryClient, (notificacao) => ({
        ...notificacao,
        lida: true,
      }));

      return { anteriores };
    },
    onError: (error, _vars, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
      showToast(describeMutationError(error, 'Não foi possível marcar todas como lidas.'), {
        variant: 'error',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/**
 * Arquiva, com atualização otimista — diferente de marcar como lida, isto
 * tira a notificação da caixa em cache. Arquivar não apaga: ela passa a
 * viver no arquivo, de onde dá para trazer de volta.
 */
export function useArchiveNotification() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: arquivarNotificacao,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      return { anteriores: removerDasListas(queryClient, id) };
    },
    onError: (error, _id, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
      showToast(describeMutationError(error, 'Não foi possível arquivar a notificação.'), {
        variant: 'error',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/** Tira do arquivo e devolve para a caixa. */
export function useUnarchiveNotification() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: desarquivarNotificacao,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      return { anteriores: removerDasListas(queryClient, id) };
    },
    onError: (error, _id, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
      showToast(describeMutationError(error, 'Não foi possível tirar do arquivo.'), {
        variant: 'error',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/**
 * Assina o Realtime da caixa de entrada (README §8) e revalida as duas
 * variantes em cache a cada evento — mesmo padrão de `useChatRealtime`.
 * Chamar uma vez, na tela que representa "a caixa de entrada está aberta"
 * (a Central de Notificações).
 */
export function useNotificationsRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    return subscribeToNotifications(() => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    });
  }, [queryClient]);
}

/** Matriz de tipos silenciáveis com o estado do toggle desta conta. */
export function useNotificationPreferences() {
  return useQuery({
    queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY,
    queryFn: getNotificationPreferences,
  });
}

export function useSetNotificationPreference() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ typeId, enabled }: { typeId: string; enabled: boolean }) =>
      setNotificationPreference(typeId, enabled),
    onMutate: async ({ typeId, enabled }) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });

      const anterior = queryClient.getQueryData<NotificationPreferenceToggle[]>(
        NOTIFICATION_PREFERENCES_QUERY_KEY
      );

      queryClient.setQueryData<NotificationPreferenceToggle[]>(
        NOTIFICATION_PREFERENCES_QUERY_KEY,
        (atual) => atual?.map((item) => (item.typeId === typeId ? { ...item, enabled } : item))
      );

      return { anterior };
    },
    onError: (error, _vars, context) => {
      if (context?.anterior) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, context.anterior);
      }
      showToast(describeMutationError(error, 'Não foi possível salvar a preferência.'), {
        variant: 'error',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
    },
  });
}

const QUIET_HOURS_QUERY_KEY = notificationKeys.quietHours();

/** Janela de silêncio da conta (`null`/`null` = nunca configurada). */
export function useQuietHours() {
  return useQuery({
    queryKey: QUIET_HOURS_QUERY_KEY,
    queryFn: getQuietHours,
  });
}

export function useSetQuietHours() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: ({ start, end }: QuietHours) => setQuietHours(start, end),
    onSuccess: (_result, { start, end }) => {
      queryClient.setQueryData<QuietHours>(QUIET_HOURS_QUERY_KEY, { start, end });
      // A escrita também passa por cima de `is_enabled` de toda a matriz (ver
      // comentário de `setQuietHours`) — mesmo preservando o valor, invalida
      // pra garantir que a lista de toggles reflita exatamente o que o banco
      // tem, não o que o cliente presumiu antes de escrever.
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível salvar a janela de silêncio.'), {
        variant: 'error',
      });
    },
  });
}
