import { CalendarDays } from 'lucide-react';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import LoadMore from '../../components/ui/load-more';
import SectionHeading from '../../components/ui/section-heading';
import Skeleton from '../../components/ui/skeleton';
import AppointmentListItem from './AppointmentListItem';
import { usePastAppointments, useUpcomingAppointments } from '../../hooks/useSchedule';
import { cn } from '../../lib/utils';
import { filterByType } from '../../utils/appointments';

interface ScheduleListViewProps {
  /** Código do tipo escolhido no filtro, ou `null` para todos. */
  typeCode: string | null;
}

/**
 * Carregamento com a forma da lista: a faixa do título de seção (48 px, da
 * borda esquerda da tela até a margem direita, como a faixa carregada) e os
 * cards. A tela já nasce na altura certa: cada barra fica centrada na linha do
 * card carregado — título de 24 px (`text-body`), local de 21 px
 * (`text-body-sm`) e detalhes de 18 px (`text-caption`), com o mesmo `gap`.
 */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando compromissos">
      <Skeleton className="-ml-4 h-12 rounded-l-none rounded-r-lg" />
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((linha) => (
          <div
            key={linha}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="size-6 rounded-sm" />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Skeleton className="my-1 h-4 w-2/5" />
              <Skeleton className="my-[3.5px] h-3.5 w-3/5" />
              <Skeleton className="my-[3px] h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScheduleListView({ typeCode }: ScheduleListViewProps) {
  const {
    data: proximos = [],
    isLoading: carregandoProximos,
    isError: erroProximos,
    refetch: recarregarProximos,
  } = useUpcomingAppointments();

  // O histórico chega em páginas, e o recorte por tipo vai junto para o
  // servidor: filtrar só o que já veio esconderia páginas inteiras.
  const historyQuery = usePastAppointments(typeCode);
  const historico = historyQuery.data ?? [];

  if (carregandoProximos || historyQuery.isLoading) {
    return <ListSkeleton />;
  }

  // Dado em mãos vence o erro: uma página do histórico que falha ao "carregar
  // mais" não pode apagar a lista que já está na tela (o rodapé trata dela).
  if (erroProximos || (historyQuery.isError && !historyQuery.data)) {
    return (
      <ErrorState
        title="Não foi possível carregar sua agenda"
        description="Verifique sua conexão e tente novamente."
        onRetry={() => {
          void recarregarProximos();
          void historyQuery.refetch();
        }}
      />
    );
  }

  // As duas leituras têm "agora" diferentes (o histórico fixa o dele ao abrir um
  // tipo, os próximos só se releem de tempos em tempos): um compromisso que
  // acabou de terminar pode vir nas duas. Fica o do histórico, que é o mais novo.
  const idsNoHistorico = new Set(historico.map((item) => item.id));
  const proximosFiltrados = filterByType(proximos, typeCode).filter(
    (item) => !idsNoHistorico.has(item.id)
  );

  // Títulos de seção na faixa do guia (`SectionHeading`, que já desfaz os
  // 16 px da margem da tela); 32 px entre as seções.
  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="schedule-upcoming-title" className="flex flex-col gap-3">
        <SectionHeading id="schedule-upcoming-title">Próximos</SectionHeading>
        {proximosFiltrados.length === 0 ? (
          <EmptyState
            // Sem a touceira de flores: a Agenda já tem o gramado florido no pé
            // da tela, e o guia pede uma pintura por tela — as duas juntas
            // pesavam. Fica o ícone do calendário.
            icon={CalendarDays}
            // Com o histórico logo abaixo, o aviso fica compacto: com a altura
            // de meia tela do estado vazio, o histórico só começava depois de
            // um vão quase em branco.
            className={historico.length > 0 ? 'min-h-0 py-6' : undefined}
            title={typeCode ? 'Nenhum compromisso deste tipo' : 'Nenhum compromisso agendado'}
            description={
              typeCode
                ? 'Escolha outro tipo ou toque em Todos para ver a agenda inteira.'
                : 'Quando você tiver uma consulta ou sessão marcada, ela aparece aqui.'
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {proximosFiltrados.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>
        )}
      </section>

      {historico.length > 0 && (
        <section
          aria-labelledby="schedule-history-title"
          // Lista ainda do tipo anterior: esmaecida e sem toque até a nova
          // chegar — mesmo tratamento do Diário e das Orientações.
          className={cn(
            'flex flex-col gap-3 transition-opacity duration-150 ease-[ease]',
            historyQuery.isPlaceholderData && 'pointer-events-none opacity-60'
          )}
          aria-busy={historyQuery.isPlaceholderData}
        >
          <SectionHeading id="schedule-history-title">Histórico</SectionHeading>
          <div className="flex flex-col gap-2">
            {historico.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>

          {/* `mt-3` com o `gap` dá os 24 px entre a lista e o rodapé. */}
          <LoadMore
            className="mt-3"
            hasMore={historyQuery.hasNextPage}
            isLoading={historyQuery.isFetchingNextPage}
            hasError={historyQuery.isFetchNextPageError}
            onLoadMore={() => void historyQuery.fetchNextPage()}
            label="Carregar mais compromissos"
            errorTitle="Não foi possível carregar mais compromissos"
          />
        </section>
      )}
    </div>
  );
}
