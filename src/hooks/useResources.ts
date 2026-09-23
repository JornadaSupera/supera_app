import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  alternarFavoritoOrientacao,
  baixarAnexoOrientacao,
  getCategoriasOrientacoes,
  getOrientacaoPorId,
  getOrientacoes,
  marcarOrientacaoComoLida,
} from '../services/mockApi';
import { saveAndOpenFile } from '../services/deviceFiles';
import { useToast } from '../contexts/ToastContext';
import { useSessionStore } from '../stores/sessionStore';
import { describeMutationError } from './useAuth';
import { buildDownloadFileName } from '../utils/files';
import type {
  OrientationAttachment,
  OrientationDetail,
  OrientationFilters,
} from '../types';

// Hooks de Orientações. A leitura é `.from()` direto — a RLS já recorta a
// biblioteca pelo diagnóstico do paciente. As duas escritas (favorito e
// lida) vão para `patient_content_states`, a única tabela deste módulo com
// dado de paciente.

/**
 * Chaves hierárquicas do domínio: raiz única (`all`), com `lists`/`details`
 * como famílias que se invalidam por prefixo — categorias ficam de fora
 * dessas duas famílias porque não mudam quando um favorito ou uma leitura é
 * gravada.
 */
export const resourceKeys = {
  all: ['orientations'] as const,
  categories: () => [...resourceKeys.all, 'categories'] as const,
  lists: () => [...resourceKeys.all, 'list'] as const,
  list: (filters: OrientationFilters) => [...resourceKeys.lists(), filters] as const,
  details: () => [...resourceKeys.all, 'detail'] as const,
  detail: (id: string | undefined) => [...resourceKeys.details(), id] as const,
};

const SO_TITULAR =
  'Favoritar e marcar como lida são ações de quem é titular da conta.';

const SEM_VINCULO =
  'Seu cadastro ainda não está vinculado à sua conta. Fale com a recepção do Centro.';

/**
 * Diz se a sessão pode marcar favorito e lida.
 *
 * `patient_content_states` só tem política para o titular
 * (`patient_id = my_own_patient_id()`), e isso é decisão declarada do banco:
 * favoritar e marcar como lido são atos de quem é dono da biblioteca, não de
 * quem acompanha. O acompanhante LÊ as orientações normalmente — só não
 * gerencia os marcadores de outra pessoa.
 *
 * A checagem aqui é conveniência de UI: a barreira real continua sendo a RLS.
 */
export function useCanMarkResources(): boolean {
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const patientId = useSessionStore((state) => state.patientId);

  return Boolean(patientId) && !isCaregiver;
}

/**
 * Biblioteca filtrada. `keepPreviousData` mantém a lista anterior na tela
 * enquanto o novo filtro carrega, em vez de piscar um Loading de página
 * inteira a cada toque num chip.
 */
export function useOrientations(filters: OrientationFilters = {}) {
  return useQuery({
    queryKey: resourceKeys.list(filters),
    // `signal`: trocar chip/digitar busca cancela a leitura anterior no
    // servidor, não só o estado da query.
    queryFn: ({ signal }) => getOrientacoes(filters, signal),
    placeholderData: keepPreviousData,
  });
}

/** Chips de categoria. Só as que têm conteúdo visível a este paciente. */
export function useOrientationCategories() {
  return useQuery({
    queryKey: resourceKeys.categories(),
    queryFn: getCategoriasOrientacoes,
    staleTime: 1000 * 60 * 30,
  });
}

export function useOrientation(id: string | undefined) {
  return useQuery({
    queryKey: resourceKeys.detail(id),
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
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (orientationId: string) => {
      if (!patientId) throw new Error(SEM_VINCULO);
      if (isCaregiver) throw new Error(SO_TITULAR);

      return alternarFavoritoOrientacao({ patientId, orientationId });
    },
    onMutate: async (orientationId: string) => {
      await queryClient.cancelQueries({ queryKey: resourceKeys.lists() });
      await queryClient.cancelQueries({ queryKey: resourceKeys.detail(orientationId) });

      const listas = queryClient.getQueriesData<OrientationDetail[]>({
        queryKey: resourceKeys.lists(),
      });
      const detalhe = queryClient.getQueryData<OrientationDetail>(
        resourceKeys.detail(orientationId)
      );

      queryClient.setQueriesData<OrientationDetail[]>({ queryKey: resourceKeys.lists() }, (atual) =>
        atual?.map((item) =>
          item.id === orientationId ? { ...item, favorito: !item.favorito } : item
        )
      );

      if (detalhe) {
        queryClient.setQueryData<OrientationDetail>(resourceKeys.detail(orientationId), {
          ...detalhe,
          favorito: !detalhe.favorito,
        });
      }

      return { listas, detalhe };
    },
    onError: (error, orientationId, context) => {
      context?.listas.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });

      if (context?.detalhe) {
        queryClient.setQueryData(resourceKeys.detail(orientationId), context.detalhe);
      }

      showToast(describeMutationError(error, 'Não foi possível atualizar o favorito.'), {
        variant: 'error',
      });
    },
    // Reconcilia com o servidor mesmo em caso de sucesso: sob o filtro
    // "Favoritas", desfavoritar tira o item da lista — coisa que o otimismo
    // local não sabe fazer.
    onSettled: (_data, _error, orientationId) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(orientationId) });
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
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (orientationId: string) => {
      if (!patientId) throw new Error(SEM_VINCULO);
      if (isCaregiver) throw new Error(SO_TITULAR);

      return marcarOrientacaoComoLida({ patientId, orientationId });
    },
    onSuccess: (_data, orientationId) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(orientationId) });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível marcar como lida.'), {
        variant: 'error',
      });
    },
  });
}

export interface OpenOrientationAttachmentVariables {
  attachment: OrientationAttachment;
  /** Título da orientação — vira o nome do arquivo gravado. */
  title: string;
}

/**
 * Baixa o anexo do bucket e o entrega ao aparelho.
 *
 * As duas metades ficam juntas porque uma sem a outra não serve: no app
 * nativo o `Blob` sozinho não vira arquivo nenhum (a WebView não tem pasta de
 * downloads), e o arquivo sem o download não existe. A tela dispara uma
 * mutation só e recebe o resultado pronto.
 *
 * `saved` significa arquivo no aparelho sem app que o abrisse — ou a pessoa
 * fechou a folha de compartilhamento. Aí o toast diz onde ele ficou, senão o
 * toque em "Baixar" parece não ter feito nada.
 */
export function useOpenOrientationAttachment() {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({ attachment, title }: OpenOrientationAttachmentVariables) => {
      const blob = await baixarAnexoOrientacao(attachment.storagePath);

      return saveAndOpenFile({
        blob,
        fileName: buildDownloadFileName(title, attachment.mimeType),
        dialogTitle: 'Abrir orientação',
      });
    },
    onSuccess: (resultado) => {
      if (resultado !== 'saved') return;

      showToast('Arquivo salvo em Documentos. Dá para abri-lo mesmo sem internet.', {
        variant: 'success',
      });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível baixar o arquivo.'), {
        variant: 'error',
      });
    },
  });
}
