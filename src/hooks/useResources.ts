import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  alternarFavoritoOrientacao,
  getCategoriasOrientacoes,
  getOrientacaoPorId,
  getOrientacoes,
  marcarOrientacaoComoLida,
} from '../services/mockApi';
import { useSessionStore } from '../stores/sessionStore';
import type { OrientationDetail, OrientationFilters } from '../types';

// Hooks de Orientações. A leitura é `.from()` direto — a RLS já recorta a
// biblioteca pelo diagnóstico do paciente. As duas escritas (favorito e
// lida) vão para `patient_content_states`, a única tabela deste módulo com
// dado de paciente.

const SEM_VINCULO =
  'Seu cadastro ainda não está vinculado à sua conta. Fale com a recepção do Centro.';

/**
 * Biblioteca filtrada. `keepPreviousData` mantém a lista anterior na tela
 * enquanto o novo filtro carrega, em vez de piscar um Loading de página
 * inteira a cada toque num chip.
 */
export function useOrientations(filters: OrientationFilters = {}) {
  return useQuery({
    queryKey: ['orientations', filters],
    queryFn: () => getOrientacoes(filters),
    placeholderData: keepPreviousData,
  });
}

/** Chips de categoria. Só as que têm conteúdo visível a este paciente. */
export function useOrientationCategories() {
  return useQuery({
    queryKey: ['orientation-categories'],
    queryFn: getCategoriasOrientacoes,
    staleTime: 1000 * 60 * 30,
  });
}

export function useOrientation(id: string | undefined) {
  return useQuery({
    queryKey: ['orientation', id],
    queryFn: () => getOrientacaoPorId(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Alterna o favorito, com atualização otimista.
 *
 * O otimismo existe porque a estrela precisa responder ao toque na hora: a
 * escrita real são duas idas ao banco (ler o estado atual, gravar a negação).
 * Mexe nas listas E no detalhe porque a mesma orientação aparece nos dois, e
 * quem toca a estrela pode estar em qualquer um dos dois lugares.
 *
 * `setQueriesData` no plural: a lista tem uma entrada de cache por combinação
 * de filtro, e este hook não sabe qual está ativa — o prefixo casa com todas.
 */
export function useToggleOrientationFavorite() {
  const patientId = useSessionStore((state) => state.patientId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orientationId: string) => {
      if (!patientId) throw new Error(SEM_VINCULO);

      return alternarFavoritoOrientacao({ patientId, orientationId });
    },
    onMutate: async (orientationId: string) => {
      await queryClient.cancelQueries({ queryKey: ['orientations'] });
      await queryClient.cancelQueries({ queryKey: ['orientation', orientationId] });

      const listas = queryClient.getQueriesData<OrientationDetail[]>({
        queryKey: ['orientations'],
      });
      const detalhe = queryClient.getQueryData<OrientationDetail>(['orientation', orientationId]);

      queryClient.setQueriesData<OrientationDetail[]>({ queryKey: ['orientations'] }, (atual) =>
        atual?.map((item) =>
          item.id === orientationId ? { ...item, favorito: !item.favorito } : item
        )
      );

      if (detalhe) {
        queryClient.setQueryData<OrientationDetail>(['orientation', orientationId], {
          ...detalhe,
          favorito: !detalhe.favorito,
        });
      }

      return { listas, detalhe };
    },
    onError: (_error, orientationId, context) => {
      context?.listas.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });

      if (context?.detalhe) {
        queryClient.setQueryData(['orientation', orientationId], context.detalhe);
      }
    },
    // Reconcilia com o servidor mesmo em caso de sucesso: sob o filtro
    // "Favoritas", desfavoritar tira o item da lista — coisa que o otimismo
    // local não sabe fazer.
    onSettled: (_data, _error, orientationId) => {
      void queryClient.invalidateQueries({ queryKey: ['orientations'] });
      void queryClient.invalidateQueries({ queryKey: ['orientation', orientationId] });
    },
  });
}

/**
 * Marca a orientação como lida.
 *
 * Sem otimismo: nada na tela de detalhe reage a `lida` (o indicador de não
 * lida vive no card da lista), então a invalidação basta.
 *
 * Quem chama precisa checar `lida` antes — `read_at` guarda a PRIMEIRA
 * leitura e não deve andar a cada reabertura.
 */
export function useMarkOrientationAsRead() {
  const patientId = useSessionStore((state) => state.patientId);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (orientationId: string) => {
      if (!patientId) throw new Error(SEM_VINCULO);

      return marcarOrientacaoComoLida({ patientId, orientationId });
    },
    onSuccess: (_data, orientationId) => {
      void queryClient.invalidateQueries({ queryKey: ['orientations'] });
      void queryClient.invalidateQueries({ queryKey: ['orientation', orientationId] });
    },
  });
}
