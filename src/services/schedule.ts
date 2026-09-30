// Agenda: compromissos (próximos, histórico, semana, mês), confirmação de
// presença, tipos e o resumo da equipe que cuida, que sai dos compromissos.
//
// Nenhuma página fala com o Supabase direto: toda leitura e escrita passa pelos
// serviços, sob a RLS da sessão, e devolve os formatos de `src/types/` — as telas
// não conhecem nome de coluna nem forma de embed.
import { appError } from '../lib/appError';
import { requireSupabase } from './supabaseClient';
import {
  formatDayLabel,
  formatDiaryDateLabel,
  daysFromDate,
  formatTimeOfDay,
  startOfDayOf,
  endOfDayOf,
  formatAgendaFutureLabel,
  formatFullDateWithWeekday,
  getWeekDays,
  getMonthGridDays,
  isSameDay,
} from '../utils/date';
import { resolveAppointmentVisual } from '../utils/appointments';
import { getCareTeamSpecialtyInfo } from '../utils/careTeam';
import type {
  AppointmentHistoryCursor,
  AppointmentHistoryPage,
  AppointmentSpecialty,
  AppointmentStatusCode,
  AppointmentTypeInfo,
  UnconfirmOutcome,
  EnrichedAppointment,
  AgendaDay,
  NextAppointmentSummary,
  CareTeamSummary,
  CareTeamSpecialtyOption,
} from '../types';

/**
 * Colunas de um compromisso com os catálogos resolvidos.
 *
 * `origin_specialty` é a área para onde o compromisso foi roteado. O embed de
 * `professionals` existe só como segunda fonte para o mesmo rótulo: a RPC de
 * agendamento deixa `origin_specialty_id` em NULL por padrão, então sem esse
 * caminho a maioria dos compromissos não exibiria área nenhuma.
 *
 * Não se pede nome de profissional aqui porque não existe: `professionals`
 * não tem coluna de nome, e `accounts.full_name` é legível só pelo próprio
 * dono. A tela mostra a área que atende, não a pessoa.
 */
// Colunas antes e depois do embed do tipo, separadas para o tipo poder entrar
// como junção comum ou obrigatória (`TYPED_APPOINTMENT_FIELDS`).
const APPOINTMENT_FIELDS_HEAD =
  'id, title, starts_at, ends_at, location_label, location_address, location_phone, ' +
  'patient_notes, confirmed_at, confirmed_by_account_id, ';

const APPOINTMENT_FIELDS_TAIL =
  'origin_specialty:specialties(code, label), ' +
  'professionals(professional_specialties(specialties(code, label)))';

const APPOINTMENT_FIELDS = `${APPOINTMENT_FIELDS_HEAD}appointment_types(code, label, color), ${APPOINTMENT_FIELDS_TAIL}`;

/**
 * Mesma leitura com o tipo como junção obrigatória (`!inner`), pelo mesmo
 * motivo do status abaixo: só assim um filtro por `appointment_types.code`
 * recorta o COMPROMISSO, e não apenas o embed.
 */
const TYPED_APPOINTMENT_FIELDS = `${APPOINTMENT_FIELDS_HEAD}appointment_types!inner(code, label, color), ${APPOINTMENT_FIELDS_TAIL}`;

const APPOINTMENT_SELECT = `${APPOINTMENT_FIELDS}, appointment_statuses(code, label, is_terminal)`;
const TYPED_APPOINTMENT_SELECT = `${TYPED_APPOINTMENT_FIELDS}, appointment_statuses(code, label, is_terminal)`;

/**
 * Mesma leitura, mas com o status como junção obrigatória (`!inner`): só
 * assim um filtro por `appointment_statuses.code` recorta o COMPROMISSO. Sem
 * o `!inner`, o PostgREST recortaria apenas o embed — o compromisso voltaria
 * igual, com o status nulo.
 */
const SCHEDULED_APPOINTMENT_SELECT = `${APPOINTMENT_FIELDS}, appointment_statuses!inner(code, label, is_terminal)`;

