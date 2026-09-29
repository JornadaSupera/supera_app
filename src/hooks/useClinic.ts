import { useQuery } from '@tanstack/react-query';
import { getBusinessHours } from '../services/clinic';
import { formatBusinessHours } from '../utils/businessHours';

// Configuração da clínica (guia do banco §5.20).

export const clinicKeys = {
  all: ['clinic'] as const,
  businessHours: () => [...clinicKeys.all, 'business-hours'] as const,
};

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
