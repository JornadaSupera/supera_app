import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getBusinessHours, getClinicPresentation } from '../services/clinic';
import { formatBusinessHours } from '../utils/businessHours';

// Configuração da clínica (guia do banco §5.20).

export const clinicKeys = {
  all: ['clinic'] as const,
  businessHours: () => [...clinicKeys.all, 'business-hours'] as const,
  presentation: () => [...clinicKeys.all, 'presentation'] as const,
};

const presentationQuery = {
  queryKey: clinicKeys.presentation(),
  queryFn: ({ signal }: { signal: AbortSignal }) => getClinicPresentation(signal),
  // Muda quando a clínica mexe na aba Mensagens do painel — raro.
  staleTime: 1000 * 60 * 30,
};

/**
 * Os slides e o logotipo da clínica para o carrossel antes do login. É dado
 * de apoio: enquanto carrega, se falhar ou se a clínica não configurou nada,
 * o carrossel mostra o texto embutido do app.
 */
export function useClinicPresentation() {
  return useQuery(presentationQuery);
}

/**
 * Busca a apresentação durante a abertura (a tela de abertura já espera um
 * pouco de qualquer jeito), para o carrossel nascer com o texto da clínica em
 * vez de trocá-lo na frente da pessoa.
 */
export function usePrefetchClinicPresentation() {
  const queryClient = useQueryClient();

  useEffect(() => {
    void queryClient.prefetchQuery(presentationQuery);
  }, [queryClient]);
}

/**
 * Horário da equipe já em texto (`seg–sex, 08h–18h`), ou `null` quando a
 * clínica não configurou nenhum.
 *
 * Muda raramente (é a aba Atendimento do painel), daí os 30 minutos. É dado
 * de apoio: quem usa não bloqueia a tela enquanto ele carrega ou se falhar —
 * a linha do horário só não aparece.
 */
export function useBusinessHoursLabel() {
  return useQuery({
    queryKey: clinicKeys.businessHours(),
    queryFn: ({ signal }) => getBusinessHours(signal),
    select: formatBusinessHours,
    staleTime: 1000 * 60 * 30,
  });
}
