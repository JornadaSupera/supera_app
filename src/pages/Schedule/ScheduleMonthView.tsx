import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorState from '../../components/ui/error-state';
import Skeleton from '../../components/ui/skeleton';
import { useAgendaMonth, useAppointmentTypes } from '../../hooks/useSchedule';
import { isSameDay, capitalizeFirst } from '../../utils/date';
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

/** Carregamento com a forma da grade do mês. */
function MonthSkeleton() {
  return (
    <div className="grid grid-cols-7 gap-0.5" aria-busy="true" aria-label="Carregando o mês">
      {Array.from({ length: 35 }, (_, indice) => (
        <Skeleton key={indice} className="aspect-square rounded-lg" />
      ))}
    </div>
  );
}

export default function ScheduleMonthView({ typeCode }: ScheduleMonthViewProps) {
  const [dataReferencia, setDataReferencia] = useState<Date>(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);
  const touchStartX = useRef(0);

  const {
    data: celulas = [],
    isLoading: carregando,
    isError: erro,
    refetch: recarregar,
  } = useAgendaMonth(dataReferencia);

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
      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-[border-color,color] duration-150 ease-[ease] hover:border-primary hover:text-primary"
          onClick={irParaMesAnterior}
          aria-label="Mês anterior"
        >
          <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
        </button>

        <span className="text-[14px] font-semibold text-foreground">{mesAnoLabel}</span>

        <button
          type="button"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-foreground transition-[border-color,color] duration-150 ease-[ease] hover:border-primary hover:text-primary"
          onClick={irParaProximoMes}
          aria-label="Próximo mês"
        >
          <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      {carregando ? (
        <MonthSkeleton />
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
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {DIAS_SEMANA.map((letra, index) => (
              <span
                key={index}
                className="text-center text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase"
              >
                {letra}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {celulas.map((item, index) => {
              if (!item) {
                return <div key={`vazio-${index}`} className="aspect-square" />;
              }

              const isHoje = isSameDay(item.date, new Date());
              const eventos = filterByType(item.events, typeCode);
              const hasOverflow = eventos.length > MAX_MARKERS_PER_DAY;
              const visibleMarkers = hasOverflow ? MARKERS_BESIDE_COUNTER : eventos.length;
              const overflowCount = eventos.length - visibleMarkers;

              return (
                <button
                  key={item.date.toISOString()}
                  type="button"
                  // As bolinhas são só cor: o leitor de tela ouve a data e
                  // quantos compromissos há, e o detalhe vem ao tocar.
                  aria-label={describeAgendaDay(item.date, eventos.length, isHoje)}
                  className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center rounded-lg border border-transparent bg-[color-mix(in_srgb,var(--color-card)_40%,transparent)] p-1 transition-[border-color,background-color] duration-150 ease-[ease]',
                    eventos.length > 0 && 'bg-card',
                    isHoje && 'border-primary bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]'
                  )}
                  onClick={() => setDiaSelecionado(item.date)}
                >
                  <span className="text-[11px] font-medium text-foreground">{item.date.getDate()}</span>
                  <div className="mt-0.5 flex items-center justify-center gap-0.5">
                    {eventos.slice(0, visibleMarkers).map((evento) => (
                      <span
                        key={evento.id}
                        className="h-1.5 w-1.5 rounded-full"
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
                      <span className="text-[9px] leading-none font-medium text-muted-foreground" aria-hidden="true">
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

      {diaSelecionado && (
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">
            {diaSelecionado.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </h3>

          {eventosDoDiaSelecionado.length > 0 ? (
            <div className="flex flex-col">
              {eventosDoDiaSelecionado.map((evento) => {
                const Icone = evento.icon;
                // Riscado e nomeado, como na visão semanal: o que foi
                // cancelado ou remarcado continua à vista, sem parecer valer.
                const desmarcado = isCalledOff(evento.statusCode);

                return (
                  <Link
                    key={evento.id}
                    to={`/agenda/${evento.id}`}
                    className="mb-1.5 flex items-center gap-2 rounded-lg border border-border p-2.5 transition-colors duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)]"
                  >
                    <span className="min-w-[40px] text-[12px] font-medium text-foreground">
                      {evento.time}
                    </span>
                    <Icone size={14} color={evento.colorVar} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[13px] text-foreground',
                          desmarcado && 'text-muted-foreground line-through'
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
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground italic">
              {typeCode ? 'Sem compromissos deste tipo neste dia.' : 'Sem compromissos neste dia.'}
            </p>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          LEGENDA
        </p>
        <div className="flex flex-col gap-1.5">
          {tipos.map((tipo) => (
            <div key={tipo.id} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
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
