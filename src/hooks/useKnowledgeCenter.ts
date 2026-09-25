import { useQuery } from '@tanstack/react-query';
import { getKnowledgeCategories, getKnowledgeCategory } from '../services/knowledgeCenter';

// Hooks da Central de Conhecimento. O conteúdo é o mesmo para todos e só muda
// com uma nova versão do app, então fica em cache pela sessão inteira.

export const knowledgeCenterKeys = {
  all: ['knowledge-center'] as const,
  categories: () => [...knowledgeCenterKeys.all, 'categories'] as const,
  category: (categoryId: string | undefined) => [...knowledgeCenterKeys.all, 'category', categoryId] as const,
};

/**
 * `networkMode: 'always'`: o conteúdo não vem da rede. No modo padrão, sem
 * internet a consulta ficaria pausada e a tela, carregando para sempre —
 * justo no hospital, onde o sinal costuma ser ruim.
 */
const CONTENT_QUERY_OPTIONS = {
  staleTime: Infinity,
  networkMode: 'always',
} as const;

/** Temas da tela inicial, com a quantidade de perguntas de cada um. */
export function useKnowledgeCategories() {
  return useQuery({
    queryKey: knowledgeCenterKeys.categories(),
    queryFn: getKnowledgeCategories,
    ...CONTENT_QUERY_OPTIONS,
  });
}

/** Um tema e as suas perguntas. `data === null`: o tema não existe. */
export function useKnowledgeCategory(categoryId: string | undefined) {
  return useQuery({
    queryKey: knowledgeCenterKeys.category(categoryId),
    queryFn: () => getKnowledgeCategory(categoryId as string),
    enabled: Boolean(categoryId),
    ...CONTENT_QUERY_OPTIONS,
  });
}
