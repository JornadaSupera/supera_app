import { Pill, Calendar, Activity, CircleQuestionMark } from 'lucide-react';
import { isToday } from 'date-fns';
import { formatChatDayLabel, formatShortDate } from './date';
import type {
  BubblePosition,
  ChatMessage,
  ChatSubjectInfo,
  ConversationSummary,
  EnrichedMessage,
  MessageDay,
  MessageDeliveryStatus,
  MessageSide,
} from '../types';

// Apresentação dos assuntos do chat, chaveada pelo `code` de
// `conversation_subjects` — que no banco é em inglês. O `label` daqui é
// fallback: quem manda é o rótulo da tabela, que a clínica pode editar. O que
// só existe aqui são ícone, cor e descrição, que não têm coluna. A cor
// (`colorVar`) não é mais desenhada — o ícone vai no verde escuro
// (`SubjectIcon`) — e fica só porque o tipo `ChatSubjectInfo` a exige.
export const CHAT_SUBJECTS: Record<string, ChatSubjectInfo> = {
  medication: {
    label: 'Medicação',
    description: 'Dúvidas sobre comprimidos, horários, efeitos',
    icon: Pill,
    colorVar: 'var(--color-supera-perfeicao)',
  },
  scheduling: {
    label: 'Agendamento',
    description: 'Remarcar, confirmar, dúvidas de agenda',
    icon: Calendar,
    colorVar: 'var(--color-primary-deep)',
  },
  symptoms: {
    label: 'Sintomas',
    description: 'Relatar como está se sentindo',
    icon: Activity,
    colorVar: 'var(--color-supera-empatia)',
  },
  other: {
    label: 'Outros',
    description: 'Qualquer outra dúvida',
    icon: CircleQuestionMark,
    colorVar: 'var(--color-supera-uniao)',
  },
};

/** Assunto do chat das conversas abertas a partir de um compromisso da Agenda. */
export const SCHEDULING_SUBJECT_CODE = 'scheduling';

/** Assunto do chat das conversas abertas a partir de um registro do Diário. */
export const SYMPTOMS_SUBJECT_CODE = 'symptoms';

/**
 * A conversa ainda ABERTA do paciente num assunto, ou `null`.
 *
 * É ela que "Falar com a equipe" reabre, em vez de abrir outra: o banco liga a
 * conversa só ao assunto (`start_conversation(p_subject_id, p_body)`), não ao
 * compromisso ou ao registro, então o assunto é o que dá para casar. Com mais
 * de uma aberta (as de antes desta regra), fica a de atividade mais recente —
 * a lista já vem ordenada por `last_message_at`. Conversa resolvida não conta:
 * nela não se escreve mais.
 */
export function findOpenConversation<T extends Pick<ConversationSummary, 'isOpen' | 'subjectCode'>>(
  conversations: readonly T[],
  subjectCode: string
): T | null {
  return conversations.find((item) => item.isOpen && item.subjectCode === subjectCode) ?? null;
}

/**
 * O `draft` do estado de navegação da conversa (`ConversationLocationState`),
 * ou `''`. O estado do roteador chega como `unknown`: vem de qualquer
 * `navigate`, e de um histórico antigo do navegador.
 */
export function readConversationDraft(state: unknown): string {
  if (typeof state === 'object' && state !== null && 'draft' in state && typeof state.draft === 'string') {
    return state.draft;
  }
  return '';
}

/** Começo da mensagem sobre um registro do Diário: "Sobre o meu registro do diário de hoje: ". */
export function buildDiaryChatDraft(entryDate: Date): string {
  const day = isToday(entryDate) ? 'hoje' : formatShortDate(entryDate);
  return `Sobre o meu registro do diário de ${day}: `;
}

/**
 * Apresentação de um assunto, ou `null` se o código não for conhecido.
 *
 * `null` em vez de um fallback genérico porque a tela já sabe se virar sem
 * ícone (cai no `MessageCircle` neutro): inventar cor e descrição para um
 * assunto novo cadastrado no banco seria pior que não mostrar nenhuma.
 */
export function getSubjectInfo(code: string | null | undefined): ChatSubjectInfo | null {
  if (!code) return null;

  return CHAT_SUBJECTS[code] ?? null;
}

/**
 * Texto de uma mensagem de imagem sem legenda.
 *
 * `messages.body` tem CHECK de não-vazio — não existe mensagem "só imagem"
 * no banco. Quando ninguém digita legenda, é este texto que vai no `body`.
 * Compartilhado entre `services/chat.ts` (que o grava) e a tela de conversa (que
 * compara com ele para decidir se mostra a legenda ou só a imagem).
 *
 * Sem emoji: quem anuncia a imagem na interface é o ícone de imagem do
 * lucide, igual a todos os outros ícones do app. O emoji renderizava com a
 * fonte do sistema — outro desenho, outro peso, outra cor.
 */
export const IMAGE_WITHOUT_CAPTION_TEXT = 'Imagem';

/**
 * Placeholder gravado antes de o emoji sair daqui.
 *
 * Mensagem é dado imutável: o `body` das conversas antigas continua com o
 * emoji, e nenhuma migração vai reescrevê-lo. Reconhecer as duas formas é o
 * que impede a legenda antiga de voltar a aparecer como se tivesse sido
 * digitada.
 */
const LEGACY_IMAGE_WITHOUT_CAPTION_TEXT = '📷 Imagem';

