// Tipos do domínio Notificações — modelados sobre `notifications`,
// `notification_types` e `notification_preferences`.
//
// A diferença mais importante em relação ao mock: `notifications` NÃO tem
// coluna de texto. O título é genérico, por tipo (`notification_types.label`
// — "Nova mensagem da equipe", não "Camila respondeu no chat"), e não há
// prévia nenhuma para derivar: o alvo (`target_table`/`target_id`) é
// polimórfico e sem FK, então não dá para buscar o conteúdo original sem uma
// consulta por tipo de alvo. Em vez de inventar uma prévia, o cartão usa
// `target_table`/`target_id` para navegar direto ao registro de origem
// (`/chat/:id`, `/agenda/:id`, `/orientacoes/:id`) — mais preciso que o mock,
// que só linkava para a lista.

import type { LucideIcon } from 'lucide-react';

/** As 4 categorias fixas de `notification_types.category` (CHECK no banco). */
export type NotificationCategory = 'agenda' | 'chat' | 'content' | 'alert';

/**
 * Apresentação de uma categoria — ícone, cor e como montar a rota do alvo.
 * Fica no cliente porque o banco não guarda nem ícone (Lucide é conceito de
 * front) nem rota.
 */
export interface NotificationCategoryInfo {
  label: string;
  icon: LucideIcon;
  colorVar: string;
}

/**
 * Uma notificação da caixa de entrada, já com a apresentação resolvida.
 *
 * Sem `descricao`/`autor`: não existem no banco (ver nota do arquivo).
 */
export interface NotificationDetail {
  id: string;
  category: NotificationCategory;
  categoryInfo: NotificationCategoryInfo;
  /** = `notification_types.label`. Único texto que a notificação carrega. */
  titulo: string;
  lida: boolean;
  arquivada: boolean;
  /** ISO 8601 — `notifications.created_at`. */
  criadoEm: string;
  horaLabel: string;
  /**
   * Rota do registro de origem, montada a partir de `target_table`/
   * `target_id`. `null` quando a notificação não aponta para um registro
   * (ex.: `critical_alert`, que hoje nunca é produzido) — nesse caso o
   * cartão não é um link.
   */
  destino: string | null;
}

/** Opções de `getNotificacoes` (prévia da Home). */
export interface NotificationsQueryOptions {
  limit?: number;
}

/**
 * Um tipo de notificação silenciável, com o estado do toggle desta conta.
 *
 * A lista vem do banco (`notification_types` onde `is_silenceable = true`),
 * não de uma constante do front: é assim que `critical_alert`
 * (`is_silenceable = false`) nunca aparece aqui — a mesma cláusula que
 * filtra a lista já é o "esconda o toggle" que o guia do banco pede, sem
 * precisar de uma exclusão manual que alguém esqueceria de manter.
 */
export interface NotificationPreferenceToggle {
  typeId: string;
  code: string;
  label: string;
  category: NotificationCategory;
  /**
   * Canal `push`. Sem linha em `notification_preferences` = habilitado
   * (fail-open, é o desenho do banco) — é por isso que este campo nunca vem
   * `undefined`: a ausência de linha já foi resolvida para `true` antes de
   * chegar aqui.
   */
  enabled: boolean;
}
