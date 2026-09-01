// Tipos do domínio Chat — modelados sobre `conversations`, `messages`,
// `conversation_subjects` e `conversation_read_marks`.
//
// Duas ausências no banco moldam este arquivo:
//
// 1. **Não existe nome de profissional visível ao paciente.** `professionals`
//    é legível, mas não guarda nome — ele vive em `accounts.full_name`, e
//    `accounts_select_own` limita o paciente à própria linha. Não há política
//    que abra o nome do profissional ao paciente. O que se pode exibir é a
//    ESPECIALIDADE (`specialties.label`, legível por qualquer autenticado),
//    daí `especialidade` no lugar do antigo `profissional: CareTeamMember`.
//
// 2. **Não existe prévia nem contador de não lidas.** `conversations` não tem
//    coluna de prévia (decisão declarada: prévia seria conteúdo clínico numa
//    tabela de metadado, fora do pedágio de auditoria) e o não lido é
//    derivado de `conversation_read_marks.last_read_at`. Os dois são montados
//    no cliente a partir do que ele já lê.

import type { LucideIcon } from 'lucide-react';

/**
 * Forma de profissional da equipe de cuidado (Home).
 *
 * Continua alimentada por mock: não há fonte legível pelo paciente para o
 * nome de um profissional. Mantida aqui porque `getResumoEquipe` ainda a usa.
 */
export interface CareTeamMember {
  nome: string;
  cargo: string;
  foto: string | null;
}

/**
 * Autor de uma mensagem, na forma que a UI usa.
 *
 * Espelha o enum `public.message_author_kind` do banco. `cuidador` fica do
 * mesmo lado do paciente na tela: quem escreve é alguém agindo por ele, não a
 * equipe. `sistema` é a mensagem automática de transferência, gerada pelo
 * próprio banco — nenhuma política de INSERT a aceita vinda do cliente.
 */
export type MessageAuthor = 'paciente' | 'cuidador' | 'profissional' | 'sistema';

/**
 * Estado de entrega, exibido só nas mensagens do próprio paciente.
 *
 * Derivado de `conversations.team_last_read_at`: o paciente vê QUE a equipe
 * leu, nunca QUEM leu — o agregado é deliberado no banco.
 */
export type MessageDeliveryStatus = 'enviada' | 'lida';

/**
 * Uma mensagem (`messages`).
 *
 * Sem variante de imagem: anexo é linha em `message_attachments` mais arquivo
 * no bucket `chat-attachments`, e `messages.body` tem CHECK de não-vazio —
 * uma "mensagem de imagem" sem texto não existe no banco. Enquanto o envio de
 * anexo não for implementado, toda mensagem é texto.
 */
export interface ChatMessage {
  id: string;
  autor: MessageAuthor;
  texto: string;
  /** `messages.created_at`, ISO 8601. */
  criadoEm: string;
}

/** `ChatMessage` com os campos de apresentação já montados. */
export type EnrichedMessage = ChatMessage & {
  data: Date;
  horaLabel: string;
  /** Só nas mensagens do paciente/cuidador; `null` nas demais. */
  statusEnvio: MessageDeliveryStatus | null;
};

/**
 * Assunto do chat (`conversation_subjects`).
 *
 * `id` é obrigatório porque `start_conversation` recebe o UUID, não o código.
 * Os códigos do banco são em inglês (`medication`, `scheduling`, `symptoms`,
 * `other`); o rótulo em pt-BR vem da própria tabela.
 */
export interface ChatSubject {
  id: string;
  code: string;
  label: string;
}

/** Apresentação de um assunto (`ASSUNTOS` em `src/utils/chat.ts`), por código. */
export interface ChatSubjectInfo {
  label: string;
  descricao: string;
  icon: LucideIcon;
  colorVar: string;
}

/** Assunto do catálogo já casado com a sua apresentação. */
export interface ChatSubjectOption extends ChatSubject {
  info: ChatSubjectInfo | null;
}

/** Item da lista de conversas — resumido, sem o corpo das mensagens. */
export interface ConversationSummary {
  id: string;
  /** Não há coluna de título: é o rótulo do assunto. */
  titulo: string;
  /** `specialties.label` da especialidade que atende, ou `null` se não roteada. */
  especialidade: string | null;
  subjectCode: string;
  assuntoInfo: ChatSubjectInfo | null;
  /** Corpo da última mensagem, montado no cliente. */
  ultimaMensagem: string;
  horaLabel: string;
  /** `conversations.last_message_at`, ISO 8601 — chave de ordenação. */
  ultimaAtividadeEm: string;
  naoLidas: number;
  /** `false` quando a conversa foi resolvida — e aí não se escreve mais nela. */
  aberta: boolean;
}

/** Retorno de `getConversaPorId` — a conversa com as mensagens. */
export interface ConversationDetail {
  id: string;
  titulo: string;
  especialidade: string | null;
  subjectCode: string;
  assuntoInfo: ChatSubjectInfo | null;
  naoLidas: number;
  aberta: boolean;
  mensagens: EnrichedMessage[];
}

/** Retorno de `getResumoEquipe` (Home — ainda mock). */
export interface TeamSummary {
  equipe: CareTeamMember[];
  total: number;
}

/** Retorno de `getConversasNaoLidas` — soma de não lidas de todas as conversas. */
export interface UnreadConversationsSummary {
  total: number;
}

/** Retorno de `enviarMensagem`. */
export interface SendMessageResult {
  success: true;
  mensagem: EnrichedMessage;
}

/** Entrada de `iniciarConversa`. */
export interface StartConversationInput {
  /** UUID de `conversation_subjects` — a RPC não aceita o código. */
  subjectId: string;
  texto: string;
}

/** Retorno de `iniciarConversa`. */
export interface StartConversationResult {
  success: true;
  id: string;
}
