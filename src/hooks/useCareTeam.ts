import { useQuery } from '@tanstack/react-query';
import { getCareTeamSummary } from '../services/schedule';

// Hook da equipe de cuidado (Home). Uma leitura só — `getCareTeamSummary`
// já devolve as especialidades distintas prontas para a tela.

export const careTeamKeys = {
  all: ['care-team'] as const,
  summary: () => [...careTeamKeys.all, 'summary'] as const,
};

export function useCareTeamSummary() {
  return useQuery({
    queryKey: careTeamKeys.summary(),
    queryFn: getCareTeamSummary,
  });
}
