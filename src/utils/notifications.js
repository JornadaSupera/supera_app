import { Bell, MessageCircle, BookOpen, Calendar } from 'lucide-react';

export const TIPOS_NOTIFICACAO = {
  lembrete: {
    label: 'Lembrete',
    icon: Bell,
    colorVar: 'var(--color-supera-perfeicao)',
    destino: null,
  },
  chat: {
    label: 'Chat',
    icon: MessageCircle,
    colorVar: 'var(--color-supera-empatia)',
    destino: '/chat',
  },
  orientacao: {
    label: 'Orientação',
    icon: BookOpen,
    colorVar: 'var(--color-supera-uniao)',
    destino: '/orientacoes',
  },
  agenda: {
    label: 'Agenda',
    icon: Calendar,
    colorVar: 'var(--color-primary)',
    destino: '/agenda',
  },
};

export function getTipoNotificacaoInfo(tipo) {
  return TIPOS_NOTIFICACAO[tipo] || TIPOS_NOTIFICACAO.lembrete;
}
