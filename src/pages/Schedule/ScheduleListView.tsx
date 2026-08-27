import { useQuery } from '@tanstack/react-query';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import AppointmentListItem from './AppointmentListItem';
import { getProximosCompromissos, getHistoricoCompromissos } from '../../services/mockApi';

export default function ScheduleListView() {
  const { data: proximos = [], isLoading: carregandoProximos } = useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: getProximosCompromissos,
  });

  const { data: historico = [], isLoading: carregandoHistorico } = useQuery({
    queryKey: ['appointments', 'history'],
    queryFn: getHistoricoCompromissos,
  });

  const carregando = carregandoProximos || carregandoHistorico;

  if (carregando) {
    return <Loading />;
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