/** Teto por consulta, no mesmo patamar que o servidor usa nas funções read_*. */
const APPOINTMENT_PAGE_SIZE = 200;

/** Compromissos por página do histórico, como no Diário. */
const APPOINTMENT_HISTORY_PAGE_SIZE = 20;

interface SpecialtyRow {
  code: string;
  label: string;
}

interface AppointmentRow {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  location_label: string;
  location_address: string | null;
  location_phone: string | null;
  patient_notes: string | null;
  confirmed_at: string | null;
  confirmed_by_account_id: string | null;
  appointment_types: { code: string; label: string; color: string | null } | null;
  appointment_statuses: { code: string; label: string; is_terminal: boolean } | null;
  origin_specialty: SpecialtyRow | null;
  professionals: {
    professional_specialties: { specialties: SpecialtyRow | null }[] | null;
  } | null;
}

/**
 * Área que atende: a do compromisso quando roteado, senão a do profissional
 * designado. `null` quando nenhuma das duas existe — caso legítimo, e a tela
 * simplesmente omite a linha.
 *
 * Parâmetro estreitado a só os dois campos que a função lê (em vez de exigir
 * `AppointmentRow` inteiro): é o que permite `getCareTeamSummary` reusá-la
 * com uma consulta mais magra, sem selecionar título/horário/local que ela
 * não precisa.
 */
function resolveSpecialty(
  row: Pick<AppointmentRow, 'origin_specialty' | 'professionals'>
): AppointmentSpecialty | null {
  if (row.origin_specialty) return row.origin_specialty;

  const professionalSpecialty = row.professionals?.professional_specialties?.find(
    (link) => link.specialties
  )?.specialties;

  return professionalSpecialty ?? null;
}

/** Embed mínimo pra resolver a especialidade de um compromisso — ver `resolveSpecialty`. */
const SPECIALTY_RESOLUTION_SELECT =
  'origin_specialty:specialties(code, label), ' +
  'professionals(professional_specialties(specialties(code, label)))';

interface CareTeamAppointmentRow {
  origin_specialty: AppointmentSpecialty | null;
  professionals: {
    professional_specialties: { specialties: AppointmentSpecialty | null }[] | null;
  } | null;
}

/**
 * Especialidades que já atenderam o paciente (Home) — de `appointments`,
 * distintas.
 *
 * Não existe "profissional responsável" no banco: sem tabela de atribuição
 * paciente↔profissional, e nome de profissional não é legível pelo paciente
 * de qualquer forma. Isto é o sinal honesto que existe — a mesma tabela que
 * a Agenda já lê, sem RPC nova, resolvida pelo mesmo `resolveSpecialty` que
 * a Agenda usa. Só `origin_specialty_id` não bastaria: a RPC de agendamento
 * deixa essa coluna `NULL` por padrão (ver comentário de `APPOINTMENT_SELECT`
 * acima) — sem o fallback via `professionals`, a maioria dos compromissos
 * reais não contaria especialidade nenhuma.
 *
 * Conta qualquer status (inclusive cancelado/remarcado): mesmo um compromisso
 * desmarcado significa que aquela especialidade está no circuito de cuidado
 * do paciente — não é o volume de atendimentos que importa aqui, é quais
 * áreas participam.
 *
 * Ordenado por `code` no fim: sem isso, a ordem de retorno do Postgres não é
 * garantida entre execuções, e o empilhamento visual das bolhas na Home
 * "pularia" de posição a cada refetch sem nenhuma mudança real nos dados.
 */
export async function getCareTeamSummary(): Promise<CareTeamSummary> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('appointments')
    .select(SPECIALTY_RESOLUTION_SELECT)
    .limit(APPOINTMENT_PAGE_SIZE);

  if (error) {
    throw appError('Não foi possível carregar sua equipe de cuidado.', error);
  }

  const specialtiesByCode = new Map<string, CareTeamSpecialtyOption>();

  (data as unknown as CareTeamAppointmentRow[]).forEach((row) => {
    const specialty = resolveSpecialty(row);
    if (!specialty || specialtiesByCode.has(specialty.code)) return;

    specialtiesByCode.set(specialty.code, {
      code: specialty.code,
      label: specialty.label,
      info: getCareTeamSpecialtyInfo(specialty.code),
    });
  });

  const specialties = [...specialtiesByCode.values()].sort((a, b) =>
    a.code.localeCompare(b.code)
  );

  return { specialties };
}

