import { Bell, MessageCircle, BookOpen, Calendar } from 'lucide-react';
import type { NotificationCategory, NotificationCategoryInfo } from '../types';

// Apresentação por CATEGORIA (`notification_types.category`), não por tipo:
// o banco tem 8 tipos e só 4 categorias, e é a categoria que decide ícone,
// cor e para qual módulo a notificação aponta. `alert` cai no ícone de sino
// — hoje só existe `critical_alert`, que nunca é produzido (ver README do
// banco), mas a categoria precisa de uma apresentação mesmo assim.
export const CATEGORIAS_NOTIFICACAO: Record<NotificationCategory, NotificationCategoryInfo> = {
  agenda: { label: 'Agenda', icon: Calendar, colorVar: 'var(--color-primary)' },
  chat: { label: 'Chat', icon: MessageCircle, colorVar: 'var(--color-supera-empatia)' },
  content: { label: 'Orientação', icon: BookOpen, colorVar: 'var(--color-supera-uniao)' },
  alert: { label: 'Alerta', icon: Bell, colorVar: 'var(--color-destructive)' },
};

export function getCategoriaNotificacaoInfo(
  categoria: NotificationCategory
): NotificationCategoryInfo {
  return CATEGORIAS_NOTIFICACAO[categoria] ?? CATEGORIAS_NOTIFICACAO.alert;
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
const ROTA_POR_TABELA: Record<string, (id: string) => string> = {
  appointments: (id) => `/agenda/${id}`,
  conversations: (id) => `/chat/${id}`,
  content_items: (id) => `/orientacoes/${id}`,
};

export function getDestinoNotificacao(
  targetTable: string | null,
  targetId: string | null
): string | null {
  if (!targetTable || !targetId) return null;

  return ROTA_POR_TABELA[targetTable]?.(targetId) ?? null;
}
