import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  confirmAppointment,
  getAgendaMonth,
  getAgendaWeek,
  getAppointment,
  getAppointmentTypes,
  getNextAppointment,
  getPastAppointmentsPage,
  getUpcomingAppointments,
  unconfirmAppointment,
} from '../services/mockApi';
import { startOfWeek, toDateKey, toMonthKey } from '../utils/date';
import type {
  AppointmentConfirmationResult,
  AppointmentHistoryCursor,
  AppointmentHistoryPage,
} from '../types';

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
  // O recorte por tipo faz parte da chave: cada tipo tem o seu histórico.
  pastByType: (typeCode: string | null) => [...scheduleKeys.past(), typeCode ?? 'all'] as const,
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

/**
 * Junta as páginas já carregadas numa lista só. Fica fora do hook para ter
 * identidade estável: o `select` do TanStack Query não roda de novo a cada
 * render.
 */
function flattenHistoryPages(data: InfiniteData<AppointmentHistoryPage, AppointmentHistoryCursor | null>) {
  return data.pages.flatMap((page) => page.appointments);
}

/**
 * Histórico da agenda, página a página. `data` é tudo o que já foi carregado;
 * `fetchNextPage` traz os compromissos anteriores ao último.
 *
 * `keepPreviousData` mantém a lista anterior na tela enquanto o novo tipo
 * carrega, em vez de um Loading a cada toque no filtro.
 */
export function usePastAppointments(typeCode: string | null) {
  return useInfiniteQuery({
    queryKey: scheduleKeys.pastByType(typeCode),
    // `signal`: trocar de tipo rápido cancela a leitura anterior de verdade.
    queryFn: ({ pageParam, signal }) => getPastAppointmentsPage(typeCode, pageParam, signal),
    initialPageParam: null as AppointmentHistoryCursor | null,
    // `null` (última página) encerra a paginação.
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    select: flattenHistoryPages,
    placeholderData: keepPreviousData,
  });
}

/**
 * De quanto em quanto tempo a Home relê o próximo compromisso.
 *
 * Paliativo: `appointments` não está na publicação do Realtime, então nada
 * empurra a mudança quando a clínica remarca ou cancela, e o produto pede que
 * o card acompanhe a agenda sem o paciente precisar puxar a tela. Enquanto o
 * banco não avisar, o app pergunta. O TanStack só repete com a aba visível
 * (`refetchIntervalInBackground` fica desligado), então não gasta bateria nem
 * rede com o app em segundo plano.
 */
const NEXT_APPOINTMENT_REFRESH_MS = 60 * 1000;

/** Próximo compromisso — card de atalho da Home. */
export function useNextAppointment() {
  return useQuery({
    queryKey: scheduleKeys.next(),
    queryFn: getNextAppointment,
    refetchInterval: NEXT_APPOINTMENT_REFRESH_MS,
  });
}

/** Um compromisso. `data` é `null` quando não existe ou não é visível; falha de leitura é `isError`. */
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
 * não altera nada, e um estado otimista mentiria para o paciente. Por isso o
 * resultado de desfazer diz se a confirmação de fato saiu (`undone`) ou se
 * continua de pé (`still_confirmed`), e a tela avisa em vez de comemorar.
 */
export function useAppointmentConfirmation() {
  const queryClient = useQueryClient();

  return useMutation<AppointmentConfirmationResult, Error, { id: string; confirm: boolean }>({
    mutationFn: async ({ id, confirm }) => {
      if (confirm) {
        await confirmAppointment(id);
        return 'confirmed';
      }

      return unconfirmAppointment(id);
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: scheduleKeys.lists() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.detail(variables.id) });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.agendaWeeks() });
      queryClient.invalidateQueries({ queryKey: scheduleKeys.agendaMonths() });
    },
  });
}
