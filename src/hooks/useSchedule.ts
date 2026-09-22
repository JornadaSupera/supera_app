import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmAppointment,
  getAgendaMonth,
  getAgendaWeek,
  getAppointment,
  getAppointmentTypes,
  getNextAppointment,
  getPastAppointments,
  getUpcomingAppointments,
  unconfirmAppointment,
} from '../services/mockApi';
import { startOfWeek, toDateKey, toMonthKey } from '../utils/date';

// Hooks da Agenda. Leitura é `.from()` direto sob RLS; a única escrita que o
// paciente tem é a confirmação de presença, e ela é RPC.

/**
 * Chaves hierárquicas do domínio: raiz única (`all`). `lists` agrupa as três
 * variantes de listagem (próximos, passados, o próximo compromisso da Home)
 * — todas mudam juntas quando uma presença é confirmada/desfeita, então se
 * invalidam num prefixo só. `details` é a família dos compromissos
 * individuais, separada de propósito: confirmar um não deve invalidar o
 * detalhe de outro em cache.
 */
export const scheduleKeys = {
  all: ['schedule'] as const,
  types: () => [...scheduleKeys.all, 'types'] as const,
  lists: () => [...scheduleKeys.all, 'appointments', 'list'] as const,
  upcoming: () => [...scheduleKeys.lists(), 'upcoming'] as const,
  past: () => [...scheduleKeys.lists(), 'past'] as const,
  next: () => [...scheduleKeys.lists(), 'next'] as const,
  details: () => [...scheduleKeys.all, 'appointments', 'detail'] as const,
  detail: (id: string | undefined) => [...scheduleKeys.details(), id] as const,
  agendaWeeks: () => [...scheduleKeys.all, 'agenda-week'] as const,
  agendaWeek: (dateKey: string) => [...scheduleKeys.agendaWeeks(), dateKey] as const,
  agendaMonths: () => [...scheduleKeys.all, 'agenda-month'] as const,
  agendaMonth: (monthKey: string) => [...scheduleKeys.agendaMonths(), monthKey] as const,
};

export function useUpcomingAppointments() {
  return useQuery({
    queryKey: scheduleKeys.upcoming(),
    queryFn: getUpcomingAppointments,
  });
}

export function usePastAppointments() {
  return useQuery({
    queryKey: scheduleKeys.past(),
    queryFn: getPastAppointments,
  });
}

/** Próximo compromisso — card de atalho da Home. */
export function useNextAppointment() {
  return useQuery({
    queryKey: scheduleKeys.next(),
    queryFn: getNextAppointment,
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: scheduleKeys.detail(id),
    queryFn: () => getAppointment(id as string),
    enabled: Boolean(id),
  });
}

export function useAgendaWeek(reference: Date) {
  return useQuery({
    // Chave = primeiro dia da semana, em data local. Assim qualquer dia da
    // mesma semana cai no mesmo cache, e o fuso não muda o dia da chave.
    queryKey: scheduleKeys.agendaWeek(toDateKey(startOfWeek(reference))),
    // `signal`: avançar semanas rápido cancela a leitura da semana anterior.
    queryFn: ({ signal }) => getAgendaWeek(reference, signal),
  });
}

export function useAgendaMonth(reference: Date) {
  return useQuery({
    queryKey: scheduleKeys.agendaMonth(toMonthKey(reference)),
    queryFn: ({ signal }) => getAgendaMonth(reference, signal),
  });
}

/** Catálogo de tipos — legenda da visão mensal. Muda raramente. */
export function useAppointmentTypes() {
  return useQuery({
    queryKey: scheduleKeys.types(),
    queryFn: getAppointmentTypes,
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Confirma ou desfaz a confirmação de presença.
 *
 * Sempre reconsulta depois, em vez de assumir o novo estado: a RPC de desfazer
 * não reclama quando já passou do horário do compromisso — ela simplesmente
 * não altera nada, e um estado otimista mentiria para o paciente.
 */
export function useAppointmentConfirmation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, confirm }: { id: string; confirm: boolean }) =>
      confirm ? confirmAppointment(id) : unconfirmAppointment(id),
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.agendaWeeks() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.agendaMonths() });
    },
  });
}
