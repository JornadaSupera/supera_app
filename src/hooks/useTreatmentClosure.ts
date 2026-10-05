import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getUpcomingTreatmentClosures } from '../services/schedule';
import { getClosureCelebrations, saveClosureCelebration } from '../services/treatmentClosure';
import { useSessionStore } from '../stores/sessionStore';
import { pickClosureToCelebrate } from '../utils/treatmentClosure';
import { scheduleKeys } from './useSchedule';
import type { EnrichedAppointment } from '../types';

// A tela surpresa do sino: qual compromisso de encerramento do tratamento deve
// abri-la agora (se algum) e o "fechar", que anota no aparelho que ela já foi
// vista. Ver `utils/treatmentClosure.ts` para as regras.

export const treatmentClosureKeys = {
  // Debaixo das listas da Agenda: marcar, remarcar ou cancelar um compromisso
  // invalida as listas, e a surpresa é conferida de novo junto.
  upcoming: () => [...scheduleKeys.lists(), 'treatment-closure'] as const,
  celebrations: (accountId: string | null) => ['treatment-closure', 'celebrations', accountId] as const,
};

export interface TreatmentClosureCelebrationState {
  /** O compromisso que abre a tela agora, ou `null`. */
  appointment: EnrichedAppointment | null;
  /** Fecha a tela e anota que ela já foi vista. */
  dismiss: (appointmentId: string) => void;
}

/**
 * Só o titular vê a surpresa: as frases falam com o paciente ("Você chegou
 * até aqui!"), e o sino é dele. A leitura começa quando a sessão está pronta.
 */
export function useTreatmentClosureCelebration(enabled: boolean): TreatmentClosureCelebrationState {
  const queryClient = useQueryClient();
  const accountId = useSessionStore((state) => state.accountId);
  const isOwnerSession = useSessionStore(
    (state) => state.status === 'authenticated' && !state.isCaregiver && !state.mustChangePassword
  );
  const isActive = enabled && isOwnerSession && Boolean(accountId);

  const closuresQuery = useQuery({
    queryKey: treatmentClosureKeys.upcoming(),
    queryFn: getUpcomingTreatmentClosures,
    enabled: isActive,
  });

  const celebrationsQuery = useQuery({
    queryKey: treatmentClosureKeys.celebrations(accountId),
    queryFn: () => getClosureCelebrations(accountId as string),
    enabled: isActive,
    // Muda só por aqui (ver `dismiss`): não há o que revalidar sozinho.
    staleTime: Infinity,
  });

  const dismissMutation = useMutation({
    mutationFn: (appointmentId: string) => saveClosureCelebration(accountId as string, appointmentId),
  });

  function dismiss(appointmentId: string) {
    // A tela sai na hora, mesmo que o cofre falhe: prender a pessoa nela seria
    // pior do que vê-la de novo na próxima abertura.
    queryClient.setQueryData(treatmentClosureKeys.celebrations(accountId), (current: unknown) => [
      ...(Array.isArray(current) ? current : []),
      { appointmentId, shownAt: new Date().toISOString() },
    ]);
    dismissMutation.mutate(appointmentId);
  }

  const appointment =
    isActive && closuresQuery.data && celebrationsQuery.data
      ? pickClosureToCelebrate(closuresQuery.data, celebrationsQuery.data)
      : null;

  return { appointment, dismiss };
}
