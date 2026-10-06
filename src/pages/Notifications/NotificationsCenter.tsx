import { useState } from 'react';
import { cn } from '@/lib/utils';
import Tag from '../../components/ui/tag';
import ChipRow from '../../components/ui/chip-row';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import SectionHeading from '../../components/ui/section-heading';
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

/**
 * Carregamento com a forma da lista de avisos. Na caixa, vem também a faixa
 * inteira do título de seção (48 px, da borda esquerda da tela até a margem
 * direita), como na Agenda: a tela já nasce na altura certa. O arquivo não tem
 * títulos de seção.
 *
 * Cada barra fica centrada na linha do card carregado — título de 24 px
 * (`text-body`), prévia de 21 px (`text-body-sm`) e, no rodapé, a hora de
 * 18 px (`text-caption`) —, e a coluna de arquivar vem à direita.
 */
function NotificationsSkeleton({ withHeading }: { withHeading: boolean }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando notificações">
      {withHeading && <Skeleton className="-ml-4 h-12 rounded-l-none rounded-r-lg" />}
      <div className="flex flex-col gap-2">
        {[0, 1, 2, 3].map((linha) => (
          <div key={linha} className="flex items-stretch rounded-lg border border-border bg-card shadow-sm">
            <div className="flex min-w-0 flex-1 items-start gap-3 p-4">
              <Skeleton className="size-6 rounded-sm" />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <Skeleton className="my-1 h-4 w-1/2" />
                <Skeleton className="my-[3.5px] h-3.5 w-3/4" />
                <Skeleton className="my-[3px] h-3 w-1/4" />
              </div>
            </div>
            <div className="flex w-12 shrink-0 items-center justify-center border-l border-border">
              <Skeleton className="size-6 rounded-sm" />
            </div>
          </div>
        ))}
      </div>
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
      eyebrow="Centro de notificações"
      title={noArquivo ? 'Arquivadas' : 'Suas notificações'}
      size="compact"
      onBack={goBack}
      actions={
        !noArquivo &&
        naoLidasCount > 0 && (
          // O contador de não lidas no laranja dos marcadores do guia, com o
          // texto em `on-orange` — o mesmo das outras marcas de "não lida".
          // O leitor de tela ouve a frase inteira no texto escondido: um
          // `span` sem papel não pode ter `aria-label`, e só o número não diz
          // o que conta.
          <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-full bg-orange px-2 text-caption font-semibold text-on-orange">
            <span aria-hidden="true">{naoLidasCount}</span>
            <span className="sr-only">{naoLidasCount} não lidas</span>
          </span>
        )
      }
    >
      {/* Arquivar deixou de ser um caminho sem volta: o arquivo é uma aba, e
          cada aviso guardado pode voltar para a caixa. O seletor fica 16 px
          abaixo do título, como o da Agenda. */}
      <div
        role="group"
        aria-label="Caixa ou arquivo"
        className="mt-4 flex items-center gap-1 rounded-full bg-muted p-1"
      >
        {ABAS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={aba === item.key}
            className={cn(
              // Botão de 40 px com o texto de rótulo do guia (`text-label`,
              // 14/20); o `after` estende o toque pelos 4 px do trilho, até os
              // 48 px. O fio na opção escolhida: no tema escuro o card e o
              // trilho têm a mesma cor, e a escolha não pode ser só a cor do
              // texto.
              'relative min-h-10 flex-1 cursor-pointer rounded-full border-none bg-transparent px-4 text-label font-semibold text-muted-foreground transition-[background-color,color] duration-150 ease-[ease] after:absolute after:inset-x-0 after:-inset-y-1',
              aba === item.key && 'bg-card text-primary-deep shadow-sm ring-1 ring-border'
            )}
            onClick={() => setAba(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!noArquivo && naoLidasCount > 0 && (
        <div className="mt-1 flex justify-end">
          {/* Link de ação no verde escuro do guia, com os 48 px de toque na
              própria altura do botão. */}
          <button
            type="button"
            className="inline-flex min-h-12 cursor-pointer items-center bg-transparent px-0 text-label font-semibold text-primary-deep transition-opacity duration-150 ease-[ease] hover:underline"
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
      {/* 16 px de margem e 32 px entre as seções, como pede o guia. */}
      <main className="flex flex-1 flex-col gap-8 px-4 pt-6 pb-8">
        {isLoading ? (
          <NotificationsSkeleton withHeading={!noArquivo} />
        ) : listaFiltrada.length === 0 ? (
          <EmptyState
            // A touceira de flores só na caixa vazia de verdade; arquivo vazio
            // e filtro sem resultado ficam com o ícone.
            illustration={!noArquivo && lista.length === 0}
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
            {/* Títulos de seção na faixa do guia (`SectionHeading`, que já
                desfaz os 16 px da margem da tela). */}
            {naoLidas.length > 0 && (
              <section aria-labelledby="notifications-unread-title" className="flex flex-col gap-3">
                <SectionHeading id="notifications-unread-title">Não lidas</SectionHeading>
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
              <section aria-labelledby="notifications-previous-title" className="flex flex-col gap-3">
                <SectionHeading id="notifications-previous-title">Anteriores</SectionHeading>
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
