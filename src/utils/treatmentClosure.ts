import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatWeekdayShort } from './date';
import type { EnrichedAppointment, TreatmentClosureCelebration } from '../types';

// Regras da tela surpresa do sino (pacote de design de 03/10/2026): ela
// aparece de surpresa, uma vez, quando a equipe marca o compromisso de
// ENCERRAMENTO DO TRATAMENTO — o dia em que o paciente vem tocar o sino.

/**
 * Código do tipo de compromisso no catálogo `appointment_types`. O tipo é
 * cadastrado pela administração no painel (`create_appointment_type`); este é
 * o código que o app reconhece.
 */
export const TREATMENT_CLOSURE_TYPE_CODE = 'treatment_closure';

/**
 * Se o tipo foi cadastrado com outro código, o nome também vale: qualquer
 * rótulo que comece com "Encerramento" e fale em "tratamento" ("Encerramento
 * de tratamento", "Encerramento do tratamento"). Sintaxe do `ilike` do
 * PostgREST, sem diferenciar maiúsculas.
 */
export const TREATMENT_CLOSURE_LABEL_PATTERN = 'encerramento*tratamento*';

/**
 * Depois de mostrar a tela, outro encerramento só volta a abri-la passado este
 * prazo. Remarcar, no banco, cria um compromisso NOVO e encerra o antigo
 * (`reschedule_appointment`): sem o prazo, remarcar o dia do sino mostraria a
 * surpresa de novo — e o pacote pede para não reexibir sozinha.
 */
export const CLOSURE_RESHOW_GUARD_DAYS = 180;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * O compromisso que deve abrir a tela agora, ou `null`.
 *
 * Só conta encerramento ainda agendado e por acontecer (cancelado ou remarcado
 * não abre), e nunca um que já tenha aberto a tela neste aparelho. Se a tela
 * já foi mostrada há menos de `CLOSURE_RESHOW_GUARD_DAYS`, nenhum abre.
 */
export function pickClosureToCelebrate(
  appointments: readonly EnrichedAppointment[],
  celebrations: readonly TreatmentClosureCelebration[],
  now: Date = new Date()
): EnrichedAppointment | null {
  const recentlyCelebrated = celebrations.some((celebration) => {
    const shownAt = Date.parse(celebration.shownAt);
    return Number.isFinite(shownAt) && now.getTime() - shownAt < CLOSURE_RESHOW_GUARD_DAYS * DAY_MS;
  });
  if (recentlyCelebrated) return null;

  const celebratedIds = new Set(celebrations.map((celebration) => celebration.appointmentId));

  return (
    appointments.find(
      (appointment) =>
        appointment.statusCode === 'scheduled' &&
        !appointment.isPast &&
        !celebratedIds.has(appointment.id)
    ) ?? null
  );
}

/**
 * Lê o que foi guardado no cofre. Qualquer coisa fora do formato vale como
 * "nunca mostrada": melhor mostrar a surpresa de novo do que nunca.
 */
export function parseClosureCelebrations(raw: string | null): TreatmentClosureCelebration[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is TreatmentClosureCelebration =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).appointmentId === 'string' &&
        typeof (item as Record<string, unknown>).shownAt === 'string'
    );
  } catch {
    return [];
  }
}

/**
 * A data do compromisso como no modelo da clínica: `Sexta, 16 de outubro ·
 * 14h` — e `14h30` quando há minutos.
 */
export function formatClosureDateLabel(date: Date): string {
  const minutes = date.getMinutes();
  const time = minutes === 0 ? `${date.getHours()}h` : `${date.getHours()}h${String(minutes).padStart(2, '0')}`;

  return `${formatWeekdayShort(date)}, ${format(date, "d 'de' MMMM", { locale: ptBR })} · ${time}`;
}
