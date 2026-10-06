import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  setResourceFavorite,
  downloadResourceAttachment,
  getLibraryDiagnoses,
  getResourceCategories,
  getResource,
  getResources,
  markResourceRead,
} from '../services/resources';
import { saveAndOpenFile } from '../services/deviceFiles';
import { useToast } from '../contexts/ToastContext';
import { useSessionStore } from '../stores/sessionStore';
import { describeMutationError } from './useAuth';
import { buildDownloadFileName } from '../utils/files';
import type {
  ResourceAttachment,
  EnrichedResource,
  ResourceFilters,
  SetResourceFavoriteInput,
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
  all: ['resources'] as const,
  categories: () => [...resourceKeys.all, 'categories'] as const,
  diagnoses: () => [...resourceKeys.all, 'diagnoses'] as const,
  lists: () => [...resourceKeys.all, 'list'] as const,
  list: (filters: ResourceFilters) => [...resourceKeys.lists(), filters] as const,
  details: () => [...resourceKeys.all, 'detail'] as const,
  detail: (id: string | undefined) => [...resourceKeys.details(), id] as const,
};

const OWNER_ONLY =
  'Favoritar e marcar como lida são ações de quem é titular da conta.';

const NO_LINK =
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
export function useResources(filters: ResourceFilters = {}) {
  return useQuery({
    queryKey: resourceKeys.list(filters),
    // `signal`: trocar chip/digitar busca cancela a leitura anterior no
    // servidor, não só o estado da query.
    queryFn: ({ signal }) => getResources(filters, signal),
    placeholderData: keepPreviousData,
  });
}

/**
 * Chips de categoria. Só as que têm conteúdo visível a este paciente.
 *
 * Com a mesma validade da lista (o padrão do app), e não 30 minutos: a
 * categoria nasce com a primeira orientação publicada nela, e a lista já a
 * mostrava enquanto o chip do filtro ainda não existia.
 */
export function useResourceCategories() {
  return useQuery({
    queryKey: resourceKeys.categories(),
    queryFn: getResourceCategories,
  });
}

/** Os diagnósticos que recortam a biblioteca — ver `getLibraryDiagnoses`. */
export function useLibraryDiagnoses() {
  return useQuery({
    queryKey: resourceKeys.diagnoses(),
    queryFn: getLibraryDiagnoses,
  });
}

export function useResource(id: string | undefined) {
  return useQuery({
    queryKey: resourceKeys.detail(id),
    queryFn: () => getResource(id as string),
    enabled: Boolean(id),
  });
}

/** A tela manda o id e o estado desejado; o paciente vem da sessão. */
export type SetResourceFavoriteVariables = Omit<SetResourceFavoriteInput, 'patientId'>;

/**
 * Grava o favorito, com atualização otimista.
 *
 * O otimismo existe porque a estrela precisa responder ao toque na hora — a
 * gravação ainda é uma ida ao banco. Mexe nas listas E no detalhe porque a
 * mesma orientação aparece nos dois, e quem toca a estrela pode estar em
 * qualquer um dos dois lugares.
 *
 * Quem chama manda `favorite` já resolvido, em vez de o service negar o valor
 * lido: é o que impede dois toques seguidos de gravarem o mesmo resultado.
 *
 * `setQueriesData` no plural: a lista tem uma entrada de cache por combinação
 * de filtro, e este hook não sabe qual está ativa — o prefixo casa com todas.
 */
export function useSetResourceFavorite() {
  const patientId = useSessionStore((state) => state.patientId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({ resourceId, favorite }: SetResourceFavoriteVariables) => {
      if (!patientId) throw new Error(NO_LINK);
      if (isCaregiver) throw new Error(OWNER_ONLY);

      return setResourceFavorite({ patientId, resourceId, favorite });
    },
    onMutate: async ({ resourceId, favorite }: SetResourceFavoriteVariables) => {
      await queryClient.cancelQueries({ queryKey: resourceKeys.lists() });
      await queryClient.cancelQueries({ queryKey: resourceKeys.detail(resourceId) });

      const previousLists = queryClient.getQueriesData<EnrichedResource[]>({
        queryKey: resourceKeys.lists(),
      });
      const previousDetail = queryClient.getQueryData<EnrichedResource>(resourceKeys.detail(resourceId));

      queryClient.setQueriesData<EnrichedResource[]>({ queryKey: resourceKeys.lists() }, (current) =>
        current?.map((item) => (item.id === resourceId ? { ...item, isFavorite: favorite } : item))
      );

      if (previousDetail) {
        queryClient.setQueryData<EnrichedResource>(resourceKeys.detail(resourceId), {
          ...previousDetail,
          isFavorite: favorite,
        });
      }

      return { previousLists, previousDetail };
    },
    onError: (error, { resourceId }, context) => {
      context?.previousLists.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });

      if (context?.previousDetail) {
        queryClient.setQueryData(resourceKeys.detail(resourceId), context.previousDetail);
      }

      showToast(describeMutationError(error, 'Não foi possível atualizar o favorito.'), {
        variant: 'error',
      });
    },
    // Reconcilia com o servidor mesmo em caso de sucesso: sob o filtro
    // "Favoritas", desfavoritar tira o item da lista — coisa que o otimismo
    // local não sabe fazer.
    onSettled: (_data, _error, { resourceId }) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(resourceId) });
    },
  });
}

/**
 * Marca a orientação como lida.
 *
 * Sem otimismo: nada na tela de detalhe reage a `isRead` (o indicador de não
 * lida vive no card da lista), então a invalidação basta.
 *
 * Quem chama precisa checar `isRead` antes — `read_at` guarda a PRIMEIRA
 * leitura e não deve andar a cada reabertura.
 */
export function useMarkResourceRead() {
  const patientId = useSessionStore((state) => state.patientId);
  const isCaregiver = useSessionStore((state) => state.isCaregiver);
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async (resourceId: string) => {
      if (!patientId) throw new Error(NO_LINK);
      if (isCaregiver) throw new Error(OWNER_ONLY);

      return markResourceRead({ patientId, resourceId });
    },
    onSuccess: (_data, resourceId) => {
      void queryClient.invalidateQueries({ queryKey: resourceKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: resourceKeys.detail(resourceId) });
    },
    onError: (error) => {
      showToast(describeMutationError(error, 'Não foi possível marcar como lida.'), {
        variant: 'error',
      });
    },
  });
}

export interface OpenResourceAttachmentVariables {
  attachment: ResourceAttachment;
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
export function useOpenResourceAttachment() {
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async ({ attachment, title }: OpenResourceAttachmentVariables) => {
      const blob = await downloadResourceAttachment(attachment.storagePath);

      return saveAndOpenFile({
        blob,
        fileName: buildDownloadFileName(title, attachment.mimeType),
        dialogTitle: 'Abrir orientação',
      });
    },
    onSuccess: (result) => {
      if (result !== 'saved') return;

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
