import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorState from '../../components/ui/error-state';
import Skeleton from '../../components/ui/skeleton';
import { useAgendaWeek } from '../../hooks/useSchedule';
import { addDays, formatShortDate, formatWeekdayShort, isSameDay, capitalizeFirst } from '../../utils/date';
import { filterByType, isCalledOff } from '../../utils/appointments';

const SWIPE_THRESHOLD = 50;

interface ScheduleWeekViewProps {
  /** Código do tipo escolhido no filtro, ou `null` para todos. */
  typeCode: string | null;
}

/** Carregamento com a forma dos cartões de dia. */
function WeekSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando a semana">
      {[0, 1, 2].map((dia) => (
        <div key={dia} className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="px-3.5 py-3">
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ScheduleWeekView({ typeCode }: ScheduleWeekViewProps) {
  const [dataReferencia, setDataReferencia] = useState<Date>(() => new Date());
  const touchStartX = useRef(0);

  const {
    data: dias = [],
    isLoading: carregando,
    isError: erro,
    refetch: recarregar,
  } = useAgendaWeek(dataReferencia);

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
            Semana de {formatShortDate(dias[0].date)} a {formatShortDate(dias[6].date)}
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
          <WeekSkeleton />
        ) : erro ? (
          <ErrorState
            title="Não foi possível carregar a semana"
            description="Verifique sua conexão e tente novamente."
            onRetry={() => void recarregar()}
          />
        ) : (
          <div className="flex flex-col gap-2">
            {dias.map((item, index) => {
              const hoje = isSameDay(item.date, new Date());
              const diaPassado = item.date < hojeZerado;
              const eventos = filterByType(item.events, typeCode);

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
                        {capitalizeFirst(formatWeekdayShort(item.date))}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {formatShortDate(item.date)}
                      </span>
                      {hoje && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 text-[9px] text-primary-foreground">
                          hoje
                        </span>
                      )}
                    </div>
                    <span className="text-[12px] whitespace-nowrap text-muted-foreground">
                      {eventos.length} evento{eventos.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {eventos.length === 0 ? (
                    <p className="px-3.5 py-3 text-[12px] text-muted-foreground italic">
                      {typeCode ? 'Sem compromissos deste tipo' : 'Sem compromissos'}
                    </p>
                  ) : (
                    <ul className="flex flex-col">
                      {eventos.map((evento) => {
                        const Icon = evento.icon;
                        // Cancelado e remarcado continuam visíveis, mas
                        // riscados e nomeados: sumir com eles esconderia uma
                        // mudança que o paciente precisa perceber.
                        const desmarcado = isCalledOff(evento.statusCode);

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
                                {evento.time}
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
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    'block text-[13px] text-foreground',
                                    (diaPassado || desmarcado) && 'text-muted-foreground line-through'
                                  )}
                                >
                                  {evento.title}
                                </span>
                                {(evento.typeLabel || desmarcado) && (
                                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                    {[desmarcado ? evento.statusLabel : null, evento.typeLabel]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </span>
                                )}
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
