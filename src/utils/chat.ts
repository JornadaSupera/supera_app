import { Pill, Calendar, Activity, CircleQuestionMark } from 'lucide-react';
import type { ChatMessage, ChatSubjectInfo, MessageDeliveryStatus } from '../types';

// Apresentação dos assuntos do chat, chaveada pelo `code` de
// `conversation_subjects` — que no banco é em inglês. O `label` daqui é
// fallback: quem manda é o rótulo da tabela, que a clínica pode editar. O que
// só existe aqui são ícone, cor e descrição, que não têm coluna.
export const ASSUNTOS: Record<string, ChatSubjectInfo> = {
  medication: {
    label: 'Medicação',
    descricao: 'Dúvidas sobre comprimidos, horários, efeitos',
    icon: Pill,
    colorVar: 'var(--color-supera-perfeicao)',
  },
  scheduling: {
    label: 'Agendamento',
    descricao: 'Remarcar, confirmar, dúvidas de agenda',
    icon: Calendar,
    colorVar: 'var(--color-primary)',
  },
  symptoms: {
    label: 'Sintomas',
    descricao: 'Relatar como está se sentindo',
    icon: Activity,
    colorVar: 'var(--color-supera-empatia)',
  },
  other: {
    label: 'Outros',
    descricao: 'Qualquer outra dúvida',
    icon: CircleQuestionMark,
    colorVar: 'var(--color-supera-uniao)',
  },
};

/**
 * Apresentação de um assunto, ou `null` se o código não for conhecido.
 *
 * `null` em vez de um fallback genérico porque a tela já sabe se virar sem
 * ícone (cai no `MessageCircle` neutro): inventar cor e descrição para um
 * assunto novo cadastrado no banco seria pior que não mostrar nenhuma.
 */
export function getAssuntoInfo(code: string | null | undefined): ChatSubjectInfo | null {
  if (!code) return null;

  return ASSUNTOS[code] ?? null;
}

/**
 * Texto de uma mensagem de imagem sem legenda.
 *
 * `messages.body` tem CHECK de não-vazio — não existe mensagem "só imagem"
 * no banco. Quando ninguém digita legenda, é este texto que vai no `body`.
 * Compartilhado entre `mockApi.ts` (que o grava) e a tela de conversa (que
 * compara com ele para decidir se mostra a legenda ou só a imagem).
 *
 * Sem emoji: quem anuncia a imagem na interface é o ícone de imagem do
 * lucide, igual a todos os outros ícones do app. O emoji renderizava com a
 * fonte do sistema — outro desenho, outro peso, outra cor.
 */
export const IMAGEM_SEM_LEGENDA_TEXTO = 'Imagem';

/**
 * Placeholder gravado antes de o emoji sair daqui.
 *
 * Mensagem é dado imutável: o `body` das conversas antigas continua com o
 * emoji, e nenhuma migração vai reescrevê-lo. Reconhecer as duas formas é o
 * que impede a legenda antiga de voltar a aparecer como se tivesse sido
 * digitada.
 */
const IMAGEM_SEM_LEGENDA_TEXTO_LEGADO = '📷 Imagem';

/** `true` quando o corpo da mensagem é o placeholder de imagem sem legenda. */
export function isImagemSemLegenda(texto: string): boolean {
  return (
    texto === IMAGEM_SEM_LEGENDA_TEXTO || texto === IMAGEM_SEM_LEGENDA_TEXTO_LEGADO
  );
}

/** Paciente e acompanhante escrevem deste lado da conversa; a equipe e o sistema, do outro. */
function isFromThisSide(message: Pick<ChatMessage, 'autor'>): boolean {
  return message.autor === 'paciente' || message.autor === 'cuidador';
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
  message: Pick<ChatMessage, 'autor' | 'criadoEm'>,
  teamLastReadAt: string | null
): MessageDeliveryStatus | null {
  if (!isFromThisSide(message)) return null;
  if (!teamLastReadAt) return 'enviada';

  return new Date(teamLastReadAt).getTime() >= new Date(message.criadoEm).getTime()
    ? 'lida'
    : 'enviada';
}

/** Quem está com a conversa aberta — a conta da sessão e o papel dela. */
export interface ChatViewer {
  accountId: string | null;
  isCaregiver: boolean;
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
  message: Pick<ChatMessage, 'autor' | 'authorAccountId'>,
  viewer: ChatViewer
): string | null {
  if (!isFromThisSide(message)) return null;
  if (message.authorAccountId !== null && message.authorAccountId === viewer.accountId) return null;

  if (!viewer.isCaregiver) {
    return message.autor === 'cuidador' ? 'Enviada pelo seu acompanhante' : null;
  }

  return message.autor === 'paciente'
    ? 'Enviada por quem você acompanha'
    : 'Enviada por outro acompanhante';
}
