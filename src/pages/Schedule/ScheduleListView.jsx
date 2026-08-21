import { useEffect, useState } from 'react';
import Loading from '../../components/Loading';
import EmptyState from '../../components/EmptyState';
import AppointmentListItem from './AppointmentListItem';
import { getProximosCompromissos, getHistoricoCompromissos } from '../../services/mockApi';
import styles from './ScheduleListView.module.css';

export default function ScheduleListView() {
  const [carregando, setCarregando] = useState(true);
  const [proximos, setProximos] = useState([]);
  const [historico, setHistorico] = useState([]);

  useEffect(() => {
    let ativo = true;

    async function carregar() {
      setCarregando(true);
      const [proximosData, historicoData] = await Promise.all([
        getProximosCompromissos(),
        getHistoricoCompromissos(),
      ]);

      if (!ativo) return;
      setProximos(proximosData);
      setHistorico(historicoData);
      setCarregando(false);
    }

    carregar();

    return () => {
      ativo = false;
    };
  }, []);

  if (carregando) {
    return <Loading />;
  }

  return (
    <div className={styles.wrapper}>
      <section>
        <h3 className={styles.eyebrowFirst}>PRÓXIMOS</h3>
        {proximos.length === 0 ? (
          <EmptyState
            title="Nenhum compromisso agendado"
            description="Quando você tiver uma consulta ou sessão marcada, ela aparece aqui."
          />
        ) : (
          <div className={styles.list}>
            {proximos.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>
        )}
      </section>

      {historico.length > 0 && (
        <section>
          <h3 className={styles.eyebrow}>HISTÓRICO</h3>
          <div className={styles.list}>
            {historico.map((item) => (
              <AppointmentListItem compromisso={item} key={item.id} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
