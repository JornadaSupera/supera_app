import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft } from 'lucide-react';
import Tag from '../../components/ui/tag';
import EmptyState from '../../components/ui/empty-state';
import Loading from '../../components/ui/loading';
import BottomTab from '../../components/ui/bottom-tab';
import NotificationItem from './NotificationItem';
import {
  getTodasNotificacoes,
  marcarNotificacaoComoLida,
  marcarTodasNotificacoesComoLidas,
} from '../../services/mockApi';
import { TIPOS_NOTIFICACAO } from '../../utils/notifications';
import type { NotificationDetail, NotificationType } from '../../types';

const CHAVES_TIPOS: NotificationType[] = ['lembrete', 'chat', 'orientacao', 'agenda'];

// Chave única da query — usada também pelas duas mutations abaixo (cache
// otimista + invalidação no sucesso), então fica centralizada aqui em vez de
// repetir o literal em cada `useMutation`.
const NOTIFICATIONS_QUERY_KEY = ['notifications'] as const;

export default function NotificationsCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [filtroTipo, setFiltroTipo] = useState<NotificationType | null>(null);

  const {
    data: notificacoes,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    queryFn: getTodasNotificacoes,
  });

  // Ambas as mutations atualizam o cache de forma otimista (`onMutate`) para
  // manter o feedback instantâneo que a tela já tinha com `useState` manual —
  // sem isso, a latência simulada do mock (150–300ms) criaria um atraso
  // visível entre o toque e o item aparecer como lido. `onSuccess` invalida
  // `['notifications']` para reconciliar com a "fonte da verdade"; `onError`
  // desfaz o otimismo se a chamada falhar.
  const marcarComoLidaMutation = useMutation({
    mutationFn: marcarNotificacaoComoLida,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const anterior = queryClient.getQueryData<NotificationDetail[]>(NOTIFICATIONS_QUERY_KEY);
      queryClient.setQueryData<NotificationDetail[]>(NOTIFICATIONS_QUERY_KEY, (atual) =>
        atual?.map((notificacao) => (notificacao.id === id ? { ...notificacao, lida: true } : notificacao))
      );
      return { anterior };
    },
    onError: (_error, _id, context) => {
      if (context?.anterior) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.anterior);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });

  const marcarTodasMutation = useMutation({
    mutationFn: marcarTodasNotificacoesComoLidas,
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
      const anterior = queryClient.getQueryData<NotificationDetail[]>(NOTIFICATIONS_QUERY_KEY);
      queryClient.setQueryData<NotificationDetail[]>(NOTIFICATIONS_QUERY_KEY, (atual) =>
        atual?.map((notificacao) => ({ ...notificacao, lida: true }))
      );
      return { anterior };
    },
    onError: (_error, _vars, context) => {
      if (context?.anterior) {
        queryClient.setQueryData(NOTIFICATIONS_QUERY_KEY, context.anterior);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
    },
  });

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !notificacoes) {
    return (
      <EmptyState
        title="Não foi possível carregar suas notificações"
        description="Verifique sua conexão e tente novamente."
        actionLabel="Tentar novamente"
        onAction={() => refetch()}
        // `EmptyState` ainda é `.jsx` sem tipos próprios — `iconTone` não tem
        // valor padrão na desestruturação, então o TypeScript o infere como
        // obrigatório (mesmo sendo opcional em tempo de execução). Repassado
        // como `undefined` só para satisfazer o tipo inferido; some quando
        // `EmptyState` migrar para TS.
        iconTone={undefined}
      />
    );
  }

  const naoLidasCount = notificacoes.filter((notificacao) => !notificacao.lida).length;
  const listaFiltrada = notificacoes.filter(
    (notificacao) => !filtroTipo || notificacao.tipo === filtroTipo
  );
  const naoLidas = listaFiltrada.filter((notificacao) => !notificacao.lida);
  const anteriores = listaFiltrada.filter((notificacao) => notificacao.lida);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-3 backdrop-blur-[12px]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="-m-2 box-content flex h-7 w-7 shrink-0 items-center justify-center rounded-md p-2 text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            onClick={() => navigate('/home')}
            aria-label="Voltar"
          >
            <ChevronLeft size={16} strokeWidth={2} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
              CENTRO DE NOTIFICAÇÕES
            </p>
            <h1 className="mt-0.5 text-[20px] font-semibold tracking-[-0.5px] text-foreground">
              Tudo da semana
            </h1>
          </div>

          {naoLidasCount > 0 && (
            <span
              className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-supera-empatia)] px-1.5 text-[11px] font-semibold text-white"
              aria-label={`${naoLidasCount} não lidas`}
            >
              {naoLidasCount}
            </span>
          )}
        </div>

        {naoLidasCount > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              className="cursor-pointer bg-transparent p-0 text-[13px] font-medium text-primary transition-opacity duration-150 ease-[ease] hover:underline"
              onClick={() => marcarTodasMutation.mutate()}
            >
              Marcar todas como lidas
            </button>
          </div>
        )}

        <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-[2px]">
          <Tag selected={filtroTipo === null} onClick={() => setFiltroTipo(null)}>
            Todas
          </Tag>
          {CHAVES_TIPOS.map((chave) => (
            <Tag key={chave} selected={filtroTipo === chave} onClick={() => setFiltroTipo(chave)}>
              {TIPOS_NOTIFICACAO[chave].label}
            </Tag>
          ))}
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 py-5">
        {listaFiltrada.length === 0 ? (
          <EmptyState
            title="Nenhuma notificação encontrada"
            description="Tente ajustar o filtro selecionado."
            // Ver comentário acima sobre `EmptyState` ainda ser `.jsx` sem tipos.
            iconTone={undefined}
            actionLabel={undefined}
            onAction={undefined}
          />
        ) : (
          <>
            {naoLidas.length > 0 && (
              <section className="flex flex-col">
                <h2 className="mb-3 text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  NÃO LIDAS
                </h2>
                <div className="flex flex-col gap-2">
                  {naoLidas.map((item) => (
                    <NotificationItem
                      notificacao={item}
                      key={item.id}
                      onLida={marcarComoLidaMutation.mutate}
                    />
                  ))}
                </div>
              </section>
            )}

            {anteriores.length > 0 && (
              <section className="flex flex-col">
                <h2 className="mb-3 text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
                  ANTERIORES
                </h2>
                <div className="flex flex-col gap-2">
                  {anteriores.map((item) => (
                    <NotificationItem
                      notificacao={item}
                      key={item.id}
                      onLida={marcarComoLidaMutation.mutate}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      <BottomTab />
    </div>
  );
}
