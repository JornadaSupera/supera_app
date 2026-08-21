export function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function capitalizeFirst(text) {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

const WEEKDAY_MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: '2-digit',
  month: 'short',
});

export function formatDayLabel(date) {
  const today = new Date();
  const diffDays = Math.round((startOfDay(date) - startOfDay(today)) / 86400000);

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Amanhã';
  if (diffDays === -1) return 'Ontem';

  return WEEKDAY_MONTH_FORMATTER.format(date);
}

function startOfDay(date) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function formatRelativeTime(minutesAgo) {
  if (minutesAgo < 60) {
    return `há ${Math.max(1, Math.round(minutesAgo))}min`;
  }

  const date = new Date(Date.now() - minutesAgo * 60000);
  const hoursAgo = minutesAgo / 60;

  if (hoursAgo < 24 && isSameDay(date, new Date())) {
    return `há ${Math.round(hoursAgo)}h`;
  }

  const hora = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (isSameDay(date, addDays(new Date(), -1))) {
    return `Ontem · ${hora}`;
  }

  return `${formatDayLabel(date)} · ${hora}`;
}

export function formatDiaryDateLabel(diasAPartirDeHoje, hora) {
  if (diasAPartirDeHoje === 0) return `Hoje · ${hora}`;
  if (diasAPartirDeHoje === -1) return `Ontem · ${hora}`;
  if (diasAPartirDeHoje >= -7) return `Há ${Math.abs(diasAPartirDeHoje)} dias`;

  const date = addDays(new Date(), diasAPartirDeHoje);
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const MONTH_YEAR_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });

export function formatMonthGroupLabel(date) {
  return MONTH_YEAR_FORMATTER.format(date).toUpperCase();
}

export function formatAgendaFutureLabel(diasAPartirDeHoje, hora) {
  if (diasAPartirDeHoje === 0) return `Hoje · ${hora}`;
  if (diasAPartirDeHoje === 1) return `Amanhã · ${hora}`;

  const data = addDays(new Date(), diasAPartirDeHoje);
  const dataCurta = data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  if (diasAPartirDeHoje <= 6) {
    return `Em ${diasAPartirDeHoje} dias · ${dataCurta}`;
  }

  return dataCurta;
}

export function formatFullDateWithWeekday(date) {
  const dataLonga = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  const diaSemana = date.toLocaleDateString('pt-BR', { weekday: 'long' });
  return `${dataLonga} (${diaSemana})`;
}

export function formatWeekdayShort(date) {
  return date.toLocaleDateString('pt-BR', { weekday: 'long' });
}

export function formatShortDate(date) {
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function startOfWeek(date) {
  const result = startOfDay(date);
  result.setDate(result.getDate() - result.getDay());
  return result;
}

export function getWeekDays(referenceDate) {
  const inicio = startOfWeek(referenceDate);
  return Array.from({ length: 7 }, (_, index) => addDays(inicio, index));
}

export function getMonthGridDays(referenceDate) {
  const primeiroDiaMes = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const diasVazios = primeiroDiaMes.getDay();
  const totalDiasNoMes = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();

  const celulas = [];
  for (let i = 0; i < diasVazios; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDiasNoMes; dia++) {
    celulas.push(new Date(referenceDate.getFullYear(), referenceDate.getMonth(), dia));
  }
  return celulas;
}
