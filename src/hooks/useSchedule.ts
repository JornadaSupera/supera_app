import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  confirmAppointment,
  getAgendaMonth,
  getAgendaWeek,
  getAppointment,
  getAppointmentTypes,
  getPastAppointments,
  getUpcomingAppointments,
  unconfirmAppointment,
} from '../services/mockApi';

// Hooks da Agenda. Leitura é `.from()` direto sob RLS; a única escrita que o
// paciente tem é a confirmação de presença, e ela é RPC.

export function useUpcomingAppointments() {
  return useQuery({
    queryKey: ['appointments', 'upcoming'],
    queryFn: getUpcomingAppointments,
  });
}

export function usePastAppointments() {
  return useQuery({
    queryKey: ['appointments', 'past'],
    queryFn: getPastAppointments,
  });
}

export function useAppointment(id: string | undefined) {
  return useQuery({
    queryKey: ['appointment', id],
    queryFn: () => getAppointment(id as string),
    enabled: Boolean(id),
  });
}

export function useAgendaWeek(reference: Date) {
  return useQuery({
    // A chave precisa ser estável entre renders: um `Date` novo a cada
    // render invalidaria o cache sozinho. A data ISO do dia basta, porque a
    // consulta cobre a semana inteira que contém essa data.
    queryKey: ['agenda-week', reference.toISOString().slice(0, 10)],
    queryFn: () => getAgendaWeek(reference),
  });
}

export function useAgendaMonth(reference: Date) {
  return useQuery({
    queryKey: ['agenda-month', reference.toISOString().slice(0, 7)],
    queryFn: () => getAgendaMonth(reference),
  });
}

/** Catálogo de tipos — legenda da visão mensal. Muda raramente. */
export function useAppointmentTypes() {
  return useQuery({
    queryKey: ['appointment-types'],
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
      queryClient.invalidateQueries({ queryKey: ['appointments'] });
      queryClient.invalidateQueries({ queryKey: ['appointment', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['agenda-week'] });
      queryClient.invalidateQueries({ queryKey: ['agenda-month'] });
      queryClient.invalidateQueries({ queryKey: ['next-appointment'] });
    },
  });
}
