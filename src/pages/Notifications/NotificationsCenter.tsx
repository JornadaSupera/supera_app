import { useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import Tag from '../../components/ui/tag';
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
import { CATEGORIAS_NOTIFICACAO } from '../../utils/notifications';
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
  const navigate = useNavigate();

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
  const naoLidasCount = lista.filter((notificacao) => !notificacao.lida).length;

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
  const naoLidas = listaFiltrada.filter((notificacao) => !notificacao.lida);
  const anteriores = listaFiltrada.filter((notificacao) => notificacao.lida);

  const cabecalho = (
    <TabHeader
      eyebrow="CENTRO DE NOTIFICAÇÕES"
      title={noArquivo ? 'Arquivadas' : 'Suas notificações'}
      size="compact"
      onBack={() => navigate('/home')}
      actions={
        !noArquivo &&
        naoLidasCount > 0 && (
          <span
            className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-[var(--color-supera-empatia)] px-1.5 text-[11px] font-semibold text-white"
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
              'flex-1 cursor-pointer rounded-full border-none bg-transparent px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-[ease]',
              aba === item.key && 'bg-card text-primary shadow-sm'
            )}
            onClick={() => setAba(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!noArquivo && naoLidasCount > 0 && (
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

      {categoriasPresentes.length > 1 && (
        <div className="mt-4 flex flex-nowrap gap-2 overflow-x-auto pb-[2px]">
          <Tag selected={filtroEfetivo === null} onClick={() => setFiltroCategoria(null)}>
            Todas
          </Tag>
          {categoriasPresentes.map((categoria) => (
            <Tag
              key={categoria}
              selected={filtroEfetivo === categoria}
              onClick={() => setFiltroCategoria(categoria)}
            >
              {CATEGORIAS_NOTIFICACAO[categoria].label}
            </Tag>
          ))}
        </div>
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
