import { KNOWLEDGE_CATEGORIES, KNOWLEDGE_QUESTIONS } from './knowledgeCenterCatalog';
import type {
  KnowledgeCategoryDetail,
  KnowledgeCategorySummary,
  KnowledgeQuestion,
  KnowledgeSearchEntry,
} from '../types';

// Acesso ao conteúdo da Central de Conhecimento.
//
// Hoje o conteúdo vem do catálogo do app, e não do Supabase: o banco não tem
// tabela para ele (ver `types/knowledgeCenter.ts`). As funções já são
// assíncronas e as telas as leem por `useQuery` — quando o conteúdo for para o
// banco, só este arquivo muda.
//
// Não há dado de paciente aqui: é o mesmo texto para todos.

function byOrder<T extends { order: number }>(a: T, b: T): number {
  return a.order - b.order;
}

function questionsOf(categoryId: string): KnowledgeQuestion[] {
  return KNOWLEDGE_QUESTIONS.filter((question) => question.categoryId === categoryId).sort(byOrder);
}

/**
 * Temas com a quantidade de perguntas, na ordem de exibição. Tema sem
 * pergunta fica de fora: o cartão levaria a uma tela vazia.
 */
export async function getKnowledgeCategories(): Promise<KnowledgeCategorySummary[]> {
  return [...KNOWLEDGE_CATEGORIES]
    .sort(byOrder)
    .map((category) => ({ ...category, questionCount: questionsOf(category.id).length }))
    .filter((category) => category.questionCount > 0);
}

/** Um tema com as suas perguntas. `null` quando o tema não existe (endereço antigo ou digitado). */
export async function getKnowledgeCategory(categoryId: string): Promise<KnowledgeCategoryDetail | null> {
  const category = KNOWLEDGE_CATEGORIES.find((item) => item.id === categoryId);
  if (!category) return null;

  return { ...category, questions: questionsOf(category.id) };
}

/**
 * Todas as perguntas, tema a tema e na ordem de exibição, com o nome do tema:
 * é o que a busca da tela inicial percorre.
 */
export async function getKnowledgeSearchIndex(): Promise<KnowledgeSearchEntry[]> {
  return [...KNOWLEDGE_CATEGORIES].sort(byOrder).flatMap((category) =>
    questionsOf(category.id).map((question) => ({ ...question, categoryLabel: category.label }))
  );
}
