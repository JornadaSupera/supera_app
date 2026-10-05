import { useState } from 'react';
import { cn } from '@/lib/utils';
import Tag from '../../components/ui/tag';
import ChipRow from '../../components/ui/chip-row';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Skeleton from '../../components/ui/skeleton';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import NotificationItem from './NotificationItem';
import {
  useArchiveNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationsRealtime,
  useUnarchiveNotification,
} from '../../hooks/useNotifications';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { NOTIFICATION_CATEGORIES } from '../../utils/notifications';
import type { NotificationCategory } from '../../types';

const CATEGORIAS: NotificationCategory[] = ['agenda', 'chat', 'content', 'alert'];

type Aba = 'caixa' | 'arquivadas';

const ABAS: { key: Aba; label: string }[] = [
  { key: 'caixa', label: 'Caixa' },
  { key: 'arquivadas', label: 'Arquivadas' },
];

/** Carregamento com a forma da lista de avisos. */
function NotificationsSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando notificações">
      {[0, 1, 2, 3].map((linha) => (
        <div key={linha} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-1/2" />
            <Skeleton className="mt-2 h-3 w-3/4" />
          </div>
          <Skeleton className="h-2.5 w-10" />
        </div>
      ))}
    </div>
  );
}

export default function NotificationsCenter() {
  // Volta para a tela de onde a Central foi aberta, em vez de empilhar a Home
  // de novo; aberta direto (pelo toque num push, por exemplo), vai para a Home.
  const goBack = useGoBackOr('/home');

  const [aba, setAba] = useState<Aba>('caixa');
  const [filtroCategoria, setFiltroCategoria] = useState<NotificationCategory | null>(null);

  const noArquivo = aba === 'arquivadas';

  const {
    data: notificacoes,
    isLoading,
    isError,
    refetch,
  } = useNotifications({ archived: noArquivo });

  const marcarComoLidaMutation = useMarkNotificationRead();
  const marcarTodasMutation = useMarkAllNotificationsRead();
  const arquivarMutation = useArchiveNotification();
  const desarquivarMutation = useUnarchiveNotification();

  // Só faz sentido escutar enquanto a caixa está aberta — chamado
  // incondicionalmente aqui (regra dos hooks), antes de qualquer return.
  useNotificationsRealtime();

  const lista = notificacoes ?? [];
  const naoLidasCount = lista.filter((notificacao) => !notificacao.isRead).length;

  // Só oferece o chip de categoria que a lista realmente contém — o catálogo
  // de tipos é maior que o que qualquer paciente já recebeu, e um filtro sem
  // conteúdo nenhum seria uma armadilha vazia.
  const categoriasPresentes = CATEGORIAS.filter((categoria) =>
    lista.some((notificacao) => notificacao.category === categoria)
  );
  // Se a categoria selecionada sumiu da lista (troca de aba, refetch), trata
  // como se nada estivesse selecionado — sem isso a lista filtrada ficava
  // vazia e a própria fileira de chips desaparecia junto, sem saída.
  const filtroEfetivo =
    filtroCategoria !== null && categoriasPresentes.includes(filtroCategoria)
      ? filtroCategoria
      : null;
  const listaFiltrada = lista.filter(
    (notificacao) => !filtroEfetivo || notificacao.category === filtroEfetivo
  );
  const naoLidas = listaFiltrada.filter((notificacao) => !notificacao.isRead);
  const anteriores = listaFiltrada.filter((notificacao) => notificacao.isRead);

  const cabecalho = (
    <TabHeader
      eyebrow="CENTRO DE NOTIFICAÇÕES"
      title={noArquivo ? 'Arquivadas' : 'Suas notificações'}
      size="compact"
      onBack={goBack}
      actions={
        !noArquivo &&
        naoLidasCount > 0 && (
          <span
            className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground"
            aria-label={`${naoLidasCount} não lidas`}
          >
            {naoLidasCount}
          </span>
        )
      }
    >
      {/* Arquivar deixou de ser um caminho sem volta: o arquivo é uma aba, e
          cada aviso guardado pode voltar para a caixa. */}
      <div
        role="group"
        aria-label="Caixa ou arquivo"
        className="mt-3 flex items-center gap-0.5 rounded-full bg-muted p-[3px]"
      >
        {ABAS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={aba === item.key}
            className={cn(
              // `after`: área de toque de 44px sem mudar o desenho do seletor.
              'relative flex-1 cursor-pointer rounded-full border-none bg-transparent px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-[ease] after:absolute after:inset-x-0 after:-inset-y-[7px]',
              aba === item.key && 'bg-card text-primary-deep shadow-sm'
            )}
            onClick={() => setAba(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!noArquivo && naoLidasCount > 0 && (
        <div className="mt-3 flex justify-end">
          {/* `after`: área de toque de 44px sem mudar o desenho. Sobe 12px, o
              vão até o seletor acima, para não invadir o botão dele. */}
          <button
            type="button"
            className="relative cursor-pointer bg-transparent p-0 text-[13px] font-medium text-primary-deep transition-opacity duration-150 ease-[ease] after:absolute after:inset-x-0 after:-top-3 after:-bottom-[14px] hover:underline"
            onClick={() => marcarTodasMutation.mutate()}
          >
            Marcar todas como lidas
          </button>
        </div>
      )}

      {categoriasPresentes.length > 1 && (
        <ChipRow offset="md" bottom="xs">
          <Tag selected={filtroEfetivo === null} onClick={() => setFiltroCategoria(null)}>
            Todas
          </Tag>
          {categoriasPresentes.map((categoria) => (
            <Tag
              key={categoria}
              selected={filtroEfetivo === categoria}
              onClick={() => setFiltroCategoria(categoria)}
            >
              {NOTIFICATION_CATEGORIES[categoria].label}
            </Tag>
          ))}
        </ChipRow>
      )}
    </TabHeader>
  );

  if (isError) {
    return (
      <TabScreen header={cabecalho}>
        <ErrorState
          title="Não foi possível carregar suas notificações"
          onRetry={() => void refetch()}
        />
      </TabScreen>
    );
  }

  return (
    <TabScreen header={cabecalho}>
      <main className="flex flex-1 flex-col gap-6 px-6 py-5">
        {isLoading ? (
          <NotificationsSkeleton />
        ) : listaFiltrada.length === 0 ? (
          <EmptyState
            title={noArquivo ? 'Nada no arquivo' : 'Nenhuma notificação encontrada'}
            description={
              lista.length === 0
                ? noArquivo
                  ? 'O que você arquivar aparece aqui, e pode voltar para a caixa quando quiser.'
                  : 'Você ainda não recebeu nenhuma notificação.'
                : 'Tente ajustar o filtro selecionado.'
            }
          />
        ) : noArquivo ? (
          <div className="flex flex-col gap-2">
            {listaFiltrada.map((item) => (
              <NotificationItem
                notificacao={item}
                key={item.id}
                onLida={marcarComoLidaMutation.mutate}
                onArquivar={arquivarMutation.mutate}
                onDesarquivar={desarquivarMutation.mutate}
              />
            ))}
          </div>
        ) : (
          <>
            {naoLidas.length > 0 && (
              <section className="flex flex-col">
                <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                  NÃO LIDAS
                </h2>
                <div className="flex flex-col gap-2">
                  {naoLidas.map((item) => (
                    <NotificationItem
                      notificacao={item}
                      key={item.id}
                      onLida={marcarComoLidaMutation.mutate}
                      onArquivar={arquivarMutation.mutate}
                    />
                  ))}
                </div>
              </section>
            )}

            {anteriores.length > 0 && (
              <section className="flex flex-col">
                <h2 className="mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
                  ANTERIORES
                </h2>
                <div className="flex flex-col gap-2">
                  {anteriores.map((item) => (
                    <NotificationItem
                      notificacao={item}
                      key={item.id}
                      onLida={marcarComoLidaMutation.mutate}
                      onArquivar={arquivarMutation.mutate}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </TabScreen>
  );
}
