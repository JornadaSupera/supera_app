import {
  addDays as addDaysFns,
  differenceInCalendarDays,
  eachDayOfInterval,
  endOfMonth,
  format,
  getDay,
  isSameDay as isSameDayFns,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek as startOfWeekFns,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Camada de datas do app, sobre o date-fns (item da stack contratada).
//
// As funções mantêm os nomes e os formatos de saída que as telas já esperavam
// quando isso era feito à mão com `Intl.DateTimeFormat` — os textos aparecem
// direto na interface, então qualquer mudança de formato seria regressão
// visível. Onde o `date-fns` não entrega exatamente o mesmo texto, a
// diferença está comentada.

export function addDays(date: Date, days: number): Date {
  return addDaysFns(date, days);
}

export function isSameDay(a: Date, b: Date): boolean {
  return isSameDayFns(a, b);
}

export function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Único formato que continua saindo do `Intl` em vez do `date-fns`.
 *
 * O texto esperado é `sáb., 15 de ago.` — com acento e ponto de abreviação.
 * O locale pt-BR do date-fns abrevia sem nenhum dos dois (`EEEEEE` → "sab",
 * `MMM` → "ago"), e não existe token que reproduza a forma com pontuação.
 * Como esse rótulo aparece na Agenda e no Diário, trocá-lo seria regressão
 * visível; o `Intl` é API nativa da plataforma e resolve isso corretamente.
 */
const WEEKDAY_MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

/**
 * Rótulo curto de um dia: "Hoje", "Amanhã", "Ontem" ou, fora dessa janela,
 * `sáb., 15 de ago.`
 */
export function formatDayLabel(date: Date): string {
  if (isToday(date)) return 'Hoje';
  if (isTomorrow(date)) return 'Amanhã';
  if (isYesterday(date)) return 'Ontem';

  return WEEKDAY_MONTH_FORMATTER.format(date);
}

export function formatRelativeTime(minutesAgo: number): string {
  if (minutesAgo < 60) {
    return `há ${Math.max(1, Math.round(minutesAgo))}min`;
  }

  const date = new Date(Date.now() - minutesAgo * 60000);
  const hoursAgo = minutesAgo / 60;

  if (hoursAgo < 24 && isToday(date)) {
    return `há ${Math.round(hoursAgo)}h`;
  }

  if (isYesterday(date)) {
    return `Ontem · ${format(date, 'HH:mm')}`;
  }

  const diasAtras = differenceInCalendarDays(startOfDay(new Date()), startOfDay(date));
  if (diasAtras <= 7) {
    return `Há ${diasAtras} dias`;
  }

  return `${formatDayLabel(date)} · ${format(date, 'HH:mm')}`;
}

export function formatDiaryDateLabel(diasAPartirDeHoje: number, hora: string): string {
  if (diasAPartirDeHoje === 0) return `Hoje · ${hora}`;
  if (diasAPartirDeHoje === -1) return `Ontem · ${hora}`;
  if (diasAPartirDeHoje >= -7) return `Há ${Math.abs(diasAPartirDeHoje)} dias`;

  return format(addDaysFns(new Date(), diasAPartirDeHoje), 'dd/MM');
}

/** Cabeçalho de agrupamento por mês, em caixa alta: `AGOSTO DE 2026`. */
export function formatMonthGroupLabel(date: Date): string {
  return format(date, "MMMM 'de' yyyy", { locale: ptBR }).toUpperCase();
}

export function formatAgendaFutureLabel(diasAPartirDeHoje: number, hora: string): string {
  if (diasAPartirDeHoje === 0) return `Hoje · ${hora}`;
  if (diasAPartirDeHoje === 1) return `Amanhã · ${hora}`;

  const dataCurta = format(addDaysFns(new Date(), diasAPartirDeHoje), 'dd/MM');

  if (diasAPartirDeHoje <= 6) {
    return `Em ${diasAPartirDeHoje} dias · ${dataCurta}`;
  }

  return dataCurta;
}

/** `27 de agosto (quinta-feira)` — o dia vai sem zero à esquerda. */
export function formatFullDateWithWeekday(date: Date): string {
  return format(date, "d 'de' MMMM (EEEE)", { locale: ptBR });
}

/**
 * Nome do dia da semana capitalizado e sem o sufixo "-feira": `Quinta`.
 * O `date-fns` em pt-BR devolve "quinta-feira", então cortamos o sufixo e
 * capitalizamos — era o comportamento da tabela fixa anterior.
 */
export function formatWeekdayShort(date: Date): string {
  const nome = format(date, 'EEEE', { locale: ptBR }).replace('-feira', '');
  return capitalizeFirst(nome);
}

export function formatShortDate(date: Date): string {
  return format(date, 'dd/MM');
}

/** Semana começando no domingo, como no calendário do protótipo. */
export function startOfWeek(date: Date): Date {
  return startOfWeekFns(date, { weekStartsOn: 0 });
}

export function getWeekDays(referenceDate: Date): Date[] {
  const inicio = startOfWeek(referenceDate);
  return eachDayOfInterval({ start: inicio, end: addDaysFns(inicio, 6) });
}

/**
 * Células da grade do mês: `null` para os espaços antes do dia 1 (para o mês
 * começar na coluna certa) seguidos dos dias reais.
 */
export function getMonthGridDays(referenceDate: Date): (Date | null)[] {
  const primeiroDia = startOfMonth(referenceDate);
  const diasVazios = getDay(primeiroDia);
  const dias = eachDayOfInterval({ start: primeiroDia, end: endOfMonth(referenceDate) });

  return [...Array.from({ length: diasVazios }, () => null), ...dias];
}

/**
 * Fuso da clínica. É o mesmo que o banco usa no default de
 * `diary_entries.entry_date` — em UTC, um registro feito às 21h em Chapecó
 * cairia no dia seguinte, e "o diário de ontem" apareceria como o de hoje.
 */
export const CLINIC_TIME_ZONE = 'America/Sao_Paulo';

/** Data de hoje no fuso da clínica, em `YYYY-MM-DD`. */
export function todayInClinicTimeZone(): string {
  // `en-CA` formata como YYYY-MM-DD, que é exatamente o formato de uma
  // coluna `date` do Postgres — evita montar a string campo a campo.
  return new Intl.DateTimeFormat('en-CA', { timeZone: CLINIC_TIME_ZONE }).format(new Date());
}

/**
 * Converte `YYYY-MM-DD` num `Date` local à meia-noite.
 *
 * `new Date('2026-08-30')` interpretaria a string como UTC e voltaria um dia
 * em fusos negativos — o registro de hoje apareceria como o de ontem.
 */
export function parseDateOnly(dateOnly: string): Date {
  const [ano, mes, dia] = dateOnly.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

/**
 * Distância em dias entre a data informada e hoje: `0` hoje, `-1` ontem.
 * É o mesmo referencial que `formatDiaryDateLabel` espera.
 */
export function daysFromToday(dateOnly: string): number {
  return differenceInCalendarDays(parseDateOnly(dateOnly), startOfDay(new Date()));
}

/** Desloca uma data `YYYY-MM-DD` em N dias, devolvendo o mesmo formato. */
export function shiftDateOnly(dateOnly: string, days: number): string {
  return format(addDaysFns(parseDateOnly(dateOnly), days), 'yyyy-MM-dd');
}

/** Distância em dias entre um `Date` e hoje: `0` hoje, `-1` ontem, `1` amanhã. */
export function daysFromDate(date: Date): number {
  return differenceInCalendarDays(startOfDay(date), startOfDay(new Date()));
}

/** Hora do dia em `HH:MM`, 24h. */
export function formatTimeOfDay(date: Date): string {
  return format(date, 'HH:mm');
}

/** Primeiro instante do dia. */
export function startOfDayOf(date: Date): Date {
  return startOfDay(date);
}

/** Último instante do dia — limite superior de uma consulta por intervalo. */
export function endOfDayOf(date: Date): Date {
  const fim = startOfDay(date);
  fim.setHours(23, 59, 59, 999);
  return fim;
}
