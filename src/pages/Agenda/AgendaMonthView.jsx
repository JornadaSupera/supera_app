import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Loading from '../../components/Loading';
import { getMesAgenda } from '../../services/mockApi';
import { isSameDay, capitalizeFirst } from '../../utils/date';
import { TIPOS } from '../../utils/agenda';
import { cx } from '../../utils/classNames';
import styles from './AgendaMonthView.module.css';

const SWIPE_THRESHOLD = 50;
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function AgendaMonthView() {
  const [dataReferencia, setDataReferencia] = useState(new Date());
  const [celulas, setCelulas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [diaSelecionado, setDiaSelecionado] = useState(null);
  const touchStartX = useRef(0);

  useEffect(() => {
    let ativo = true;
    setCarregando(true);
    setDiaSelecionado(null);

    getMesAgenda(dataReferencia).then((data) => {
      if (!ativo) return;
      setCelulas(data);
      setCarregando(false);
    });

    return () => {
      ativo = false;
    };
  }, [dataReferencia]);

  function irParaMesAnterior() {
    setDataReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() - 1, 1));
  }

  function irParaProximoMes() {
    setDataReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() + 1, 1));
  }

  function handleTouchStart(event) {
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event) {
    const deltaX = event.changedTouches[0].clientX - touchStartX.current;

    if (deltaX < -SWIPE_THRESHOLD) {
      irParaProximoMes();
    } else if (deltaX > SWIPE_THRESHOLD) {
      irParaMesAnterior();
    }
  }

  const mesAnoLabel = capitalizeFirst(
    dataReferencia.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  );

  const celulaSelecionada = diaSelecionado
    ? celulas.find((item) => item && isSameDay(item.data, diaSelecionado))
    : null;

  return (
    <div className={styles.page}>
      <div className={styles.navRow}>
        <button
          type="button"
          className={styles.navButton}
          onClick={irParaMesAnterior}
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        <span className={styles.navLabel}>{mesAnoLabel}</span>

        <button
          type="button"
          className={styles.navButton}
          onClick={irParaProximoMes}
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {carregando ? (
        <Loading inline />
      ) : (
        <div
          className={styles.calendar}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className={styles.weekdaysRow}>
            {DIAS_SEMANA.map((letra, index) => (
              <span key={index} className={styles.weekdayLabel}>
                {letra}
              </span>
            ))}
          </div>

          <div className={styles.daysGrid}>
            {celulas.map((item, index) => {
              if (!item) {
                return <div key={`vazio-${index}`} className={styles.emptyCell} />;
              }

              const isHoje = isSameDay(item.data, new Date());

              return (
                <button
                  key={item.data.toISOString()}
                  type="button"
                  className={cx(
                    styles.dayCell,
                    item.eventos.length > 0 && styles.dayCellComEventos,
                    isHoje && styles.dayCellHoje
                  )}
                  onClick={() => setDiaSelecionado(item.data)}
                >
                  <span className={styles.dayNumber}>{item.data.getDate()}</span>
                  <div className={styles.dayDots}>
                    {item.eventos.slice(0, 3).map((evento) => (
                      <span
                        key={evento.id}
                        className={styles.dayDot}
                        style={{ background: evento.colorVar }}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {diaSelecionado && (
        <div className={styles.diaSelecionadoSection}>
          <h3 className={styles.diaSelecionadoTitle}>
            {diaSelecionado.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </h3>

          {celulaSelecionada && celulaSelecionada.eventos.length > 0 ? (
            <div className={styles.diaSelecionadoList}>
              {celulaSelecionada.eventos.map((evento) => {
                const Icone = evento.icon;
                return (
                  <Link key={evento.id} to={`/agenda/${evento.id}`} className={styles.eventoCard}>
                    <span className={styles.eventoHora}>{evento.hora}</span>
                    <Icone size={14} color={evento.colorVar} aria-hidden="true" />
                    <span className={styles.eventoTitulo}>{evento.titulo}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className={styles.semCompromissos}>Sem compromissos neste dia.</p>
          )}
        </div>
      )}

      <div className={styles.legenda}>
        <p className={styles.legendaTitulo}>LEGENDA</p>
        <div className={styles.legendaLista}>
          {Object.values(TIPOS).map((tipo) => (
            <div key={tipo.label} className={styles.legendaItem}>
              <span className={styles.legendaDot} style={{ background: tipo.colorVar }} />
              {tipo.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
