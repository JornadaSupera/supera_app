import { Pill, Calendar, Activity, CircleQuestionMark } from 'lucide-react';
import type { ChatSubjectInfo } from '../types';

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
