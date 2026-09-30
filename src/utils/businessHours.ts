import type { BusinessHoursInterval } from '../types';

// Horário de atendimento da equipe em texto curto, para o Chat:
// `seg–sex, 08h–18h`.
//
// A grade do banco é semanal e aceita vários intervalos por dia (guia §5.20).
// Dias seguidos com os mesmos intervalos viram uma faixa ("seg–sex"). A
// semana é lida de segunda a domingo, como se fala no Brasil — no banco, o
// domingo é o dia 0.

const WEEKDAY_LABELS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Segunda a domingo: a ordem em que as faixas são montadas. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/** `08:00:00` → `08h`; `13:30:00` → `13h30`. */
export function formatClockTime(time: string): string {
  const [hours = '00', minutes = '00'] = time.split(':');
  return minutes === '00' ? `${hours}h` : `${hours}h${minutes}`;
}

/** Os intervalos de um dia, em ordem: `08h–12h e 13h–18h`. */
function describeDay(intervals: BusinessHoursInterval[]): string {
  return [...intervals]
    .sort((a, b) => a.opensAt.localeCompare(b.opensAt))
    .map((interval) => `${formatClockTime(interval.opensAt)}–${formatClockTime(interval.closesAt)}`)
    .join(' e ');
}

interface WeekdayRange {
  first: number;
  last: number;
  hours: string;
}

/**
 * O horário inteiro numa linha: `seg–sex, 08h–18h; sáb, 08h–12h`.
 *
 * `null` quando a clínica ainda não configurou horário — a tabela nasce
 * vazia, e aí a tela não mostra horário nenhum em vez de inventar um.
 */
export function formatBusinessHours(intervals: BusinessHoursInterval[]): string | null {
  const ranges: WeekdayRange[] = [];
  let previousIndex = -2;

  WEEK_ORDER.forEach((weekday, index) => {
    const ofDay = intervals.filter((interval) => interval.weekday === weekday);
    if (ofDay.length === 0) return;

    const hours = describeDay(ofDay);
    const current = ranges[ranges.length - 1];

    // Só estende a faixa com o dia imediatamente seguinte: "seg, qua" com o
    // mesmo horário não vira "seg–qua", que incluiria a terça fechada.
    if (current && current.hours === hours && previousIndex === index - 1) {
      current.last = weekday;
    } else {
      ranges.push({ first: weekday, last: weekday, hours });
    }
    previousIndex = index;
  });

  if (ranges.length === 0) return null;

  return ranges
    .map(({ first, last, hours }) => {
      const days =
        first === last ? WEEKDAY_LABELS[first] : `${WEEKDAY_LABELS[first]}–${WEEKDAY_LABELS[last]}`;
      return `${days}, ${hours}`;
    })
    .join('; ');
}
