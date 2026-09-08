import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  arquivarNotificacao,
  getNotificacoes,
  getNotificationPreferences,
  getQuietHours,
  getTodasNotificacoes,
  marcarNotificacaoComoLida,
  marcarTodasNotificacoesComoLidas,
  setNotificationPreference,
  setQuietHours,
  subscribeToNotifications,
} from '../services/mockApi';
import type {
  NotificationDetail,
  NotificationPreferenceToggle,
  NotificationsQueryOptions,
  QuietHours,
} from '../types';

// Hooks de Notificações. Leitura é `.from()` direto — a política já limita
// à própria caixa; escrita é `UPDATE` de duas colunas (ler/arquivar) e
// `upsert` na matriz de preferências, ambos dentro da lista fechada do banco.

const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;
const NOTIFICATION_PREFERENCES_QUERY_KEY = ['notification-preferences'] as const;

/** Prévia — Home. */
export function useNotificationsPreview(options: NotificationsQueryOptions = {}) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, 'preview', options],
    queryFn: () => getNotificacoes(options),
  });
}

/** Lista completa — Central de Notificações. */
export function useAllNotifications() {
  return useQuery({
    queryKey: [...NOTIFICATIONS_QUERY_KEY, 'all'],
    queryFn: getTodasNotificacoes,
  });
}

/**
 * Aplica `mapper` ao cache das duas variantes de notificação (prévia e
 * lista completa) e devolve o snapshot de cada uma, para rollback em
 * `onError`. É o que `useMarkNotificationRead` e `useMarkAllNotificationsRead`
 * têm em comum — a única diferença real entre as duas mutations é o mapper.
 */
function aplicarAtualizacaoOtimistaDeNotificacoes(
  queryClient: QueryClient,
  mapper: (notificacao: NotificationDetail) => NotificationDetail
) {
  const anteriores = [
    ...queryClient.getQueriesData<NotificationDetail[]>({
      queryKey: [...NOTIFICATIONS_QUERY_KEY, 'preview'],
    }),
    ...queryClient.getQueriesData<NotificationDetail[]>({
      queryKey: [...NOTIFICATIONS_QUERY_KEY, 'all'],
    }),
  ];

  queryClient.setQueriesData<NotificationDetail[]>(
    { queryKey: [...NOTIFICATIONS_QUERY_KEY, 'preview'] },
    (atual) => atual?.map(mapper)
  );
  queryClient.setQueriesData<NotificationDetail[]>(
    { queryKey: [...NOTIFICATIONS_QUERY_KEY, 'all'] },
    (atual) => atual?.map(mapper)
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
 * Mexe nas duas chaves (prévia e lista completa): a mesma notificação pode
 * estar em cache nas duas ao mesmo tempo (Home e Central abertas na mesma
 * sessão), e o otimismo precisa valer nas duas para não piscar. Se a escrita
 * falhar (sessão expirada, RLS, rede), `onError` desfaz — sem isso a
 * notificação some da lista "não lidas" mesmo quando o servidor recusou.
 */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: marcarNotificacaoComoLida,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

      const anteriores = aplicarAtualizacaoOtimistaDeNotificacoes(queryClient, (notificacao) =>
        notificacao.id === id ? { ...notificacao, lida: true } : notificacao
      );

      return { anteriores };
    },
    onError: (_error, _id, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/** Marca todas como lidas, também com atualização otimista e rollback. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

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
    onError: (_error, _vars, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });
}

/**
 * Arquiva, com atualização otimista — diferente de marcar como lida, isto
 * REMOVE a notificação das duas listas em cache (é o que `arquivada` faz:
 * some de vez, não muda um campo visível). Restaura a lista anterior em caso
 * de erro, mesmo princípio de `useMarkNotificationRead`.
 */
export function useArchiveNotification() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: arquivarNotificacao,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });

      const anteriores = [
        ...queryClient.getQueriesData<NotificationDetail[]>({
          queryKey: [...NOTIFICATIONS_QUERY_KEY, 'preview'],
        }),
        ...queryClient.getQueriesData<NotificationDetail[]>({
          queryKey: [...NOTIFICATIONS_QUERY_KEY, 'all'],
        }),
      ];

      queryClient.setQueriesData<NotificationDetail[]>(
        { queryKey: [...NOTIFICATIONS_QUERY_KEY, 'preview'] },
        (atual) => atual?.filter((notificacao) => notificacao.id !== id)
      );
      queryClient.setQueriesData<NotificationDetail[]>(
        { queryKey: [...NOTIFICATIONS_QUERY_KEY, 'all'] },
        (atual) => atual?.filter((notificacao) => notificacao.id !== id)
      );

      return { anteriores };
    },
    onError: (_error, _id, context) => {
      if (context) restaurarNotificacoes(queryClient, context.anteriores);
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
    onError: (_error, _vars, context) => {
      if (context?.anterior) {
        queryClient.setQueryData(NOTIFICATION_PREFERENCES_QUERY_KEY, context.anterior);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_PREFERENCES_QUERY_KEY });
    },
  });
}

const QUIET_HOURS_QUERY_KEY = ['notification-preferences', 'quiet-hours'] as const;

/** Janela de silêncio da conta (`null`/`null` = nunca configurada). */
export function useQuietHours() {
  return useQuery({
    queryKey: QUIET_HOURS_QUERY_KEY,
    queryFn: getQuietHours,
  });
}

export function useSetQuietHours() {
  const queryClient = useQueryClient();

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
  });
}