/** `true` quando o corpo da mensagem é o placeholder de imagem sem legenda. */
export function isImageWithoutCaption(text: string): boolean {
  return text === IMAGE_WITHOUT_CAPTION_TEXT || text === LEGACY_IMAGE_WITHOUT_CAPTION_TEXT;
}

/** Paciente e acompanhante escrevem deste lado da conversa; a equipe e o sistema, do outro. */
function isFromThisSide(message: Pick<ChatMessage, 'author'>): boolean {
  return message.author === 'patient' || message.author === 'caregiver';
}

/** De que lado da conversa a mensagem aparece. */
export function getMessageSide(message: Pick<ChatMessage, 'author'>): MessageSide {
  if (message.author === 'system') return 'system';
  return isFromThisSide(message) ? 'own' : 'team';
}

/** Mensagens com até este intervalo entre si, do mesmo remetente, ficam no mesmo grupo. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Organiza a conversa em dias e, dentro de cada dia, em grupos de mensagens
 * seguidas do mesmo remetente (mesmo lado, mesmo tipo de autor e mesma conta),
 * com até 5 minutos entre uma e outra. A tela mostra quem escreveu uma vez por
 * grupo, e as bolhas do grupo ficam coladas.
 *
 * Recebe a lista em ordem cronológica, como a tela já monta.
 */
export function groupMessagesByDay(messages: EnrichedMessage[]): MessageDay[] {
  const days: MessageDay[] = [];

  for (const message of messages) {
    const dayKey = message.date.toDateString();
    let day = days[days.length - 1];
    if (!day || day.key !== dayKey) {
      day = { key: dayKey, label: formatChatDayLabel(message.date), groups: [] };
      days.push(day);
    }

    const side = getMessageSide(message);
    const group = day.groups[day.groups.length - 1];
    const previous = group?.messages[group.messages.length - 1];
    const joinsGroup =
      side !== 'system' &&
      group !== undefined &&
      previous !== undefined &&
      group.side === side &&
      group.author === message.author &&
      group.authorAccountId === message.authorAccountId &&
      message.date.getTime() - previous.date.getTime() <= GROUP_WINDOW_MS;

    if (joinsGroup) {
      group.messages.push(message);
    } else {
      day.groups.push({
        key: message.id,
        side,
        author: message.author,
        authorAccountId: message.authorAccountId,
        messages: [message],
      });
    }
  }

  return days;
}

/** Posição de uma bolha dentro do grupo. */
export function getBubblePosition(index: number, total: number): BubblePosition {
  if (total === 1) return 'single';
  if (index === 0) return 'first';
  if (index === total - 1) return 'last';
  return 'middle';
}

/**
 * "Enviada" ou "Lida" de uma mensagem deste lado da conversa — `null` nas da
 * equipe e nas de sistema.
 *
 * "Lida" é a equipe inteira, nunca uma pessoa: `team_last_read_at` é agregado
 * de propósito, e o paciente vê QUE leram, jamais QUEM leu. Calculado na tela,
 * a cada render, a partir do cabeçalho: é o cabeçalho que o Realtime relê
 * quando a equipe lê, e assim o "Lida" aparece sem recarregar as mensagens.
 */
export function getDeliveryStatus(
  message: Pick<ChatMessage, 'author' | 'createdAt'>,
  teamLastReadAt: string | null
): MessageDeliveryStatus | null {
  if (!isFromThisSide(message)) return null;
  if (!teamLastReadAt) return 'sent';

  return new Date(teamLastReadAt).getTime() >= new Date(message.createdAt).getTime()
    ? 'read'
    : 'sent';
}

/** Quem está com a conversa aberta — a conta da sessão e o papel dela. */
export interface ChatViewer {
  accountId: string | null;
  isCaregiver: boolean;
}

/**
 * Quem escreveu uma mensagem deste lado, em poucas palavras — para o leitor de
 * tela ("Você, 14:32: …") e a legenda da imagem aberta. `null` nas da equipe
 * e nas de sistema, que a tela nomeia pela área.
 */
export function describeMessageAuthor(
  message: Pick<ChatMessage, 'author' | 'authorAccountId'>,
  viewer: ChatViewer
): string | null {
  if (!isFromThisSide(message)) return null;
  if (message.authorAccountId !== null && message.authorAccountId === viewer.accountId) return 'Você';
  if (!viewer.isCaregiver) return message.author === 'caregiver' ? 'Seu acompanhante' : 'Você';
  return message.author === 'patient' ? 'Quem você acompanha' : 'Outro acompanhante';
}

/**
 * Rótulo acima de uma mensagem deste lado que não foi escrita por quem está
 * olhando; `null` na própria mensagem e nas da equipe.
 *
 * Compara a conta, e não só o tipo de autor: na sessão do acompanhante, a
 * mensagem dele é dele — antes ela saía como "Enviada pelo seu acompanhante",
 * como se fosse de outra pessoa.
 */
export function describeMessageSender(
  message: Pick<ChatMessage, 'author' | 'authorAccountId'>,
  viewer: ChatViewer
): string | null {
  if (!isFromThisSide(message)) return null;
  if (message.authorAccountId !== null && message.authorAccountId === viewer.accountId) return null;

  if (!viewer.isCaregiver) {
    return message.author === 'caregiver' ? 'Enviada pelo seu acompanhante' : null;
  }

  return message.author === 'patient'
    ? 'Enviada por quem você acompanha'
    : 'Enviada por outro acompanhante';
}
