// Tipos do domínio Chat — cobre `src/mocks/messages.js` (equipe de cuidado +
// conversas) e os formatos que mockApi.js monta em cima dele.
//
// `Message` é modelado como union discriminada por `tipo`: no mock, a
// mensagem tipo 'imagem' (c3-m2, messages.js) não tem chave `texto`
// nenhuma — só `legenda` —, então "texto opcional" não bastava pra
// descrever o dado real; a forma realmente muda com o `tipo`.

import type { LucideIcon } from 'lucide-react';

/**
 * Forma de profissional usada em `equipeCuidado` e em
 * `Conversation.profissional` — tem `foto`, diferente de
 * `AppointmentProfessional` (appointments.ts), que não tem. É também a
 * forma que `getProximoCompromisso` usa para o `profissional` do card da
 * Home (repetida inline em `NextAppointmentSummary`, em appointments.ts,
 * pra não acoplar os dois arquivos por causa de um campo).
 */
export interface CareTeamMember {
  nome: string;
  cargo: string;
  /**
   * Sempre `null` nos mocks atuais (nenhuma foto cadastrada em nenhum dos 7
   * membros da equipe) — campo destinado a URL de imagem quando existir.
   */
  foto: string | null;
}

/**
 * Autor de uma mensagem. O mock estático (`messages.js`) só usa
 * 'paciente'/'profissional'; 'sistema' e 'automatica' só aparecem em
 * mensagens que `iniciarConversa` (mockApi.js) cria em runtime — não
 * existem em `messages.js`, mas fazem parte do domínio real (ver
 * `ChatConversation.jsx`, que trata os 4 casos: `mensagem.tipo ===
 * 'sistema'`, `mensagem.autor === 'paciente'`, `... === 'profissional'`,
 * `... === 'automatica'`).
 */
export type MessageAuthor = 'paciente' | 'profissional' | 'sistema' | 'automatica';

/**
 * Só 'enviada' é produzido por mock ou mockApi hoje. 'lida' não aparece em
 * nenhum dado real — é inferida do ternário em `ChatConversation.jsx`
 * (`mensagem.statusEnvio === 'enviada' ? 'Enviada' : 'Lida'`), que já
 * prevê um 2º valor de status de leitura mesmo que nada ainda o produza.
 * Sinalizado como divergência no relatório da task.
 */
export type MessageDeliveryStatus = 'enviada' | 'lida';

interface BaseMessage {
  id: string;
  autor: MessageAuthor;
  /** Mecanismo de tempo relativo, mesmo espírito de `Appointment.diasAPartirDeHoje`. */
  minutosAtras: number;
}

export interface TextMessage extends BaseMessage {
  tipo: 'texto';
  texto: string;
  statusEnvio?: MessageDeliveryStatus;
}

/** `texto` não existe nesta variante — só `legenda` (opcional: só a c3-m2 do mock tem, nada garante que toda imagem tenha). */
export interface ImageMessage extends BaseMessage {
  tipo: 'imagem';
  legenda?: string;
  statusEnvio?: MessageDeliveryStatus;
}

/** Mensagens de sistema (ex.: "Conversa iniciada…", criadas por `iniciarConversa`) nunca têm `statusEnvio`. */
export interface SystemMessage extends BaseMessage {
  tipo: 'sistema';
  texto: string;
}

export type Message = TextMessage | ImageMessage | SystemMessage;

/**
 * As 4 chaves de `ASSUNTOS` em `src/utils/chat.js` — enum fechado de
 * verdade (o lookup `getAssuntoInfo` valida e cai em `null` fora daqui).
 */
export type ChatSubject = 'medicacao' | 'agendamento' | 'sintomas' | 'outros';

/** Entrada de `ASSUNTOS[assunto]` — usada como `assuntoInfo` nos retornos enriquecidos de conversa. */
export interface ChatSubjectInfo {
  label: string;
  descricao: string;
  icon: LucideIcon;
  colorVar: string;
}

/**
 * Conversa como armazenada em `src/mocks/messages.js` (4 registros
 * conferidos). No mock estático, `titulo`/`profissional`/`assunto` nunca
 * são `null` — mas `iniciarConversa` (mockApi.js) cria conversas com os 3
 * em `null` (`titulo: null, profissional: null, assunto: assunto ||
 * null`), e a função `tituloConversa()` só faz sentido porque `titulo`
 * pode ser falsy (`if (conversa.titulo) return conversa.titulo; ...`). Por
 * isso os 3 são nuláveis aqui mesmo sem exemplo nulo no mock estático —
 * divergência entre o mock e o que o mockApi realmente produz.
 */
export interface Conversation {
  id: string;
  titulo: string | null;
  profissional: CareTeamMember | null;
  assunto: ChatSubject | null;
  naoLidas: number;
  mensagens: Message[];
}

/** Item de retorno de `getConversas` — lista resumida, sem `mensagens`. */
export interface ConversationSummary {
  id: string;
  /** Sempre resolvido por `tituloConversa()` — nunca `null` aqui, diferente de `Conversation.titulo`. */
  titulo: string;
  profissional: CareTeamMember | null;
  assunto: ChatSubject | null;
  assuntoInfo: ChatSubjectInfo | null;
  /** Texto da última mensagem, ou '📷 Imagem' quando ela é do tipo 'imagem' (`resumoMensagem`, mockApi.js). */
  ultimaMensagem: string;
  horaLabel: string;
  minutosAtras: number;
  naoLidas: number;
}

/** Message depois de `enrichMensagem` (mockApi.js). */
export type EnrichedMessage = Message & { data: Date; horaLabel: string };

/** Retorno de `getConversaPorId` — conversa completa, com mensagens enriquecidas. */
export interface ConversationDetail {
  id: string;
  titulo: string;
  profissional: CareTeamMember | null;
  assunto: ChatSubject | null;
  assuntoInfo: ChatSubjectInfo | null;
  naoLidas: number;
  mensagens: EnrichedMessage[];
}

/** Retorno de `getResumoEquipe`. */
export interface TeamSummary {
  equipe: CareTeamMember[];
  total: number;
}

/** Retorno de `getConversasNaoLidas` — soma de `naoLidas` de todas as conversas. */
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
  assunto?: ChatSubject;
  texto: string;
}

/** Retorno de `iniciarConversa`. */
export interface StartConversationResult {
  success: true;
  id: string;
}
