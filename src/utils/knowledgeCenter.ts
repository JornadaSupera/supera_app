import { Bone, Droplet, Hand, Pill, Syringe, type LucideIcon } from 'lucide-react';
import {
  BandageIcon,
  CatheterPortIcon,
  HeartsIcon,
  HomeCareIcon,
  InfusionIcon,
  ManualIcon,
  PillsIcon,
  RibbonIcon,
  type KnowledgeIcon,
} from '../components/KnowledgeIcons';
import type { KnowledgeBlock, KnowledgeListIcon, KnowledgeQuestion } from '../types';

/** Endereço da Central de Conhecimento, dentro do Perfil. */
export const KNOWLEDGE_CENTER_PATH = '/perfil/conhecimento';

export function getKnowledgeCategoryPath(categoryId: string): string {
  return `${KNOWLEDGE_CENTER_PATH}/${encodeURIComponent(categoryId)}`;
}

/** Parâmetro do endereço que abre o tema já com uma pergunta aberta. */
export const OPEN_QUESTION_PARAM = 'pergunta';

/** O tema, com a pergunta `questionId` já aberta e à vista. */
export function getKnowledgeQuestionPath(categoryId: string, questionId: string): string {
  return `${getKnowledgeCategoryPath(categoryId)}?${OPEN_QUESTION_PARAM}=${encodeURIComponent(questionId)}`;
}

/** `id` do bloco da pergunta na página, para rolar até ela. */
export function getKnowledgeQuestionAnchor(questionId: string): string {
  return `pergunta-${questionId}`;
}

/**
 * A pergunta dos sinais de alerta, que a tela inicial destaca. Se ela sair do
 * catálogo, o atalho só abre o tema, sem pergunta aberta.
 */
export const ALERT_QUESTION = {
  categoryId: 'cuidados-gerais',
  questionId: 'quando-procurar-o-hospital',
} as const;

export interface KnowledgeCategoryAppearance {
  icon: KnowledgeIcon;
  /** Uma linha sobre o que o tema responde, para o cartão. */
  description: string;
}

/**
 * Ícone e a linha de apoio de cada tema, pelo `id`. Apresentação, e não
 * conteúdo: fica fora do catálogo para que o conteúdo possa ir para o banco
 * sem levar ícone junto. A linha de apoio só resume as perguntas do tema, não
 * diz nada que as respostas não digam. Todos os temas usam o verde da marca: o
 * que os distingue é o desenho.
 */
const CATEGORY_APPEARANCE: Record<string, KnowledgeCategoryAppearance> = {
  'sobre-o-cancer': { icon: RibbonIcon, description: 'O que é, como surge e como é tratado.' },
  quimioterapia: { icon: InfusionIcon, description: 'Como o tratamento é feito e aplicado.' },
  'cateter-portocath': { icon: CatheterPortIcon, description: 'O que é e como cuidar dele em casa.' },
  medicamentos: { icon: PillsIcon, description: 'Outros remédios, cuidados e bebidas.' },
  'efeitos-colaterais': { icon: BandageIcon, description: 'Dor durante a aplicação e queda de cabelo.' },
  sexualidade: { icon: HeartsIcon, description: 'Vida sexual, fertilidade e gravidez.' },
  'cuidados-gerais': { icon: HomeCareIcon, description: 'Sinais de alerta e cuidados em casa.' },
};

/** Ícone de cada item de lista que tem um (vias de administração da quimioterapia). */
const LIST_ICONS: Record<KnowledgeListIcon, LucideIcon> = {
  pill: Pill,
  drip: Droplet,
  syringe: Syringe,
  spine: Bone,
  skin: Hand,
};

export function getKnowledgeListIcon(icon: KnowledgeListIcon): LucideIcon {
  return LIST_ICONS[icon];
}

/** Tema novo, ainda sem ícone escolhido: o manual. */
const DEFAULT_APPEARANCE: KnowledgeCategoryAppearance = {
  icon: ManualIcon,
  description: 'Perguntas e respostas sobre o tratamento.',
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
export function filterKnowledgeQuestions<T extends KnowledgeQuestion>(questions: T[], query: string): T[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return questions;

  const byQuestion: T[] = [];
  const byAnswer: T[] = [];

  questions.forEach((item) => {
    const question = normalizeSearchText(item.question);
    if (includesAllTerms(question, terms)) {
      byQuestion.push(item);
      return;
    }

    // As palavras-chave entram junto com a resposta: acham a pergunta pelo
    // nome que o app dá a ela ("sinais de alerta") sem mexer no texto da clínica.
    const answer = normalizeSearchText([...item.answer.map(blockText), ...(item.keywords ?? [])].join(' '));
    if (includesAllTerms(`${question} ${answer}`, terms)) byAnswer.push(item);
  });

  return [...byQuestion, ...byAnswer];
}
