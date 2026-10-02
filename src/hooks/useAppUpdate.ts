import { useMutation, useQuery } from '@tanstack/react-query';
import { getStoreUpdate, openStorePage } from '../services/appUpdate';

// Atualização pelas lojas. Capacidade do aparelho, não dado de paciente — mas,
// como a biometria, passa por hook: a tela não fala com `services/` direto.

/** Uma conferência por hora basta: versão nova sai, no máximo, algumas vezes por mês. */
const STORE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * A versão nova na loja do aparelho, ou `null`. Confere ao abrir o app e, ao
 * voltar para ele, de novo se a última conferência tiver mais de uma hora.
 *
 * Sem nova tentativa: loja que não respondeu agora responde na próxima volta,
 * e a falha não é da conta de ninguém — ela só deixa a tela de fora.
 */
export function useStoreUpdate() {
  return useQuery({
    queryKey: ['store-update'],
    queryFn: getStoreUpdate,
    staleTime: STORE_CHECK_INTERVAL_MS,
    retry: false,
  });
}

/** Abre a página do app na loja do aparelho. */
export function useOpenStorePage() {
  return useMutation({
    mutationFn: openStorePage,
  });
}
