import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorState from '../../components/ui/error-state';
import SectionHeading from '../../components/ui/section-heading';
import Skeleton from '../../components/ui/skeleton';
import { useScheduleMonth, useAppointmentTypes } from '../../hooks/useSchedule';
import { useScheduleViewStore } from '../../stores/scheduleViewStore';
import { isSameDay, capitalizeFirst, getMonthGridDays } from '../../utils/date';
import {
  describeAgendaDay,
  filterByType,
  isCalledOff,
  resolveAppointmentTypeColor,
} from '../../utils/appointments';

const SWIPE_THRESHOLD = 50;
/** Bolinhas por dia na grade; com mais compromissos que isso aparece "+N". */
const MAX_MARKERS_PER_DAY = 3;
/**
 * Com "+N" na célula, só duas bolinhas: três bolinhas e o contador não cabem
 * numa linha em celular de 320 px, e a célula passaria de quadrada.
 */
const MARKERS_BESIDE_COUNTER = 2;
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

interface ScheduleMonthViewProps {
  /** Código do tipo escolhido no filtro, ou `null` para todos. */
  typeCode: string | null;
}

/** As letras dos dias da semana, no alto da grade. */
function WeekdayLetters() {
  return (
    <div className="mb-1 grid grid-cols-7 gap-0.5">
      {DIAS_SEMANA.map((letter, index) => (
        <span key={index} className="text-center text-caption font-medium text-muted-foreground">
          {letter}
        </span>
      ))}
    </div>
  );
}

/**
 * Carregamento com a forma da grade do mês: a mesma linha das letras dos dias
 * e as células do próprio mês (os vazios do começo e um bloco por dia), que
 * pode ter de 4 a 6 semanas. Assim a grade e a legenda não pulam quando o mês
 * chega. As letras ficam fora do leitor de tela: quem avisa o carregamento é
 * o contêiner.
 */
function MonthSkeleton({ reference }: { reference: Date }) {
  return (
    <div className="flex flex-col" aria-busy="true" aria-label="Carregando o mês">
      <div aria-hidden="true">
        <WeekdayLetters />
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {getMonthGridDays(reference).map((day, index) =>
          day ? (
            <Skeleton key={index} className="aspect-square rounded-sm" />
          ) : (
            <div key={index} className="aspect-square" />
          )
        )}
      </div>
    </div>
  );
}

