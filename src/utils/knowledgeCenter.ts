import {
  BookOpenText,
  CircleAlert,
  Heart,
  Pill,
  Ribbon,
  ShieldCheck,
  Syringe,
  type LucideIcon,
} from 'lucide-react';
import type { KnowledgeBlock, KnowledgeQuestion } from '../types';

/** Endereço da Central de Conhecimento, dentro do Perfil. */
export const KNOWLEDGE_CENTER_PATH = '/perfil/conhecimento';

export function getKnowledgeCategoryPath(categoryId: string): string {
  return `${KNOWLEDGE_CENTER_PATH}/${encodeURIComponent(categoryId)}`;
}

export interface KnowledgeCategoryAppearance {
  icon: LucideIcon;
  /** Cor do ícone do tema, sempre um token do tema (claro e escuro). */
  tone: string;
}

/**
 * Ícone e cor de cada tema, pelo `id`. Apresentação, e não conteúdo: fica
 * fora do catálogo para que o conteúdo possa ir para o banco sem levar ícone
 * junto.
 */
const CATEGORY_APPEARANCE: Record<string, KnowledgeCategoryAppearance> = {
  'sobre-o-cancer': { icon: Ribbon, tone: 'var(--color-supera-seguranca)' },
  // O azul da infusão: a paleta da marca só tem verdes para os outros temas.
  quimioterapia: { icon: Syringe, tone: 'var(--color-infusion-waiting)' },
  medicamentos: { icon: Pill, tone: 'var(--color-primary)' },
  'efeitos-colaterais': { icon: CircleAlert, tone: 'var(--color-brand-gold)' },
  sexualidade: { icon: Heart, tone: 'var(--color-supera-amor)' },
  'cuidados-gerais': { icon: ShieldCheck, tone: 'var(--color-supera-empatia)' },
};

/** Tema novo, ainda sem ícone escolhido: o livro, na cor da marca. */
const DEFAULT_APPEARANCE: KnowledgeCategoryAppearance = {
  icon: BookOpenText,
  tone: 'var(--color-primary)',
};

export function getKnowledgeCategoryAppearance(categoryId: string): KnowledgeCategoryAppearance {
  return CATEGORY_APPEARANCE[categoryId] ?? DEFAULT_APPEARANCE;
}

const QUESTION_COUNT_RULES = new Intl.PluralRules('pt-BR');

/** "1 pergunta", "8 perguntas". */
export function formatQuestionCount(count: number): string {
  const noun = QUESTION_COUNT_RULES.select(count) === 'one' ? 'pergunta' : 'perguntas';
  return `${count.toLocaleString('pt-BR')} ${noun}`;
}

/** O que o leitor de tela anuncia depois de cada busca. */
export function formatSearchResultCount(count: number): string {
  if (count === 0) return 'Nenhuma pergunta encontrada';
  return QUESTION_COUNT_RULES.select(count) === 'one'
    ? '1 pergunta encontrada'
    : `${count.toLocaleString('pt-BR')} perguntas encontradas`;
}

/**
 * Texto comparável na busca: sem acento, sem diferença de maiúscula e com os
 * espaços colapsados. Quem digita "cancer" no celular, sem o acento, acha
 * "câncer".
 */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function blockText(block: KnowledgeBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'list':
      return block.items.map((item) => `${item.label ?? ''} ${item.text}`).join(' ');
    case 'image':
      return block.image.caption ?? '';
  }
}

function includesAllTerms(text: string, terms: string[]): boolean {
  return terms.every((term) => text.includes(term));
}

/**
 * Perguntas que contêm todas as palavras digitadas, em qualquer ordem.
 *
 * Procura na pergunta e também na resposta: quem digita "febre" precisa achar
 * "Quando devo procurar o hospital ou emergência?", cuja pergunta não tem a
 * palavra. As que batem pela pergunta vêm primeiro; dentro de cada grupo, a
 * ordem do tema se mantém.
 */
export function filterKnowledgeQuestions(
  questions: KnowledgeQuestion[],
  query: string
): KnowledgeQuestion[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return questions;

  const byQuestion: KnowledgeQuestion[] = [];
  const byAnswer: KnowledgeQuestion[] = [];

  questions.forEach((item) => {
    const question = normalizeSearchText(item.question);
    if (includesAllTerms(question, terms)) {
      byQuestion.push(item);
      return;
    }

    const answer = normalizeSearchText(item.answer.map(blockText).join(' '));
    if (includesAllTerms(`${question} ${answer}`, terms)) byAnswer.push(item);
  });

  return [...byQuestion, ...byAnswer];
}
