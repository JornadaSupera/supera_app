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

/**
 * A hora de um aviso ou de uma conversa, sozinha na coluna da direita: por
 * isso começa com maiúscula, como "Ontem · 13:03" e "Há 3 dias · 08:10".
 */
export function formatRelativeTime(minutesAgo: number): string {
  if (minutesAgo < 60) {
    return `Há ${Math.max(1, Math.round(minutesAgo))}min`;
  }

  const date = new Date(Date.now() - minutesAgo * 60000);
  const hoursAgo = minutesAgo / 60;

  if (hoursAgo < 24 && isToday(date)) {
    return `Há ${Math.round(hoursAgo)}h`;
  }

  if (isYesterday(date)) {
    return `Ontem · ${format(date, 'HH:mm')}`;
  }

  const diasAtras = differenceInCalendarDays(startOfDay(new Date()), startOfDay(date));
  if (diasAtras <= 7) {
    // Com a hora, como nos demais casos: "Há 3 dias" sozinho não diz se foi
    // de manhã ou de madrugada, e a caixa mistura avisos do mesmo dia.
    return `Há ${diasAtras} dias · ${format(date, 'HH:mm')}`;
  }

  return `${formatDayLabel(date)} · ${format(date, 'HH:mm')}`;
}

/**
 * Separador de dia da conversa do Chat: "Hoje", "Ontem" e, antes disso, a
 * data — `12 de setembro`, com o ano quando não é o corrente. "Há 90 dias"
 * não dizia quando a mensagem foi escrita.
 */
export function formatChatDayLabel(date: Date, now: Date = new Date()): string {
  if (isSameDayFns(date, now)) return 'Hoje';
  if (isSameDayFns(date, addDaysFns(now, -1))) return 'Ontem';

  const pattern =
    date.getFullYear() === now.getFullYear() ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy";
  return format(date, pattern, { locale: ptBR });
}

/**
 * Quanto tempo faz, sem a hora: "Hoje", "Ontem", "Há 3 dias" — e `null` depois
 * de uma semana, quando a data sozinha já diz tudo. Para quem já mostra a data
 * e a hora ao lado (o detalhe do registro repetia "12:00 · Hoje · 12:00").
 */
export function formatRelativeDay(date: Date, now: Date = new Date()): string | null {
  const daysAgo = differenceInCalendarDays(startOfDay(now), startOfDay(date));

  if (daysAgo === 0) return 'Hoje';
  if (daysAgo === 1) return 'Ontem';
  if (daysAgo > 1 && daysAgo <= 7) return `Há ${daysAgo} dias`;

  return null;
}

export function formatDiaryDateLabel(diasAPartirDeHoje: number, hora: string): string {
  if (diasAPartirDeHoje === 0) return `Hoje · ${hora}`;
  if (diasAPartirDeHoje === -1) return `Ontem · ${hora}`;
  if (diasAPartirDeHoje >= -7) return `Há ${Math.abs(diasAPartirDeHoje)} dias`;

  return format(addDaysFns(new Date(), diasAPartirDeHoje), 'dd/MM');
}

/**
 * Cabeçalho de agrupamento por mês, em frase normal: `Agosto de 2026`. O guia
 * da clínica pede títulos de seção só com a primeira letra maiúscula — a
 * caixa alta cansa a leitura no celular.
 */
