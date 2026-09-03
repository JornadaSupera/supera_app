import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import {
  getNotificacoes,
  getNotificationPreferences,
  getTodasNotificacoes,
  marcarNotificacaoComoLida,
  marcarTodasNotificacoesComoLidas,
  setNotificationPreference,
} from '../services/mockApi';
import type {
  NotificationDetail,
  NotificationPreferenceToggle,
  NotificationsQueryOptions,
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