function enrichAppointment(row: AppointmentRow): EnrichedAppointment {
  const date = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  const time = formatTimeOfDay(date);
  const daysAway = daysFromDate(date);

  const statusCode = (row.appointment_statuses?.code ?? 'scheduled') as AppointmentStatusCode;
  const specialty = resolveSpecialty(row);
  const typeCode = row.appointment_types?.code ?? '';
  const typeColor = row.appointment_types?.color ?? null;

  const visual = resolveAppointmentVisual(typeCode, specialty?.code ?? null, typeColor);

  // "Passado" é medido pelo FIM: uma infusão de quatro horas que começou há
  // uma hora ainda está acontecendo, e some da lista se o corte for o início.
  const isPast = endsAt.getTime() < Date.now();

  return {
    id: row.id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    locationLabel: row.location_label,
    locationAddress: row.location_address,
    locationPhone: row.location_phone,
    patientNotes: row.patient_notes,
    typeCode,
    typeLabel: row.appointment_types?.label ?? '',
    typeColor,
    statusCode,
    statusLabel: row.appointment_statuses?.label ?? '',
    isTerminal: row.appointment_statuses?.is_terminal ?? false,
    confirmedAt: row.confirmed_at,
    confirmedByAccountId: row.confirmed_by_account_id,
    specialty,
    date,
    time,
    durationMin: Math.max(0, Math.round((endsAt.getTime() - date.getTime()) / 60000)),
    dateLabel:
      daysAway >= 0 ? formatAgendaFutureLabel(daysAway, time) : formatDiaryDateLabel(daysAway, time),
    fullDateLabel: formatFullDateWithWeekday(date),
    icon: visual.icon,
    colorVar: visual.colorVar,
    isPast,
    // As mesmas condições que a RPC impõe do lado do banco: só antes do
    // início e só enquanto agendado. Repetir aqui não substitui a checagem
    // do servidor — serve para não oferecer um botão que vai falhar.
    canConfirm: statusCode === 'scheduled' && date.getTime() > Date.now(),
  };
}

/** Traduz a recusa da RPC de confirmação numa frase que o paciente entenda. */
function describeAppointmentError(
  error: { code?: string; message?: string },
  fallback: string
): string {
  const message = error.message ?? '';

  if (message.includes('ja comecou') || message.includes('não está agendado')) {
    return 'Este compromisso já começou ou não está mais agendado.';
  }

  if (error.code === '42501' || message.includes('apenas o titular')) {
    return 'Só você ou quem acompanha você pode confirmar presença.';
  }

  return fallback;
}

/**
 * Converte o resultado bruto do PostgREST na forma que as telas consomem.
 *
 * Recusa por RLS não passa por aqui: ela volta como lista vazia, sem erro. O
 * que chega é falha de rede ou consulta malformada.
 */
function mapAppointments(data: unknown, error: unknown): EnrichedAppointment[] {
  if (error) {
    throw appError('Não foi possível carregar sua agenda.', error);
  }

  return (data as AppointmentRow[]).map(enrichAppointment);
}

/**
 * Compromissos que ainda não terminaram, do mais próximo ao mais distante.
 */
export async function getUpcomingAppointments(): Promise<EnrichedAppointment[]> {
  const now = new Date().toISOString();

  const { data, error } = await requireSupabase()
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .gte('ends_at', now)
    .order('starts_at', { ascending: true })
    .limit(APPOINTMENT_PAGE_SIZE);

  return mapAppointments(data, error);
}

