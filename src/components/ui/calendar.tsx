import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  addDays,
  addMonths,
  addYears,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  getDay,
  getDaysInMonth,
  isAfter,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { capitalizeFirst, parseDateOnly, todayInClinicTimeZone, toDateKey } from '../../utils/date';

type CalendarView = 'days' | 'months' | 'years';

export interface CalendarProps {
  /** Dia escolhido, ou `null` quando ainda não há. */
  selected: Date | null;
  onSelect: (date: Date) => void;
  /** Onde o calendário abre quando não há dia escolhido. Padrão: hoje. */
  defaultMonth?: Date;
  /** Primeiro e último dia que podem ser escolhidos. Os de fora ficam apagados. */
  minDate?: Date;
  maxDate?: Date;
  /** Por onde começar. Para data de nascimento, `years` poupa a volta de décadas mês a mês. */
  startView?: CalendarView;
  /** Leva o foco para dentro ao montar — o calendário abre numa folha por cima da tela. */
  autoFocus?: boolean;
  className?: string;
}

/** Domingo a sábado, como no calendário brasileiro e no resto do app. */
const WEEK = Array.from({ length: 7 }, (_, index) => new Date(2023, 0, 1 + index));
const MONTHS = Array.from({ length: 12 }, (_, index) => new Date(2000, index, 1));
const DEFAULT_MIN_YEAR = 1900;

/** Altura fixa da área de conteúdo: trocar de visão não pode fazer a folha pular. */
const CONTENT_HEIGHT = 'h-[300px]';

const cellBase =
  'flex cursor-pointer items-center justify-center rounded-full border-none bg-transparent tabular-nums text-foreground transition-[background-color,color,transform] duration-150 ease-[ease] hover:bg-muted active:scale-95 disabled:cursor-not-allowed disabled:text-muted-foreground/40 disabled:hover:bg-transparent disabled:active:scale-100 motion-reduce:transition-none';
const cellToday = 'font-semibold ring-1 ring-primary ring-inset';
const cellSelected =
  'bg-primary font-semibold text-selected-foreground shadow-sm hover:bg-primary';

function clampDate(date: Date, min?: Date, max?: Date): Date {
  if (min && isBefore(date, min)) return min;
  if (max && isAfter(date, max)) return max;
  return date;
}

/** Mesmo dia do mês em outro mês, sem estourar (31 → último dia do mês curto). */
function sameDayInMonth(day: Date, monthStart: Date): Date {
  return new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    Math.min(day.getDate(), getDaysInMonth(monthStart))
  );
}

interface NavButtonProps {
  direction: 'previous' | 'next';
  label: string;
  disabled: boolean;
  onClick: () => void;
}

function NavButton({ direction, label, disabled, onClick }: NavButtonProps) {
  const Icon = direction === 'previous' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent motion-reduce:transition-none"
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
    </button>
  );
}

/**
 * Calendário em português, nas cores do app: dia escolhido em verde (a cor
 * principal), hoje com aro verde e o resto em preto sobre o fundo.
 *
 * Tem três visões — dias, meses e anos — porque quem nasceu em 1958 não pode
 * chegar lá voltando um mês por vez: tocar no mês/ano do cabeçalho abre a
 * lista de anos, depois a de meses, depois os dias.
 *
 * Teclado, na grade de dias: setas movem o foco, `Home`/`End` vão ao começo e
 * ao fim da semana, `PageUp`/`PageDown` trocam o mês (com `Shift`, o ano) e
 * `Enter`/`Espaço` escolhem. Nas listas de meses e anos, as setas andam pela
 * grade.
 */
