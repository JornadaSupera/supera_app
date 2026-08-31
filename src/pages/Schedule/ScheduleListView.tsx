import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import ErrorState from '../../components/ui/error-state';
import AppointmentListItem from './AppointmentListItem';
import { usePastAppointments, useUpcomingAppointments } from '../../hooks/useSchedule';

export default function ScheduleListView() {
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
    return <Loading />;
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

  return (
    <div className="flex flex-col">
      <section>
        <h3 className="mt-0 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground">
          PRÓXIMOS
        </h3>
        {proximos.length === 0 ? (
          <EmptyState
            title="Nenhum compromisso agendado"
            description="Quando você tiver uma consulta ou sessão marcada, ela aparece aqui."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {proximos.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>
        )}
      </section>

      {historico.length > 0 && (
        <section>
          <h3 className="mt-5 mb-3 text-[12px] font-semibold tracking-[0.05em] text-muted-foreground">
            HISTÓRICO
          </h3>
          <div className="flex flex-col gap-2">
            {historico.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
