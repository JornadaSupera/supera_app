import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import LoadMore from '../../components/ui/load-more';
import Skeleton from '../../components/ui/skeleton';
import AppointmentListItem from './AppointmentListItem';
import { usePastAppointments, useUpcomingAppointments } from '../../hooks/useSchedule';
import { cn } from '../../lib/utils';
import { filterByType } from '../../utils/appointments';

interface ScheduleListViewProps {
  /** Código do tipo escolhido no filtro, ou `null` para todos. */
  typeCode: string | null;
}

/** Carregamento com a forma da lista: a tela já nasce na altura certa. */
function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando compromissos">
      {[0, 1, 2].map((linha) => (
        <div
          key={linha}
          className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5"
        >
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="mt-2 h-3 w-3/5" />
            <Skeleton className="mt-2 h-2.5 w-1/3" />
          </div>
        </div>
      ))}
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

  return (
    <div className="flex flex-col">
      <section>
        <h3 className="mt-0 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground">
          PRÓXIMOS
        </h3>
        {proximosFiltrados.length === 0 ? (
          <EmptyState
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
          // Lista ainda do tipo anterior: esmaecida e sem toque até a nova
          // chegar — mesmo tratamento do Diário e das Orientações.
          className={cn(
            'transition-opacity duration-150 ease-[ease]',
            historyQuery.isPlaceholderData && 'pointer-events-none opacity-60'
          )}
          aria-busy={historyQuery.isPlaceholderData}
        >
          <h3 className="mt-5 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground">
            HISTÓRICO
          </h3>
          <div className="flex flex-col gap-2">
            {historico.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>

          <LoadMore
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
