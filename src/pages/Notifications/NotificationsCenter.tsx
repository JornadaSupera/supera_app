import { useState } from 'react';
import { useNavigate } from 'react-router';
import { ChevronLeft } from 'lucide-react';
import Tag from '../../components/ui/tag';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Loading from '../../components/ui/loading';
import BottomTab from '../../components/ui/bottom-tab';
import NotificationItem from './NotificationItem';
import {
  useAllNotifications,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
} from '../../hooks/useNotifications';
import { CATEGORIAS_NOTIFICACAO } from '../../utils/notifications';
import type { NotificationCategory } from '../../types';

const CATEGORIAS: NotificationCategory[] = ['agenda', 'chat', 'content', 'alert'];

export default function NotificationsCenter() {
  const navigate = useNavigate();

  const [filtroCategoria, setFiltroCategoria] = useState<NotificationCategory | null>(null);

  const { data: notificacoes, isLoading, isError, refetch } = useAllNotifications();
  const marcarComoLidaMutation = useMarkNotificationRead();
  const marcarTodasMutation = useMarkAllNotificationsRead();

  if (isLoading) {
    return <Loading />;
  }

  if (isError || !notificacoes) {
    return (
      <ErrorState
        title="Não foi possível carregar suas notificações"
        onRetry={() => void refetch()}
      />
    );
  }

  const naoLidasCount = notificacoes.filter((notificacao) => !notificacao.lida).length;
  // Só oferece o chip de categoria que a caixa realmente contém — a lista de
  // tipos cadastrados é maior que o que qualquer paciente já recebeu, e um
  // filtro sem conteúdo nenhum seria uma armadilha vazia.
  const categoriasPresentes = CATEGORIAS.filter((categoria) =>
    notificacoes.some((notificacao) => notificacao.category === categoria)
  );
  // Se a categoria selecionada sumiu da caixa (um refetch mudou o conjunto de
  // notificações), trata como se nada estivesse selecionado — sem isso a
  // lista filtrada ficava vazia e a própria fileira de chips (inclusive o
  // "Todas" que zeraria o filtro) desaparecia junto, sem saída pro usuário.
  const filtroEfetivo =
    filtroCategoria !== null && categoriasPresentes.includes(filtroCategoria)
      ? filtroCategoria
      : null;
  const listaFiltrada = notificacoes.filter(
    (notificacao) => !filtroEfetivo || notificacao.category === filtroEfetivo
  );
  const naoLidas = listaFiltrada.filter((notificacao) => !notificacao.lida);
  const anteriores = listaFiltrada.filter((notificacao) => notificacao.lida);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-4 backdrop-blur-[8px]">
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
            onClick={() => navigate('/home')}
            aria-label="Voltar"
          >
            <ChevronLeft size={20} strokeWidth={2} />
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
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 py-5">
        {listaFiltrada.length === 0 ? (
          <EmptyState
            title="Nenhuma notificação encontrada"
            description={
              notificacoes.length === 0
                ? 'Você ainda não recebeu nenhuma notificação.'
                : 'Tente ajustar o filtro selecionado.'
            }
            iconTone={undefined}
            actionLabel={undefined}
            onAction={undefined}
          />
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
