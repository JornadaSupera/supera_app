import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getPendingNpsSurvey, submitNpsResponse } from '../services/mockApi';

// Hooks de NPS. Leitura é `.from('nps_surveys')` sob RLS; a resposta é
// `.insert()` direto em `nps_responses` — única e final (README §5.10).

export const npsKeys = {
  all: ['nps'] as const,
  pending: () => [...npsKeys.all, 'pending'] as const,
};

/**
 * Pesquisa aberta e ainda sem resposta, ou `null`. É o que decide se a Home e
 * o Perfil oferecem o atalho: sem pesquisa aberta não há o que responder, e o
 * atalho levaria a uma tela vazia.
 */
export function usePendingNpsSurvey() {
  return useQuery({
    queryKey: npsKeys.pending(),
    queryFn: getPendingNpsSurvey,
  });
}

/** Envia a resposta (nota 0–10 + comentário opcional). */
export function useSubmitNpsResponse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: submitNpsResponse,
    // `onSettled`, não só `onSuccess`: o erro de "já respondida" também quer
    // dizer que a pendência mudou — os atalhos precisam sumir nos dois casos.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: npsKeys.pending() });
    },
  });
}
