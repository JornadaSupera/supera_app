// Tipos do domínio Notificações — modelados sobre `notifications`,
// `notification_types` e `notification_preferences`.
//
// A linha de `notifications` NÃO tem texto. O título é o rótulo do tipo
// (`notification_types.label` — "Nova mensagem da equipe", não "Camila
// respondeu no chat"). A prévia é montada pelo serviço a partir do alvo
// (`target_table`/`target_id`, polimórfico e sem FK), com uma consulta por
// tabela de alvo, em lote (`loadNotificationPreviews`); e o mesmo alvo leva o
// cartão direto ao registro de origem (`/chat/:id`, `/agenda/:id`,
// `/orientacoes/:id`).

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
 * Sem descrição nem autor: não existem no banco (ver nota do arquivo).
 */
export interface NotificationDetail {
  id: string;
  /**
   * `null` quando o tipo foi desativado: a política de `notification_types`
   * só devolve os ativos, e o embed volta vazio. Sem categoria, o aviso
   * aparece neutro — antes caía em "Alerta", que é vermelho e assusta.
   */
  category: NotificationCategory | null;
  categoryInfo: NotificationCategoryInfo;
  /** = `notification_types.label`. Único texto que a notificação carrega. */
  title: string;
  /**
   * Resumo do registro de origem, montado no cliente a partir do alvo
   * (`target_table`/`target_id`), como o guia do banco manda: a notificação
   * guarda a referência, nunca o conteúdo. `null` quando o alvo não existe
   * mais ou a RLS não o devolve.
   */
  preview: string | null;
  isRead: boolean;
  isArchived: boolean;
  /** ISO 8601 — `notifications.created_at`. */
  createdAt: string;
  timeLabel: string;
  /**
   * Rota do registro de origem, montada a partir de `target_table`/
   * `target_id`. `null` quando a notificação não aponta para um registro
   * (ex.: `critical_alert`, que hoje vai só para a equipe e não chega ao
   * paciente) — nesse caso o cartão não é um link.
   */
  destination: string | null;
}

/** `device_platform` do banco — a plataforma gravada em `device_tokens`. */
export type DevicePlatform = 'ios' | 'android' | 'web';

/** Opções de `getNotifications`. */
export interface NotificationsQueryOptions {
  limit?: number;
  /** Só as que ainda não foram lidas — é o que a Home mostra. */
  unreadOnly?: boolean;
  /** `false` (padrão) lê a caixa; `true`, o arquivo. */
  archived?: boolean;
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

/**
 * O toque num push. O push leva só a referência (`send-push`: `notification_id`,
 * `target_table`, `target_id`), nunca o conteúdo: o app abre o alvo e o lê pelo
 * banco, sob RLS. Os IDs já chegam conferidos como UUID.
 */
export interface PushOpen {
  notificationId: string | null;
  targetTable: string | null;
  targetId: string | null;
}

/**
 * Janela de silêncio da conta — `null`/`null` quando nunca foi configurada.
 * Formato `HH:MM` (coluna `time` do Postgres), pronto para um `<input
 * type="time">`.
 */
export interface QuietHours {
  start: string | null;
  end: string | null;
}
