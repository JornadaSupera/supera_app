// Tipos da Central de Conhecimento: as perguntas e respostas do manual do
// paciente, organizadas por tema.
//
// O banco não tem tabela para este conteúdo (conferido em 25/09/2026: a
// biblioteca `content_*` é a de Orientações, por especialidade e com revisão).
// Por isso o texto vive no app, em `services/knowledgeCenterCatalog.ts`, e os
// tipos seguem o formato de uma tabela — tema, pergunta, resposta, imagem
// opcional e ordem de exibição —, para que só o service mude se um dia o
// conteúdo passar para o banco.

/** Tema da Central (Quimioterapia, Medicamentos...). */
export interface KnowledgeCategory {
  /** Identificador estável, usado no endereço (`/perfil/conhecimento/<id>`). */
  id: string;
  label: string;
  /** Ordem de exibição entre os temas. */
  order: number;
}

/**
 * Ícone de um item de lista, no lugar do ponto. É apresentação: o nome diz o
 * que o desenho mostra, e a tela escolhe o ícone (`utils/knowledgeCenter.ts`).
 */
export type KnowledgeListIcon = 'pill' | 'drip' | 'syringe' | 'spine' | 'skin';

/** Item de lista dentro de uma resposta. `label` é o termo em destaque antes dos dois-pontos. */
export interface KnowledgeListItem {
  label?: string;
  text: string;
  icon?: KnowledgeListIcon;
}

/**
 * Imagem ilustrativa. Arquivo do próprio app (`src/assets/`), com texto
 * alternativo obrigatório e o tamanho real, que reserva o espaço da imagem
 * antes de ela carregar.
 */
export interface KnowledgeImage {
  src: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
}

/**
 * Um trecho da resposta. A resposta é uma lista de trechos, e não um texto
 * com marcação: a tela monta cada trecho como elemento React, sem HTML vindo
 * de fora (nada de `dangerouslySetInnerHTML`).
 *
 * A "imagem opcional" é um trecho `image`: entra no ponto do texto em que faz
 * sentido, e só aparece quando existe.
 */
export type KnowledgeBlock =
  | { type: 'paragraph'; text: string }
  | {
      type: 'list';
      items: KnowledgeListItem[];
      /**
       * `alert`: sinais de alerta, em vermelho (quando procurar o hospital).
       * `caution`: cuidados, com o triângulo de atenção de cada item, como no
       * folheto do cateter.
       */
      tone?: 'alert' | 'caution';
    }
  | { type: 'image'; image: KnowledgeImage };

/** Uma pergunta com a sua resposta. */
export interface KnowledgeQuestion {
  id: string;
  /** `KnowledgeCategory.id` do tema a que pertence. */
  categoryId: string;
  question: string;
  answer: KnowledgeBlock[];
  /**
   * Outras palavras pelas quais a pergunta deve ser achada na busca, e que
   * não aparecem na tela (ex.: "sinais de alerta" para a lista de quando
   * procurar o hospital). Não mudam o texto da clínica.
   */
  keywords?: string[];
  /** Ordem de exibição dentro do tema. */
  order: number;
}

/** Tema como aparece no cartão da tela inicial. */
export interface KnowledgeCategorySummary extends KnowledgeCategory {
  questionCount: number;
}

/** Tema com as suas perguntas, já na ordem de exibição. */
export interface KnowledgeCategoryDetail extends KnowledgeCategory {
  questions: KnowledgeQuestion[];
}

/** Pergunta na busca da tela inicial, que procura em todos os temas: leva o nome do tema junto. */
export interface KnowledgeSearchEntry extends KnowledgeQuestion {
  categoryLabel: string;
}
