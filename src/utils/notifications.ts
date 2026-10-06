import { Bell, MessageCircle, BookOpen, Calendar } from 'lucide-react';
import type { NotificationCategory, NotificationCategoryInfo } from '../types';

// Apresentação por CATEGORIA (`notification_types.category`), não por tipo:
// o banco tem 8 tipos e só 4 categorias, e é a categoria que decide ícone,
// cor e para qual módulo a notificação aponta. `alert` cai no ícone de sino
// — hoje só existe `critical_alert`, que vai só para a equipe e não chega ao
// paciente, mas a categoria precisa de uma apresentação mesmo assim.
//
// A cor é a dos ícones do guia da clínica (traço no verde escuro, `teal-deep`)
// em todas as categorias; o vermelho fica só para o alerta, a única cor
// vermelha do sistema. Quem diz a categoria é o ícone, não a cor.
export const NOTIFICATION_CATEGORIES: Record<NotificationCategory, NotificationCategoryInfo> = {
  agenda: { label: 'Agenda', icon: Calendar, colorVar: 'var(--color-primary-deep)' },
  chat: { label: 'Chat', icon: MessageCircle, colorVar: 'var(--color-primary-deep)' },
  content: { label: 'Orientação', icon: BookOpen, colorVar: 'var(--color-primary-deep)' },
  alert: { label: 'Alerta', icon: Bell, colorVar: 'var(--color-destructive)' },
};

/**
 * Apresentação de quem não tem categoria: o tipo foi desativado e o embed
 * volta vazio. Cinza e neutra de propósito — cair no vermelho de "Alerta"
 * fazia um aviso antigo de agenda parecer urgente.
 */
export const NEUTRAL_PRESENTATION: NotificationCategoryInfo = {
  label: 'Aviso',
  icon: Bell,
  colorVar: 'var(--color-muted-foreground)',
};

export function getNotificationCategoryInfo(
  categoria: NotificationCategory | null
): NotificationCategoryInfo {
  if (!categoria) return NEUTRAL_PRESENTATION;
  return NOTIFICATION_CATEGORIES[categoria] ?? NEUTRAL_PRESENTATION;
}

/**
 * Rota do registro de origem da notificação, a partir da coluna polimórfica
 * `target_table`/`target_id`.
 *
 * Não é RPC nem consulta extra — é montagem de string. Cobre só os três
 * alvos que os tipos hoje semeados na migration podem produzir
 * (`appointments`, `conversations`, `content_items`); qualquer outro valor
 * de `target_table` (tipo futuro que a clínica venha a cadastrar) cai em
 * `null`, e o cartão deixa de ser link em vez de montar uma rota inválida.
 */
const ROUTE_BY_TABLE: Record<string, (id: string) => string> = {
  appointments: (id) => `/agenda/${id}`,
  conversations: (id) => `/chat/${id}`,
  content_items: (id) => `/orientacoes/${id}`,
};

export function getNotificationDestination(
  targetTable: string | null,
  targetId: string | null
): string | null {
  if (!targetTable || !targetId) return null;

  return ROUTE_BY_TABLE[targetTable]?.(targetId) ?? null;
}