export default function Calendar({
  selected,
  onSelect,
  defaultMonth,
  minDate,
  maxDate,
  startView = 'days',
  autoFocus = false,
  className,
}: CalendarProps) {
  const min = minDate ? startOfDay(minDate) : undefined;
  const max = maxDate ? startOfDay(maxDate) : undefined;
  // Hoje no fuso da clínica, o mesmo referencial do limite máximo que as telas
  // passam (`todayInClinicTimeZone`): pelo relógio do aparelho, das 21h em
  // diante "hoje" seria um dia depois do último dia permitido.
  const today = parseDateOnly(todayInClinicTimeZone());

  const initialDay = clampDate(selected ?? defaultMonth ?? today, min, max);
  const [view, setView] = useState<CalendarView>(startView);
  const [month, setMonth] = useState(() => startOfMonth(initialDay));
  // O dia que recebe o Tab (foco "rolante"): só um dia da grade é tabulável, e
  // as setas levam o foco dali. Sem isto, Tab atravessaria trinta botões.
  const [focusedDay, setFocusedDay] = useState(initialDay);

  const contentRef = useRef<HTMLDivElement>(null);
  const yearsRef = useRef<HTMLDivElement>(null);
  // Pede o foco para o próximo elemento marcado com `data-autofocus`. Vale na
  // montagem (folha que abre) e depois de trocar de visão pelo teclado, quando
  // o botão focado deixa de existir.
  const focusPending = useRef(autoFocus);

  useEffect(() => {
    if (!focusPending.current) return;
    const target = contentRef.current?.querySelector<HTMLElement>('[data-autofocus="true"]');
    if (!target) return;
    target.focus({ preventScroll: true });
    focusPending.current = false;
  }, [view, month, focusedDay]);

  // A lista de anos é comprida: abre já com o ano escolhido no meio.
  useEffect(() => {
    if (view !== 'years') return;
    const container = yearsRef.current;
    const current = container?.querySelector<HTMLElement>('[data-current-year="true"]');
    if (!container || !current) return;
    container.scrollTop = current.offsetTop - container.clientHeight / 2 + current.clientHeight / 2;
  }, [view]);

  const canGoPreviousMonth = !min || !isBefore(endOfMonth(addMonths(month, -1)), min);
  const canGoNextMonth = !max || !isAfter(startOfMonth(addMonths(month, 1)), max);
  const canGoPreviousYear = !min || !isBefore(endOfYear(addYears(month, -1)), min);
  const canGoNextYear = !max || !isAfter(startOfYear(addYears(month, 1)), max);

  function showMonth(target: Date) {
    const monthStart = startOfMonth(clampDate(target, min, max));
    setMonth(monthStart);
    setFocusedDay(clampDate(sameDayInMonth(focusedDay, monthStart), min, max));
  }

  function switchView(next: CalendarView) {
    focusPending.current = true;
    setView(next);
  }

  function handleDayKeyDown(event: KeyboardEvent<HTMLButtonElement>, day: Date) {
    let next: Date;

    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(day, -1);
        break;
      case 'ArrowRight':
        next = addDays(day, 1);
        break;
      case 'ArrowUp':
        next = addDays(day, -7);
        break;
      case 'ArrowDown':
        next = addDays(day, 7);
        break;
      case 'Home':
        next = startOfWeek(day);
        break;
      case 'End':
        next = endOfWeek(day);
        break;
      case 'PageUp':
        next = event.shiftKey ? addYears(day, -1) : addMonths(day, -1);
        break;
      case 'PageDown':
        next = event.shiftKey ? addYears(day, 1) : addMonths(day, 1);
        break;
      default:
        return;
    }

    event.preventDefault();
    const clamped = clampDate(next, min, max);
    focusPending.current = true;
    setFocusedDay(clamped);
    setMonth(startOfMonth(clamped));
  }

  /** Setas numa lista em grade (meses, anos): move o foco para o vizinho. */
  function handleGridArrows(event: KeyboardEvent<HTMLDivElement>, columns: number) {
    const steps: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -columns,
      ArrowDown: columns,
    };
    const step = steps[event.key];
    if (step === undefined) return;

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    );
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;

    event.preventDefault();
    buttons[Math.min(Math.max(index + step, 0), buttons.length - 1)]?.focus();
  }

  function pickYear(year: number) {
    const target = clampDate(new Date(year, month.getMonth(), 1), min, max);
    showMonth(target);
    switchView('months');
  }

  function pickMonth(monthIndex: number) {
    const target = clampDate(new Date(month.getFullYear(), monthIndex, 1), min, max);
    showMonth(target);
    switchView('days');
  }

  // Visão de dias: semanas de sete células, com espaços antes do dia 1.
  const leadingBlanks = getDay(month);
  const cells: (Date | null)[] = [
    ...Array.from({ length: leadingBlanks }, () => null),
    ...Array.from({ length: getDaysInMonth(month) }, (_, index) => addDays(month, index)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, index) =>
    cells.slice(index * 7, index * 7 + 7)
  );

  // A lista cobre os limites — e o ano aberto, mesmo fora deles: sem `min`, dá
  // para chegar a 1885 pelas setas ou por uma data digitada, e sem esse ano na
  // lista nenhum botão seria o "atual" (nada em destaque, nada recebe o Tab).
  const maxYear = Math.max((max ?? today).getFullYear(), month.getFullYear());
  const minYear = Math.min(
    (min ?? new Date(DEFAULT_MIN_YEAR, 0, 1)).getFullYear(),
    month.getFullYear()
  );
  const years = Array.from({ length: maxYear - minYear + 1 }, (_, index) => maxYear - index);

  const headerLabel =
    view === 'days'
      ? `${capitalizeFirst(format(month, 'LLLL', { locale: ptBR }))} de ${format(month, 'yyyy')}`
      : view === 'months'
        ? format(month, 'yyyy')
        : 'Escolha o ano';

  return (
    <div className={cn('w-full', className)}>
      {/* Anuncia o mês ou o ano novo: as setas trocam a grade, e o rótulo do
          botão do cabeçalho sozinho não é lido de novo. */}
      <span role="status" aria-live="polite" className="sr-only">
        {view === 'years' ? '' : headerLabel}
      </span>

      <div className="mb-2 flex items-center justify-between gap-1">
        {view === 'days' && (
          <NavButton
            direction="previous"
            label="Mês anterior"
            disabled={!canGoPreviousMonth}
            onClick={() => showMonth(addMonths(month, -1))}
          />
        )}
        {view === 'months' && (
          <NavButton
            direction="previous"
            label="Ano anterior"
            disabled={!canGoPreviousYear}
            onClick={() => showMonth(addYears(month, -1))}
          />
        )}
        {view === 'years' && <span aria-hidden="true" className="h-11 w-11 shrink-0" />}

        <button
          type="button"
          aria-expanded={view === 'years'}
          aria-label={
            view === 'years'
              ? `${headerLabel}. Voltar ao calendário`
              : `${headerLabel}. Escolher o ano`
          }
          onClick={() => (view === 'years' ? switchView('days') : switchView('years'))}
          className="inline-flex h-11 min-w-0 cursor-pointer items-center gap-1.5 rounded-full border-none bg-transparent px-2 text-[16px] font-semibold text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted motion-reduce:transition-none"
        >
          <span aria-hidden="true" className="truncate">
            {headerLabel}
          </span>
          <ChevronDown
            size={16}
            strokeWidth={2.5}
            aria-hidden="true"
            className={cn(
              'shrink-0 text-primary transition-transform duration-200 ease-[ease] motion-reduce:transition-none',
              view === 'years' && 'rotate-180'
            )}
          />
        </button>

        {view === 'days' && (
          <NavButton
            direction="next"
            label="Próximo mês"
            disabled={!canGoNextMonth}
            onClick={() => showMonth(addMonths(month, 1))}
          />
        )}
        {view === 'months' && (
          <NavButton
            direction="next"
            label="Próximo ano"
            disabled={!canGoNextYear}
            onClick={() => showMonth(addYears(month, 1))}
          />
        )}
        {view === 'years' && <span aria-hidden="true" className="h-11 w-11 shrink-0" />}
      </div>

      <div
        // Remonta ao trocar de visão ou de mês: é o que dispara a entrada suave.
        key={view === 'days' ? `days-${toDateKey(month)}` : view}
        ref={contentRef}
        className={cn('animate-calendar-in motion-reduce:animate-none', CONTENT_HEIGHT)}
      >
        {view === 'days' && (
          <div role="grid" aria-label={headerLabel} className="w-full">
            <div role="row" className="mb-1 grid grid-cols-7">
              {WEEK.map((weekday) => (
                <span
                  key={weekday.getDay()}
                  role="columnheader"
                  aria-label={format(weekday, 'EEEE', { locale: ptBR })}
                  className="flex h-8 items-center justify-center text-[12px] font-medium text-muted-foreground"
                >
                  {format(weekday, 'EEEEE', { locale: ptBR }).toUpperCase()}
                </span>
              ))}
            </div>

            {weeks.map((week, weekIndex) => (
              <div key={weekIndex} role="row" className="grid grid-cols-7">
                {week.map((day, dayIndex) => {
                  if (!day) return <div key={dayIndex} role="gridcell" aria-hidden="true" />;

                  const isToday = isSameDay(day, today);
                  const isTabbable = isSameDay(day, focusedDay);
                  const isDisabled =
                    (min !== undefined && isBefore(day, min)) ||
                    (max !== undefined && isAfter(day, max));
                  // Uma data fora dos limites (digitada à mão) não é "escolhida".
                  const isSelected = !isDisabled && selected !== null && isSameDay(day, selected);

                  return (
                    <div key={dayIndex} role="gridcell" aria-selected={isSelected}>
                      <button
                        type="button"
                        tabIndex={isTabbable ? 0 : -1}
                        data-autofocus={isTabbable ? 'true' : undefined}
                        disabled={isDisabled}
                        aria-label={format(day, "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        aria-current={isToday ? 'date' : undefined}
                        onClick={() => onSelect(day)}
                        onKeyDown={(event) => handleDayKeyDown(event, day)}
                        className={cn(
                          cellBase,
                          'mx-auto h-11 w-11 text-[15px]',
                          isToday && !isSelected && cellToday,
                          isSelected && cellSelected
                        )}
                      >
                        {day.getDate()}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {view === 'months' && (
          <div
            role="group"
            aria-label={`Meses de ${format(month, 'yyyy')}`}
            onKeyDown={(event) => handleGridArrows(event, 3)}
            className="grid h-full grid-cols-3 content-center gap-x-2 gap-y-3"
          >
            {MONTHS.map((monthDate, index) => {
              const monthStart = new Date(month.getFullYear(), index, 1);
              const isDisabled =
                (min !== undefined && isBefore(endOfMonth(monthStart), min)) ||
                (max !== undefined && isAfter(monthStart, max));
              const isCurrent = !isDisabled && index === month.getMonth();
              const isThisMonth =
                today.getFullYear() === month.getFullYear() && today.getMonth() === index;

              return (
                <button
                  key={index}
                  type="button"
                  disabled={isDisabled}
                  tabIndex={isCurrent ? 0 : -1}
                  data-autofocus={isCurrent ? 'true' : undefined}
                  aria-label={`${format(monthDate, 'LLLL', { locale: ptBR })} de ${format(month, 'yyyy')}`}
                  aria-pressed={isCurrent}
                  onClick={() => pickMonth(index)}
                  className={cn(
                    cellBase,
                    'h-12 w-full text-[15px]',
                    isThisMonth && !isCurrent && cellToday,
                    isCurrent && cellSelected
                  )}
                >
                  {capitalizeFirst(format(monthDate, 'LLL', { locale: ptBR }))}
                </button>
              );
            })}
          </div>
        )}

        {view === 'years' && (
          <div
            ref={yearsRef}
            role="group"
            aria-label="Anos"
            onKeyDown={(event) => handleGridArrows(event, 4)}
            className="relative h-full overflow-y-auto overscroll-contain pr-1"
          >
            <div className="grid grid-cols-4 gap-y-1">
              {years.map((year) => {
                const isCurrent = year === month.getFullYear();
                const isThisYear = year === today.getFullYear();

                return (
                  <button
                    key={year}
                    type="button"
                    tabIndex={isCurrent ? 0 : -1}
                    data-autofocus={isCurrent ? 'true' : undefined}
                    data-current-year={isCurrent ? 'true' : undefined}
                    aria-pressed={isCurrent}
                    onClick={() => pickYear(year)}
                    className={cn(
                      cellBase,
                      // Contorno para dentro: a lista rola, e um contorno para
                      // fora seria cortado nas bordas dela.
                      'h-11 w-full text-[15px] focus-visible:outline-offset-[-2px]',
                      isThisYear && !isCurrent && cellToday,
                      isCurrent && cellSelected
                    )}
                  >
                    {year}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
