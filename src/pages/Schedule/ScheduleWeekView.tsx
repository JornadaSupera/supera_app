import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorState from '../../components/ui/error-state';
import Skeleton from '../../components/ui/skeleton';
import { useScheduleWeek } from '../../hooks/useSchedule';
import { useScheduleViewStore } from '../../stores/scheduleViewStore';
import { addDays, formatShortDate, formatWeekdayShort, isSameDay, capitalizeFirst } from '../../utils/date';
import { filterByType, isCalledOff } from '../../utils/appointments';

const SWIPE_THRESHOLD = 50;

interface ScheduleWeekViewProps {
  /** Código do tipo escolhido no filtro, ou `null` para todos. */
  typeCode: string | null;
}

/**
 * Carregamento com a forma dos cartões de dia, na altura deles: a barra do dia
 * ocupa a linha de 20 px do cabeçalho (`text-label`), e a de baixo a linha de
 * 21 px do "Sem compromissos" (`text-body-sm`).
 */
function WeekSkeleton() {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando a semana">
      {[0, 1, 2].map((dia) => (
        <div key={dia} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <Skeleton className="my-0.5 h-4 w-24" />
            <Skeleton className="h-3 w-16" />
          </div>
          <div className="px-4 py-3">
            <Skeleton className="my-[3.5px] h-3.5 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ScheduleWeekView({ typeCode }: ScheduleWeekViewProps) {
  // A semana de hoje — ou, na volta de um compromisso, a que estava aberta
  // (ver `scheduleViewStore`).
  const [dataReferencia, setDataReferencia] = useState<Date>(
    () => useScheduleViewStore.getState().weekReference ?? new Date()
  );
  const touchStartX = useRef(0);

  useEffect(() => {
    useScheduleViewStore.getState().update({ weekReference: dataReferencia });
  }, [dataReferencia]);

  const {
    data: dias = [],
    isLoading: carregando,
    isError: erro,
    refetch: recarregar,
  } = useScheduleWeek(dataReferencia);

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
      {/* Os mesmos botões de período da visão mensal: 48 px de toque e a seta
          de 24 px no verde escuro dos ícones. O período também tem o rótulo de
          lá, `text-body` em seminegrito; num celular estreito, ele se divide
          em duas linhas iguais (`text-balance`), na altura dos botões. */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={irParaSemanaAnterior}
          aria-label="Semana anterior"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>

        {dias.length === 7 && (
          <p className="min-w-0 text-center text-body font-semibold text-balance text-foreground">
            Semana de {formatShortDate(dias[0].date)} a {formatShortDate(dias[6].date)}
          </p>
        )}

        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={irParaProximaSemana}
          aria-label="Próxima semana"
        >
          <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
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
                <div key={index} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                  <div
                    className={cn(
                      'flex items-center justify-between gap-2 border-b border-border px-4 py-3',
                      hoje && 'bg-secondary'
                    )}
                  >
                    <div className="flex items-baseline gap-2">
                      <span
                        className={cn(
                          'text-label font-semibold text-foreground',
                          hoje && 'text-primary-deep'
                        )}
                      >
                        {capitalizeFirst(formatWeekdayShort(item.date))}
                      </span>
                      <span className="text-caption font-medium text-muted-foreground">
                        {formatShortDate(item.date)}
                      </span>
                      {/* Marcador em laranja, o acento de destaque do guia
                          (texto sempre em `on-orange`), no recorte da etiqueta
                          do guia: `text-caption` e 12 px de cada lado. */}
                      {hoje && (
                        <span className="rounded-full bg-orange px-3 py-0.5 text-caption font-semibold text-on-orange">
                          Hoje
                        </span>
                      )}
                    </div>
                    <span className="text-caption font-medium whitespace-nowrap text-muted-foreground">
                      {eventos.length} evento{eventos.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  {eventos.length === 0 ? (
                    <p className="px-4 py-3 text-body-sm text-muted-foreground">
                      {typeCode ? 'Sem compromissos deste tipo' : 'Sem compromissos'}
                    </p>
                  ) : (
                    // `role="list"`: o reset de `list-style` faz o Safari
                    // deixar de anunciar a lista.
                    <ul role="list" className="flex flex-col">
                      {eventos.map((evento) => {
                        const Icon = evento.icon;
                        // Cancelado e remarcado continuam visíveis, mas
                        // riscados e nomeados: sumir com eles esconderia uma
                        // mudança que o paciente precisa perceber. O que é de
                        // um dia que já passou só esmaece: riscado, pareceria
                        // cancelado (o mês também só risca o desmarcado; a
                        // lista não risca, diz a situação no selo).
                        const desmarcado = isCalledOff(evento.statusCode);

                        return (
                          <li
                            key={evento.id}
                            className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-border"
                          >
                            {/* O anel de foco vai para dentro (`-outline-offset-2`):
                                a linha ocupa a largura do cartão, que corta o
                                que passa da borda. O `!` vence o `:focus-visible`
                                global, que fica fora de `@layer`. */}
                            <Link
                              to={`/agenda/${evento.id}`}
                              className="flex min-h-12 items-center gap-3 px-4 py-3 transition-colors duration-150 ease-[ease] hover:bg-muted focus-visible:-outline-offset-2!"
                            >
                              <span className="min-w-12 text-label font-semibold text-foreground tabular-nums">
                                {evento.time}
                              </span>
                              {/* Ícone solto no verde escuro: a agenda usa só o
                                  texto e as cores funcionais. */}
                              <Icon
                                size={24}
                                strokeWidth={2}
                                aria-hidden="true"
                                className={cn(
                                  'shrink-0 text-primary-deep',
                                  (diaPassado || desmarcado) && 'text-muted-foreground'
                                )}
                              />
                              <span className="min-w-0 flex-1">
                                <span
                                  className={cn(
                                    'block text-body font-semibold text-foreground',
                                    (diaPassado || desmarcado) && 'text-muted-foreground',
                                    desmarcado && 'line-through'
                                  )}
                                >
                                  {evento.title}
                                </span>
                                {(evento.typeLabel || desmarcado) && (
                                  <span className="mt-0.5 block text-caption font-medium text-muted-foreground">
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
