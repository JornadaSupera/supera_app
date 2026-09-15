import { useMutation } from '@tanstack/react-query';
import { enviarRespostaNps } from '../services/mockApi';

/** Envia a resposta da pesquisa de satisfação (nota 0-10 + comentário opcional). */
export function useSubmitNpsResponse() {
  return useMutation({
    mutationFn: enviarRespostaNps,
  });
}