export function formatMonthGroupLabel(date: Date): string {
  return capitalizeFirst(format(date, "MMMM 'de' yyyy", { locale: ptBR }));
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

/** `27/09/2026`, no fuso da clínica (a data que a equipe e o paciente enxergam). */
export function formatDateBr(value: string | Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

/** `27/09/2026, 14:32`, no fuso da clínica. */
export function formatDateTimeBr(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const hour = new Intl.DateTimeFormat('pt-BR', {
    timeZone: CLINIC_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);

  return `${formatDateBr(date)}, ${hour}`;
}

/**
 * `YYYY-MM-DD` no fuso do aparelho.
 *
 * `toISOString()` não serve para isto: ele converte para UTC, e das 21h em
 * diante, no Brasil, já devolve o dia seguinte — era o que fazia a agenda
 * pular de mês na virada do dia.
 */
export function toDateKey(date: Date): string {
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mes}-${dia}`;
}

/** `YYYY-MM` no fuso do aparelho. */
export function toMonthKey(date: Date): string {
  return toDateKey(date).slice(0, 7);
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
 * Idade em anos completos de quem nasceu em `birthDate` (`YYYY-MM-DD`), no dia
 * `today` (por padrão, hoje no fuso da clínica).
 *
 * Compara as datas como calendário, campo a campo, sem `Date`: o fuso do
 * aparelho não pode adiantar nem atrasar um aniversário — quem faz 18 anos
 * hoje tem 18 anos hoje.
 */
export function ageInYears(birthDate: string, today: string = todayInClinicTimeZone()): number {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number);
  const [year, month, day] = today.split('-').map(Number);

  const hadBirthdayThisYear = month > birthMonth || (month === birthMonth && day >= birthDay);
  return year - birthYear - (hadBirthdayThisYear ? 0 : 1);
}

/**
 * A data de nascimento mais recente de quem já tem `age` anos completos no dia
 * `today` (`YYYY-MM-DD`): o mesmo dia e mês, `age` anos atrás. É o limite do
 * calendário de nascimento — com ele, a pessoa nem consegue escolher uma data
 * de menor de idade.
 *
 * 29 de fevereiro vira 28 quando o ano de destino não é bissexto: quem nasceu
 * em 28/02 já fez aniversário nesse dia, e `ageInYears` concorda.
 */
export function latestBirthDateForAge(age: number, today: string = todayInClinicTimeZone()): string {
  const [year, month, day] = today.split('-').map(Number);
  const targetYear = year - age;
  const lastDayOfMonth = new Date(targetYear, month, 0).getDate();
  const targetDay = Math.min(day, lastDayOfMonth);

  return `${String(targetYear).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
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

// ---------------------------------------------------------------------------
// Data digitada em `dd/mm/aaaa`
//
// O campo de data mostra e aceita o formato brasileiro; o resto do app (e o
// banco) fala `YYYY-MM-DD`. Estas três funções são a ponte, e nenhuma delas
// passa por `Date` para o texto — o fuso do aparelho não pode mexer no dia.

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Máscara da data: só números, no máximo oito, com as barras no lugar.
 * `10101999` vira `10/10/1999`, `1010` vira `10/10`.
 *
 * Aceita também `YYYY-MM-DD` inteiro (é o que o preenchimento automático do
 * navegador e a colagem podem trazer) e o converte para `dd/mm/aaaa`.
 */
export function maskDateInput(value: string): string {
  const isoMatch = DATE_KEY_PATTERN.exec(value.trim());
  const digits = (isoMatch
    ? `${isoMatch[3]}${isoMatch[2]}${isoMatch[1]}`
    : value.replace(/\D/g, '')
  ).slice(0, 8);

  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/**
 * `dd/mm/aaaa` completo e real → `YYYY-MM-DD`. Qualquer outra coisa (faltando
 * dígito, dia 31 de fevereiro, ano com menos de quatro dígitos) → `null`.
 */
export function displayDateToDateKey(display: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(display);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1000) return null;

  // `new Date(ano, ...)` trata anos de 0 a 99 como 19xx; com `setFullYear` o
  // ano é o que foi digitado, e a conferência campo a campo pega o "31/02".
  const date = new Date(2000, 0, 1);
  date.setFullYear(year, month - 1, day);
  const isRealDate =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;

  return isRealDate ? `${match[3]}-${match[2]}-${match[1]}` : null;
}

/** `YYYY-MM-DD` → `dd/mm/aaaa`. Texto que não é uma data em `YYYY-MM-DD` → `''`. */
export function dateKeyToDisplayDate(dateKey: string): string {
  const match = DATE_KEY_PATTERN.exec(dateKey);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}
