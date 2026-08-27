import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Loading from '../../components/ui/loading';
import { getSemanaAgenda } from '../../services/mockApi';
import { addDays, formatShortDate, formatWeekdayShort, isSameDay, capitalizeFirst } from '../../utils/date';

const SWIPE_THRESHOLD = 50;

export default function ScheduleWeekView() {
  const [dataReferencia, setDataReferencia] = useState<Date>(() => new Date());
  const touchStartX = useRef(0);

  const { data: dias = [], isLoading: carregando } = useQuery({
    queryKey: ['agenda-week', dataReferencia],
    queryFn: () => getSemanaAgenda(dataReferencia),
  });

  function irParaSemanaAnterior() {
    setDataReferencia((atual) => addDays(atual, -7));
  }

  function irParaProximaSemana() {
    setDataReferencia((atual) => addDays(atual, 7));
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
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
    <div className="flex flex-col">
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={irParaSemanaAnterior}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        {dias.length === 7 && (
          <p className="text-[13px] text-muted-foreground">
            Semana de {formatShortDate(dias[0].data)} a {formatShortDate(dias[6].data)}
          </p>
        )}

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={irParaProximaSemana}
          aria-label="Próxima semana"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <div
        className="[touch-action:pan-y]"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {carregando ? (
          <Loading inline />
        ) : (
          <div className="flex flex-col gap-2">
            {dias.map((item, index) => {
              const hoje = isSameDay(item.data, new Date());
              const diaPassado = item.data < hojeZerado;

              return (
                <div key={index} className="overflow-hidden rounded-xl border border-border bg-card">
                  <div
                    className={cn(
                      'flex items-center justify-between border-b border-border px-3.5 py-2',
                      hoje && 'bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]'
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'text-[14px] font-semibold text-foreground',
                          hoje && 'text-primary'
                        )}
                      >
                        {capitalizeFirst(formatWeekdayShort(item.data))}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {formatShortDate(item.data)}
                      </span>
                      {hoje && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
                          hoje
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] whitespace-nowrap text-muted-foreground">
                      {item.eventos.length} evento{item.eventos.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {item.eventos.length === 0 ? (
                    <p className="px-3.5 py-3 text-[12px] text-muted-foreground italic">
                      Sem compromissos
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {item.eventos.map((evento) => {
                        const Icon = evento.icon;

                        return (
                          <li
                            key={evento.id}
                            className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border"
                          >
                            <Link
                              to={`/agenda/${evento.id}`}
                              className="flex items-center gap-2 px-3.5 py-2.5 transition-colors duration-150 ease-[ease] hover:bg-muted"
                            >
                              <span className="min-w-[40px] font-mono text-[12px] font-medium text-foreground">
                                {evento.hora}
                              </span>
                              <span
                                className="flex items-center justify-center rounded-md p-[5px]"
                                // Cor de fundo do marcador varia por categoria do
                                // evento (`colorVar`) — sem equivalente estático.
                                style={
                                  {
                                    background: `color-mix(in srgb, ${evento.colorVar} 15%, transparent)`,
                                  } as CSSProperties
                                }
                              >
                                <Icon size={12} color={evento.colorVar} aria-hidden="true" />
                              </span>
                              <span
                                className={cn(
                                  'flex-1 text-[13px] text-foreground',
                                  diaPassado && 'text-muted-foreground line-through'
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