/**
 * Uma página do histórico: compromissos já encerrados, do mais recente ao mais
 * antigo, `APPOINTMENT_HISTORY_PAGE_SIZE` por vez.
 *
 * O filtro por tipo vai ao servidor. Com paginação, filtrar só o que já veio
 * deixaria o paciente diante de "nenhum compromisso deste tipo" com páginas
 * ainda por ler.
 *
 * A próxima página recomeça pelo último lido: horário anterior, ou o mesmo
 * horário com `id` menor (dois compromissos podem começar juntos). O instante
 * que separa passado de futuro (`until`) nasce na primeira página e viaja no
 * cursor; ver `AppointmentHistoryCursor`.
 */
export async function getPastAppointmentsPage(
  typeCode: string | null = null,
  cursor: AppointmentHistoryCursor | null = null,
  signal?: AbortSignal
): Promise<AppointmentHistoryPage> {
  const until = cursor?.until ?? new Date().toISOString();

  let query = requireSupabase()
    .from('appointments')
    .select(typeCode ? TYPED_APPOINTMENT_SELECT : APPOINTMENT_SELECT)
    .lt('ends_at', until)
    .order('starts_at', { ascending: false })
    .order('id', { ascending: false })
    // Uma linha além da página: se ela vier, há próxima página. Sem isso, um
    // histórico com exatamente uma página cheia ofereceria "carregar mais"
    // para uma página vazia.
    .limit(APPOINTMENT_HISTORY_PAGE_SIZE + 1);

  if (typeCode) {
    query = query.eq('appointment_types.code', typeCode);
  }

  if (cursor) {
    // O horário vai entre aspas por causa do `:` e do `+`.
    query = query.or(
      `starts_at.lt."${cursor.startsAt}",` +
        `and(starts_at.eq."${cursor.startsAt}",id.lt.${cursor.id})`
    );
  }

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  if (error) {
    throw appError('Não foi possível carregar seu histórico de compromissos.', error);
  }

  const rows = data as unknown as AppointmentRow[];
  const hasMore = rows.length > APPOINTMENT_HISTORY_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, APPOINTMENT_HISTORY_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    appointments: pageRows.map(enrichAppointment),
    nextCursor: hasMore && last ? { startsAt: last.starts_at, id: last.id, until } : null,
  };
}

/**
 * Um compromisso específico. `null` quando não existe ou não é visível para
 * esta sessão; falha de leitura (rede, sessão) é erro, e a tela as distingue.
 */
export async function getAppointment(id: string): Promise<EnrichedAppointment | null> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    throw appError('Não foi possível carregar o compromisso.', error);
  }

  if (!data) {
    // Compromisso de outro paciente e compromisso inexistente devolvem a
    // mesma coisa por desenho: a RLS não confirma nem nega a existência.
    return null;
  }

  return enrichAppointment(data as unknown as AppointmentRow);
}

/** Compromissos que se sobrepõem a um intervalo, do mais cedo ao mais tarde. */
async function getAppointmentsInRange(
  from: Date,
  to: Date,
  signal?: AbortSignal
): Promise<EnrichedAppointment[]> {
  let query = requireSupabase()
    .from('appointments')
    .select(APPOINTMENT_SELECT)
    .gte('starts_at', from.toISOString())
    .lte('starts_at', to.toISOString())
    .order('starts_at', { ascending: true })
    .limit(APPOINTMENT_PAGE_SIZE);

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;

  return mapAppointments(data, error);
}

/**
 * Os 7 dias da semana de `referenceDate`, cada um com seus compromissos.
 *
 * Uma única consulta cobrindo a semana inteira, distribuída no cliente: sete
 * consultas separadas custariam sete idas ao servidor para montar uma tela só.
 */
export async function getScheduleWeek(referenceDate: Date, signal?: AbortSignal): Promise<AgendaDay[]> {
  const weekDays = getWeekDays(referenceDate);
  const appointments = await getAppointmentsInRange(
    startOfDayOf(weekDays[0]),
    endOfDayOf(weekDays[weekDays.length - 1]),
    signal
  );

  return weekDays.map((day) => ({
    date: day,
    events: appointments.filter((appointment) => isSameDay(appointment.date, day)),
  }));
}

/**
 * A grade do mês de `referenceDate`. `null` nas células de preenchimento antes
 * do dia 1, como a visão mensal espera.
 */
