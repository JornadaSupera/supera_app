// Tipos do domínio Notificações — cobre `src/mocks/notifications.js` e os
// formatos enriquecidos que mockApi.js monta em cima dele.

import type { LucideIcon } from 'lucide-react';

/**
 * As 4 chaves de `TIPOS_NOTIFICACAO` em `src/utils/notifications.js` — enum
 * fechado (o lookup `getTipoNotificacaoInfo` valida, com fallback pra
 * 'lembrete').
 */
export type NotificationType = 'lembrete' | 'chat' | 'orientacao' | 'agenda';

/**
 * Forma de autor usada em `Notification.autor` — sem `cargo`, diferente de
 * `CareTeamMember` (messages.ts).
 */
export interface NotificationAuthor {
  nome: string;
  /** Sempre `null` nos mocks atuais — mesmo padrão de `CareTeamMember.foto` (messages.ts). */
  foto: string | null;
}

/**
 * Notificação como armazenada em `src/mocks/notifications.js` (6 registros
 * conferidos). `autor` é a única chave realmente ausente em alguns
 * registros — n1, n3, n4 e n5 não têm a chave `autor` de jeito nenhum; ela
 * só aparece em notificações tipo 'chat' (n2, n6). É por isso o único campo
 * opcional aqui — e `NotificationsPreview.jsx` confirma esse padrão na
 * prática (`item.tipo === 'chat' && item.autor`, usado como guarda antes de
 * ler `item.autor.nome`/`.foto`).
 */
export interface Notification {
  id: string;
  tipo: NotificationType;
  titulo: string;
  descricao: string;
  minutosAtras: number;
  lida: boolean;
  autor?: NotificationAuthor;
}

/** Notification depois de `getNotificacoes` (prévia da Home — lista curta, sem `tipoInfo`). */
export interface NotificationWithLabel extends Notification {
  horaLabel: string;
}

/** Entrada de `TIPOS_NOTIFICACAO[tipo]`. */
export interface NotificationTypeInfo {
  label: string;
  icon: LucideIcon;
  colorVar: string;
  /** Rota de destino ao tocar a notificação; `null` para 'lembrete' (as outras 3 têm rota). */
  destino: string | null;
}

/** Notification depois de `getTodasNotificacoes` (Central de Notificações). */
export interface NotificationDetail extends Notification {
  horaLabel: string;
  tipoInfo: NotificationTypeInfo;
}

/** Opções de `getNotificacoes`. */
export interface NotificationsQueryOptions {
  /** Limita a quantidade retornada; sem limite quando omitido. */
  limit?: number;
}
