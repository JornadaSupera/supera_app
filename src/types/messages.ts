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
 * Anexo de uma mensagem (`message_attachments`).
 *
 * Só imagem no app do paciente — o bucket `chat-attachments` também aceita
 * PDF, mas isso é "lado profissional" (a fonte só pede Imagem aqui).
 */
export interface MessageAttachment {
  id: string;
  /** `<message_id>/<arquivo>` — nunca exibido; é por ele que o arquivo é baixado. */
  storagePath: string;
  mimeType: string;
  byteSize: number;
}

/**
 * Uma mensagem (`messages`).
 *
 * `anexo` não substitui `texto`: `messages.body` tem CHECK de não-vazio, então
 * uma mensagem de imagem sem legenda ainda carrega um texto — o placeholder
 * `IMAGEM_SEM_LEGENDA_TEXTO` (`utils/chat.ts`). A tela decide se mostra esse
 * texto como legenda comparando com essa constante.
 */
export interface ChatMessage {
  id: string;
  autor: MessageAuthor;
  /**
   * Conta que escreveu (`messages.author_account_id`); `null` na mensagem de
   * sistema. É o que separa "minha mensagem" de "mensagem deste lado": na
   * sessão do acompanhante, a do paciente também fica à direita.
   */
  authorAccountId: string | null;
  texto: string;
  /** `messages.created_at`, ISO 8601. */
  criadoEm: string;
  anexo: MessageAttachment | null;
}

/**
 * `ChatMessage` com os campos de apresentação já montados.
 *
 * O "Enviada/Lida" não mora aqui: depende de `teamLastReadAt`, que muda sem a
 * mensagem mudar, e é calculado na tela (`getDeliveryStatus`) — guardado na
 * página, ficava preso ao valor da hora em que ela foi lida.
 */
export type EnrichedMessage = ChatMessage & {
  data: Date;
  horaLabel: string;
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
  /**
   * A última mensagem carrega um anexo.
   *
   * Derivado do embed `message_attachments` que a lista já lê — assim a
   * prévia mostra o ícone de imagem por saber que há anexo, e não por
   * adivinhar pelo texto do `body`.
   */
  ultimaMensagemTemAnexo: boolean;
  horaLabel: string;
  /** `conversations.last_message_at`, ISO 8601 — chave de ordenação. */
  ultimaAtividadeEm: string;
  naoLidas: number;
  /** `false` quando a conversa foi resolvida — e aí não se escreve mais nela. */
  aberta: boolean;
}

/**
 * Retorno de `getConversationHeader` — tudo sobre a conversa, exceto as
 * mensagens, que são paginadas à parte por `getConversationMessages` (ver
 * README §5.6: histórico sem teto crescia com a idade da conversa).
 */
export interface ConversationHeader {
  id: string;
  titulo: string;
  especialidade: string | null;
  subjectCode: string;
  assuntoInfo: ChatSubjectInfo | null;
  naoLidas: number;
  aberta: boolean;
  /** `conversations.team_last_read_at` — de onde sai o "Lida" das mensagens deste lado. */
  teamLastReadAt: string | null;
}

/**
 * Uma página de mensagens, da mais antiga para a mais nova dentro da própria
 * página. `nextCursor` é o `criadoEm` da mensagem mais antiga da página —
 * passar de volta busca a página anterior; `null` quando não há mais.
 */
export interface MessagesPage {
  mensagens: EnrichedMessage[];
  nextCursor: string | null;
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

/**
 * Imagem cuja mensagem já existe, mas cujo arquivo não chegou ao bucket.
 *
 * A mensagem é imutável e não se apaga: o que resta é mandar o arquivo de
 * novo para o MESMO caminho — o bucket aceita enquanto o arquivo não existir
 * (guia §7). `registered` diz se a linha de `message_attachments` chegou a
 * ser gravada; sem ela, o reenvio grava a linha antes do arquivo.
 */
export interface PendingChatAttachment {
  messageId: string;
  storagePath: string;
  registered: boolean;
}

/**
 * Imagem que não chegou ao bucket, com o arquivo ainda na memória da tela —
 * é o que permite o "Reenviar". Vive só enquanto a conversa está aberta:
 * nunca é gravada no aparelho.
 */
export interface UnsentChatImage {
  pending: PendingChatAttachment;
  file: File;
}

/** Retorno de `enviarImagemMensagem`. */
export interface SendImageResult {
  messageId: string;
  /** Caminho do arquivo no bucket — é por ele que a tela relê a imagem depois do envio. */
  storagePath: string;
  /** `null` quando o arquivo subiu; senão, o que falta para reenviá-lo. */
  pending: PendingChatAttachment | null;
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
