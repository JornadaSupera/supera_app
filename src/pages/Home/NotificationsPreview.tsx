import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { cn } from '../../lib/utils';
import type { NotificationDetail } from '../../types';

interface NotificationsPreviewProps {
  notificacoes?: NotificationDetail[];
}

export default function NotificationsPreview({ notificacoes = [] }: NotificationsPreviewProps) {
  if (!notificacoes.length) return null;

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase">
          Notificações
        </h3>
        <Link to="/notificacoes" className="text-[12px] font-medium text-primary">
          ver todas
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {notificacoes.map((item) => {
          const Icon = item.categoryInfo.icon;

          return (
            <div
              key={item.id}
              className={cn(
                'flex items-start gap-3 rounded-xl border border-border bg-card p-3.5',
                !item.lida &&
                  'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_15%,transparent)]'
              )}
            >
              <span
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--notification-icon-color)_15%,transparent)] text-[var(--notification-icon-color)]"
                // Exceção deliberada à regra de não usar `style` inline: a cor
                // varia por instância (uma por categoria) — mesmo padrão de
                // `--notification-icon-color` usado em `NotificationItem.tsx`.
                style={{ '--notification-icon-color': item.categoryInfo.colorVar } as CSSProperties}
              >
                <Icon size={16} strokeWidth={2} />
              </span>

              {/* Só o título: `notifications` não tem coluna de texto — ver
                  `types/notifications.ts`. */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-foreground">{item.titulo}</p>
              </div>

              <span className="flex-shrink-0 text-[10px] whitespace-nowrap text-muted-foreground">
                {item.horaLabel}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