export async function getScheduleMonth(
  referenceDate: Date,
  signal?: AbortSignal
): Promise<(AgendaDay | null)[]> {
  const cells = getMonthGridDays(referenceDate);
  const monthDays = cells.filter((cell): cell is Date => cell !== null);

  if (monthDays.length === 0) return cells.map(() => null);

  const appointments = await getAppointmentsInRange(
    startOfDayOf(monthDays[0]),
    endOfDayOf(monthDays[monthDays.length - 1]),
    signal
  );

  return cells.map((day) =>
    day ? { date: day, events: appointments.filter((appointment) => isSameDay(appointment.date, day)) } : null
  );
}

/** O próximo compromisso, para o card da Home. `null` quando não há nenhum. */
export async function getNextAppointment(): Promise<NextAppointmentSummary | null> {
  const now = new Date().toISOString();

  // Só o que ainda vale. Cancelado não acontece, e remarcado é a linha ANTIGA
  // (o banco cria outra para o horário novo) — sem este filtro, o card da Home
  // anunciava um compromisso que já tinha mudado de dia.
  const { data, error } = await requireSupabase()
    .from('appointments')
    .select(SCHEDULED_APPOINTMENT_SELECT)
    .eq('appointment_statuses.code', 'scheduled')
    .gte('ends_at', now)
    .order('starts_at', { ascending: true })
    .limit(1);

  const upcoming = mapAppointments(data, error);

  const next = upcoming[0];
  if (!next) return null;

  return {
    id: next.id,
    title: next.title,
    date: next.date,
    dayLabel: formatDayLabel(next.date),
    time: next.time,
    locationLabel: next.locationLabel,
    specialtyLabel: next.specialty?.label ?? null,
    icon: next.icon,
    colorVar: next.colorVar,
    tip: next.patientNotes,
  };
}

/** Catálogo de tipos de compromisso — alimenta a legenda da visão mensal. */
export async function getAppointmentTypes(): Promise<AppointmentTypeInfo[]> {
  const client = requireSupabase();

  const { data, error } = await client
    .from('appointment_types')
    .select('id, code, label, color, sort_order')
    .eq('is_active', true)
    .order('sort_order');

  if (error) {
    throw appError('Não foi possível carregar os tipos de compromisso.', error);
  }

  return (
    data as { id: string; code: string; label: string; color: string | null; sort_order: number }[]
  ).map((row) => ({
    id: row.id,
    code: row.code,
    label: row.label,
    color: row.color,
    sortOrder: row.sort_order,
  }));
}

/**
 * Confirma presença. Só o titular ou quem o acompanha, e só antes do início.
 */
export async function confirmAppointment(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.rpc('confirm_appointment', { p_appointment_id: id });

  if (error) {
    throw appError(describeAppointmentError(error, 'Não foi possível confirmar sua presença.'), error);
  }
}

/**
 * Desfaz a confirmação e diz o que ficou.
 *
 * A RPC não reclama quando já passou do horário — ela simplesmente não altera
 * nada ([BANCO 19]). Por isso não basta a chamada ter voltado sem erro: relê
 * `confirmed_at` e devolve `still_confirmed` se a confirmação continua de pé,
 * para a tela não anunciar um "desfeita" que não aconteceu.
 */
export async function unconfirmAppointment(id: string): Promise<UnconfirmOutcome> {
  const client = requireSupabase();
  const { error } = await client.rpc('unconfirm_appointment', { p_appointment_id: id });

  if (error) {
    throw appError(describeAppointmentError(error, 'Não foi possível desfazer a confirmação.'), error);
  }

  const { data, error: readError } = await client
    .from('appointments')
    .select('confirmed_at')
    .eq('id', id)
    .maybeSingle();

  if (readError || !data) {
    // A RPC respondeu, mas não dá para conferir o resultado: dizer "desfeita"
    // ou "continua confirmada" seria chute. A tela relê o compromisso sozinha.
    throw appError(
      'Não foi possível conferir se a confirmação foi desfeita. Abra o compromisso de novo.',
      readError ?? undefined
    );
  }

  return data.confirmed_at ? 'still_confirmed' : 'undone';
}
