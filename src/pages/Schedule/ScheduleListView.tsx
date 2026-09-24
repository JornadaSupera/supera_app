import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import Skeleton from '../../components/ui/skeleton';
import AppointmentListItem from './AppointmentListItem';
import { usePastAppointments, useUpcomingAppointments } from '../../hooks/useSchedule';
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

  const {
    data: historico = [],
    isLoading: carregandoHistorico,
    isError: erroHistorico,
    refetch: recarregarHistorico,
  } = usePastAppointments();

  if (carregandoProximos || carregandoHistorico) {
    return <ListSkeleton />;
  }

  if (erroProximos || erroHistorico) {
    return (
      <ErrorState
        title="Não foi possível carregar sua agenda"
        description="Verifique sua conexão e tente novamente."
        onRetry={() => {
          void recarregarProximos();
          void recarregarHistorico();
        }}
      />
    );
  }

  const proximosFiltrados = filterByType(proximos, typeCode);
  const historicoFiltrado = filterByType(historico, typeCode);

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

      {historicoFiltrado.length > 0 && (
        <section>
          <h3 className="mt-5 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground">
            HISTÓRICO
          </h3>
          <div className="flex flex-col gap-2">
            {historicoFiltrado.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
