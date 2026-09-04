import { useQuery } from '@tanstack/react-query';
import { getCareTeamSummary } from '../services/mockApi';

// Hook da equipe de cuidado (Home). Uma leitura só — `getCareTeamSummary`
// já devolve as especialidades distintas prontas para a tela.

export function useCareTeamSummary() {
  return useQuery({
    queryKey: ['care-team-summary'],
    queryFn: getCareTeamSummary,
  });
}
