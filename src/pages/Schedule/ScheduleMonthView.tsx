import { useRef, useState, type CSSProperties, type TouchEvent } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import Loading from '../../components/ui/loading';
import { getMesAgenda } from '../../services/mockApi';
import { isSameDay, capitalizeFirst } from '../../utils/date';
import { TIPOS } from '../../utils/agenda';

const SWIPE_THRESHOLD = 50;
const DIAS_SEMANA = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export default function ScheduleMonthView() {
  const [dataReferencia, setDataReferencia] = useState<Date>(new Date());
  const [diaSelecionado, setDiaSelecionado] = useState<Date | null>(null);
  const touchStartX = useRef(0);

  const { data: celulas = [], isLoading: carregando } = useQuery({
    queryKey: ['agenda-month', dataReferencia],
    queryFn: () => getMesAgenda(dataReferencia),
  });

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
    ? celulas.find((item) => item && isSameDay(item.data, diaSelecionado))
    : null;

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
        <Loading inline />
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

              const isHoje = isSameDay(item.data, new Date());

              return (
                <button
                  key={item.data.toISOString()}
                  type="button"
                  className={cn(
                    'flex aspect-square cursor-pointer flex-col items-center rounded-lg border border-transparent bg-[color-mix(in_srgb,var(--color-card)_40%,transparent)] p-1 transition-[border-color,background-color] duration-150 ease-[ease]',
                    item.eventos.length > 0 && 'bg-card',
                    isHoje && 'border-primary bg-[color-mix(in_srgb,var(--color-primary)_5%,transparent)]'
                  )}
                  onClick={() => setDiaSelecionado(item.data)}
                >
                  <span className="text-[11px] font-medium text-foreground">{item.data.getDate()}</span>
                  <div className="mt-0.5 flex flex-wrap justify-center gap-0.5">
                    {item.eventos.slice(0, 3).map((evento) => (
                      <span
                        key={evento.id}
                        className="h-1.5 w-1.5 rounded-full"
                        // Cor do marcador varia por categoria do evento
                        // (`colorVar`) — sem equivalente estático no Tailwind.
                        style={{ background: evento.colorVar } as CSSProperties}
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
        <div className="mt-5">
          <h3 className="mb-2 text-[13px] font-semibold text-foreground">
            {diaSelecionado.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}
          </h3>

          {celulaSelecionada && celulaSelecionada.eventos.length > 0 ? (
            <div className="flex flex-col">
              {celulaSelecionada.eventos.map((evento) => {
                const Icone = evento.icon;
                return (
                  <Link
                    key={evento.id}
                    to={`/agenda/${evento.id}`}
                    className="mb-1.5 flex items-center gap-2 rounded-lg border border-border p-2.5 transition-colors duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,transparent)]"
                  >
                    <span className="min-w-[40px] text-[12px] font-medium text-foreground">
                      {evento.hora}
                    </span>
                    <Icone size={14} color={evento.colorVar} aria-hidden="true" />
                    <span className="flex-1 text-[13px] text-foreground">{evento.titulo}</span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-[12px] text-muted-foreground italic">Sem compromissos neste dia.</p>
          )}
        </div>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <p className="mb-2 text-[10px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          LEGENDA
        </p>
        <div className="flex flex-col gap-1.5">
          {Object.values(TIPOS).map((tipo) => (
            <div key={tipo.label} className="flex items-center gap-2 text-[12px] text-muted-foreground">
              <span
                className="h-2 w-2 flex-shrink-0 rounded-full"
                // Cor da legenda varia por tipo de compromisso (`colorVar`) —
                // sem equivalente estático no Tailwind.
                style={{ background: tipo.colorVar } as CSSProperties}
              />
              {tipo.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
