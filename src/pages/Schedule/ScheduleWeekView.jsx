import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Loading from '../../components/Loading';
import { getSemanaAgenda } from '../../services/mockApi';
import { addDays, formatShortDate, formatWeekdayShort, isSameDay, capitalizeFirst } from '../../utils/date';
import { cx } from '../../utils/classNames';
import styles from './ScheduleWeekView.module.css';

const SWIPE_THRESHOLD = 50;

export default function ScheduleWeekView() {
  const [dataReferencia, setDataReferencia] = useState(() => new Date());
  const [dias, setDias] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const touchStartX = useRef(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);

    getSemanaAgenda(dataReferencia).then((data) => {
      if (!ativo) return;
      setDias(data);
      setCarregando(false);
    });

    return () => {
      ativo = false;
    };
  }, [dataReferencia]);

  function irParaSemanaAnterior() {
    setDataReferencia((atual) => addDays(atual, -7));
  }

  function irParaProximaSemana() {
    setDataReferencia((atual) => addDays(atual, 7));
  }

  function handleTouchStart(event) {
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event) {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;

    if (deltaX < -SWIPE_THRESHOLD) {
      irParaProximaSemana();
    } else if (deltaX > SWIPE_THRESHOLD) {
      irParaSemanaAnterior();
    }
  }

  const hojeZerado = new Date();
  hojeZerado.setHours(0, 0, 0, 0);

  return (
    <div className={styles.page}>
      <div className={styles.navRow}>
        <button
          type="button"
          className={styles.navButton}
          onClick={irParaSemanaAnterior}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        {dias.length === 7 && (
          <p className={styles.rangeLabel}>
            Semana de {formatShortDate(dias[0].data)} a {formatShortDate(dias[6].data)}
          </p>
        )}

        <button
          type="button"
          className={styles.navButton}
          onClick={irParaProximaSemana}
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div
        className={styles.weekContainer}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {carregando ? (
          <Loading inline />
        ) : (
          <div className={styles.list}>
            {dias.map((item, index) => {
              const hoje = isSameDay(item.data, new Date());
              const diaPassado = item.data < hojeZerado;

              return (
                <div key={index} className={styles.dayCard}>
                  <div className={cx(styles.dayHeader, hoje && styles.dayHeaderToday)}>
                    <div className={styles.dayHeaderLeft}>
                      <span className={cx(styles.dayName, hoje && styles.dayNameToday)}>
                        {capitalizeFirst(formatWeekdayShort(item.data))}
                      </span>
                      <span className={styles.dayDate}>{formatShortDate(item.data)}</span>
                      {hoje && <span className={styles.todayBadge}>hoje</span>}
                    </div>
                    <span className={styles.eventCount}>
                      {item.eventos.length} evento{item.eventos.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {item.eventos.length === 0 ? (
                    <p className={styles.emptyDay}>Sem compromissos</p>
                  ) : (
                    <ul className={styles.eventList}>
                      {item.eventos.map((evento) => {
                        const Icon = evento.icon;

                        return (
                          <li key={evento.id} className={styles.eventItem}>
                            <Link to={`/agenda/${evento.id}`} className={styles.eventLink}>
                              <span className={styles.eventTime}>{evento.hora}</span>
                              <span
                                className={styles.eventIconWrapper}
                                style={{
                                  background: `color-mix(in srgb, ${evento.colorVar} 15%, transparent)`,
                                }}
                              >
                                <Icon size={12} color={evento.colorVar} aria-hidden="true" />
                              </span>
                              <span
                                className={cx(
                                  styles.eventTitle,
                                  diaPassado && styles.eventTitlePassado
                                )}
                              >
                                {evento.titulo}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