export default function ScheduleMonthView({ typeCode }: ScheduleMonthViewProps) {
  // O mês de hoje — ou, na volta de um compromisso, o mês e o dia que estavam
  // abertos (ver `scheduleViewStore`).
  const [dataReferencia, setDataReferencia] = useState<Date>(
    () => useScheduleViewStore.getState().monthReference ?? new Date()
  );
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(
    () => useScheduleViewStore.getState().selectedDay
  );
  const touchStartX = useRef(0);

  useEffect(() => {
    useScheduleViewStore.getState().update({ monthReference: dataReferencia, selectedDay: diaSelecionado });
  }, [dataReferencia, diaSelecionado]);

  const {
    data: celulas = [],
    isLoading: carregando,
    isError: erro,
    refetch: recarregar,
  } = useScheduleMonth(dataReferencia);

  // A legenda passa a vir do catálogo do banco: são os tipos que realmente
  // existem, com o rótulo que a clínica cadastrou.
  const { data: tipos = [] } = useAppointmentTypes();

  function irParaMesAnterior() {
    setDataReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() - 1, 1));
    setDiaSelecionado(null);
  }

  function irParaProximoMes() {
    setDataReferencia((atual) => new Date(atual.getFullYear(), atual.getMonth() + 1, 1));
    setDiaSelecionado(null);
  }

  function handleTouchStart(event: TouchEvent<HTMLDivElement>) {
    touchStartX.current = event.touches[0].clientX;
  }

  function handleTouchEnd(event: TouchEvent<HTMLDivElement>) {
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
    ? celulas.find((item) => item && isSameDay(item.date, diaSelecionado))
    : null;

  const eventosDoDiaSelecionado = filterByType(celulaSelecionada?.events ?? [], typeCode);

  return (
    <div className="flex flex-col">
      {/* Os mesmos botões e o mesmo rótulo de período da visão semanal: 48 px
          de toque, a seta de 24 px no verde escuro dos ícones e o período em
          `text-body` seminegrito. */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={irParaMesAnterior}
          aria-label="Mês anterior"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>

        <span className="text-body font-semibold text-foreground">{mesAnoLabel}</span>

        <button
          type="button"
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-card text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={irParaProximoMes}
          aria-label="Próximo mês"
        >
          <ChevronRight size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {carregando ? (
        <MonthSkeleton reference={dataReferencia} />
      ) : erro ? (
        <ErrorState
          title="Não foi possível carregar o mês"
          description="Verifique sua conexão e tente novamente."
          onRetry={() => void recarregar()}
        />
      ) : (
        <div
          className="flex flex-col"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <WeekdayLetters />

          <div className="grid grid-cols-7 gap-0.5">
            {celulas.map((item, index) => {
              if (!item) {
                return <div key={`vazio-${index}`} className="aspect-square" />;
              }

              const isHoje = isSameDay(item.date, new Date());
              const isSelected = diaSelecionado ? isSameDay(item.date, diaSelecionado) : false;
              const eventos = filterByType(item.events, typeCode);
              const hasOverflow = eventos.length > MAX_MARKERS_PER_DAY;
              const visibleMarkers = hasOverflow ? MARKERS_BESIDE_COUNTER : eventos.length;
              const overflowCount = eventos.length - visibleMarkers;

              return (
                <button
                  key={item.date.toISOString()}
                  type="button"
                  // As bolinhas são só cor: o leitor de tela ouve a data e
                  // quantos compromissos há, e o detalhe vem ao tocar. O dia
                  // escolhido também é dito (`aria-pressed`), não só pintado.
                  aria-label={describeAgendaDay(item.date, eventos.length, isHoje)}
                  aria-pressed={isSelected}
                  // Hoje: contorno verde escuro sobre o verde-água claro. Dia
                  // escolhido: o preenchimento verde de seleção, com o texto
                  // em `selected-foreground` (nunca branco sobre o verde); se
                  // for hoje, o contorno verde escuro continua. Sobre o verde,
                  // as bolinhas ganham um contorno na cor do card (branco no
                  // tema claro) para não sumirem no verde.
                  // `p-0.5`, borda de 1 px e `leading` 1 mantêm a célula
                  // quadrada nos ~39 px de um celular de 320 px.
                  className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center rounded-sm border border-transparent bg-[color-mix(in_srgb,var(--color-card)_40%,transparent)] p-0.5 transition-[border-color,background-color] duration-150 ease-[ease]',
                    eventos.length > 0 && 'bg-card',
                    isHoje && 'border-primary-deep bg-secondary',
                    isSelected && cn('bg-primary', isHoje ? 'border-primary-deep' : 'border-primary')
                  )}
                  onClick={() => setDiaSelecionado(item.date)}
                >
                  <span
                    className={cn(
                      'text-label/none font-semibold text-foreground',
                      isHoje && 'text-primary-deep',
                      isSelected && 'text-selected-foreground'
                    )}
                  >
                    {item.date.getDate()}
                  </span>
                  <div className="mt-0.5 flex items-center justify-center gap-0.5">
                    {eventos.slice(0, visibleMarkers).map((evento) => (
                      <span
                        key={evento.id}
                        className={cn('h-1.5 w-1.5 rounded-full', isSelected && 'ring-1 ring-card')}
                        // A cor do TIPO, a mesma da legenda — varia por tipo,
                        // sem equivalente estático no Tailwind.
                        style={
                          {
                            background: resolveAppointmentTypeColor(evento.typeCode, evento.typeColor),
                          } as CSSProperties
                        }
                      />
                    ))}
                    {hasOverflow && (
                      <span
                        className={cn(
                          'text-caption/none font-medium text-muted-foreground',
                          isSelected && 'text-selected-foreground'
                        )}
                        aria-hidden="true"
                      >
                        +{overflowCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* O dia escolhido leva o título de seção na faixa do guia, como a lista e
          as Notificações (`SectionHeading`, que já desfaz os 16 px da margem da
          tela). O espaço até a lista vem do `gap`: o reset global zera a margem
          do `h2`. 32 px acima, a separação entre seções do guia. */}
      {diaSelecionado && (
        <div className="mt-8 flex flex-col gap-3">
          <SectionHeading>
            {diaSelecionado.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </SectionHeading>

          {eventosDoDiaSelecionado.length > 0 ? (
            <div className="flex flex-col gap-2">
              {eventosDoDiaSelecionado.map((evento) => {
                const Icone = evento.icon;
                // Riscado e nomeado, como na visão semanal: o que foi
                // cancelado ou remarcado continua à vista, sem parecer valer.
                const desmarcado = isCalledOff(evento.statusCode);

                // O card de lista do guia, com o ícone solto no verde escuro.
                return (
                  <Link
                    key={evento.id}
                    to={`/agenda/${evento.id}`}
                    className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm transition-colors duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]"
                  >
                    <span className="min-w-12 text-label font-semibold text-foreground tabular-nums">
                      {evento.time}
                    </span>
                    <Icone
                      size={24}
                      strokeWidth={2}
                      aria-hidden="true"
                      className={cn('shrink-0 text-primary-deep', desmarcado && 'text-muted-foreground')}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-body font-semibold text-foreground',
                          desmarcado && 'text-muted-foreground line-through'
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
                );
              })}
            </div>
          ) : (
            <p className="text-body-sm text-muted-foreground">
              {typeCode ? 'Sem compromissos deste tipo neste dia.' : 'Sem compromissos neste dia.'}
            </p>
          )}
        </div>
      )}

      {/* A cor de cada tipo é funcional (o marcador do dia) e vem sempre com o
          nome ao lado, na legenda. */}
      <div className="mt-8 flex flex-col gap-3 border-t border-border pt-4">
        <h2 className="text-label font-semibold text-foreground">Legenda</h2>
        <div className="flex flex-col gap-2">
          {tipos.map((tipo) => (
            <div key={tipo.id} className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <span
                className="size-2.5 shrink-0 rounded-full"
                // Cor da legenda varia por tipo de compromisso — sem
                // equivalente estático no Tailwind.
                style={
                  {
                    background: resolveAppointmentTypeColor(tipo.code, tipo.color),
                  } as CSSProperties
                }
              />
              {tipo.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
