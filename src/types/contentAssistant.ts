// Tipos do assistente de orientações com IA e do pedido de orientação
// (guia do banco §5.5, ADR-033 — o bônus de IA do contrato).
//
// A pergunta e a resposta nunca vão ao banco nem ao armazenamento do aparelho:
// vivem só na memória da sessão (cache do TanStack Query). A pergunta só fica
// gravada quando a pessoa faz o pedido de orientação — e aí foi ela quem pediu.

/**
 * A chave e os limites que a clínica definiu em `clinic_settings`. Os limites
 * são por CONTA e mudam pelo painel, sem versão nova do app.
 */
export interface ContentAssistantSettings {
  /** `ai_assistant_enabled`: com `false`, o app esconde o assistente. */
  enabled: boolean;
  /** `ai_assistant_hourly_limit`: perguntas na última hora (janela móvel). */
  hourlyLimit: number;
  /** `ai_assistant_question_max_chars`: o `maxLength` do campo da pergunta. */
  questionMaxChars: number;
  /** `content_request_daily_limit`: pedidos de orientação por dia. */
  requestDailyLimit: number;
}

/** Uma orientação que a IA citou. Abre como a da biblioteca, pelo id. */
export interface AssistantReference {
  /** `content_items.id`. */
  resourceId: string;
  title: string;
}

/** A IA achou orientações que respondem à pergunta. */
export interface AssistantAnswer {
  status: 'answered';
  /** O resumo, até 120 palavras, sem markdown. */
  answer: string;
  /** Da mais relevante para a menos relevante, no máximo 5. */
  references: AssistantReference[];
  /** O aviso de que a resposta não substitui o atendimento (texto da clínica). */
  disclaimer: string;
}

/** Nenhuma orientação responde: o app oferece o pedido. */
export interface AssistantNoMatch {
  status: 'no_match';
  message: string;
  canRequest: boolean;
  /** Rascunho do pedido, que a pessoa edita antes de enviar (10 a 1000). */
  suggestedContext: string;
}

export type AssistantReply = AssistantAnswer | AssistantNoMatch;

/** O que a tela manda ao perguntar. */
export interface AssistantQuestionInput {
  /**
   * Gerado no app, ao perguntar: identifica a pergunta no endereço da tela
   * (`?pergunta=`) e no histórico. Não vai ao servidor.
   */
  id: string;
  question: string;
}

/**
 * Uma pergunta da sessão e o que voltou dela. Mora só na memória (o cache de
 * mutations do TanStack Query, limpo no logout e ao fechar o app): volta-se da
 * orientação aberta e a resposta continua lá, e a aba "Histórico" a mostra
 * enquanto a conta estiver aberta (guia §5.5: "o histórico da sessão").
 */
export interface AssistantExchange {
  /** O id gerado ao perguntar (`AssistantQuestionInput.id`). */
  id: string;
  question: string;
  /** Quando a pergunta foi feita, em milissegundos (`Date.now()`). */
  askedAt: number;
  isPending: boolean;
  reply: AssistantReply | null;
  error: Error | null;
}

/** As duas visões da tela do assistente. */
export type AssistantTab = 'ask' | 'history';

/** `public.content_request_status`. */
export type ContentRequestStatus = 'open' | 'fulfilled' | 'declined' | 'cancelled';

/**
 * Um pedido de orientação (`content_requests`). O titular vê todos os da
 * própria ficha, inclusive os do acompanhante; o acompanhante, só os dele.
 */
export interface ContentRequest {
  id: string;
  status: ContentRequestStatus;
  /** O que a pessoa precisa, nas palavras dela. */
  context: string;
  /** `requested_by`: só quem pediu pode retirar o pedido aberto. */
  requestedBy: string;
  /** Preenchido quando a equipe atendeu com uma orientação publicada. */
  fulfilledResourceId: string | null;
  /** Escrito pela equipe para quem pediu ler, na recusa. */
  declineReason: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Entrada de `request_content`. */
export interface RequestContentInput {
  context: string;
  /** A pergunta feita ao assistente, quando o pedido nasceu dele. */
  originalQuestion?: string;
}
