import { useRef, type CSSProperties, type TouchEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { cn } from '../../lib/utils';
import { useMarkNotificationRead } from '../../hooks/useNotifications';
import type { NotificationDetail } from '../../types';

/** Distância de arrasto que conta como "deslizar", e não como toque torto. */
const SWIPE_THRESHOLD = 60;

interface NotificationsPreviewProps {
  notificacoes?: NotificationDetail[];
}

/**
 * Prévia da Home: só o que ainda não foi lido.
 *
 * O mapa contratado pede marcar como lida por toque ou deslizando. O toque
 * abre o registro de origem e marca junto; deslizar para o lado marca sem
 * sair da Home, para quem só quer limpar a lista.
 */
export default function NotificationsPreview({ notificacoes = [] }: NotificationsPreviewProps) {
  const navigate = useNavigate();
  const marcarComoLida = useMarkNotificationRead();
  const toqueInicialX = useRef(0);

  if (!notificacoes.length) return null;

  function aoTocar(item: NotificationDetail) {
    marcarComoLida.mutate(item.id);
    if (item.destino) navigate(item.destino);
  }

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

          function aoIniciarToque(evento: TouchEvent<HTMLButtonElement>) {
            toqueInicialX.current = evento.touches[0].clientX;
          }

          function aoTerminarToque(evento: TouchEvent<HTMLButtonElement>) {
            const distancia = Math.abs(
              evento.changedTouches[0].clientX - toqueInicialX.current
            );
            // Deslizou: marca como lida e fica na Home.
            if (distancia > SWIPE_THRESHOLD) {
              evento.preventDefault();
              marcarComoLida.mutate(item.id);
            }
          }

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => aoTocar(item)}
              onTouchStart={aoIniciarToque}
              onTouchEnd={aoTerminarToque}
              className={cn(
                'flex w-full cursor-pointer items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left [touch-action:pan-y]',
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
                <Icon size={16} strokeWidth={2} aria-hidden="true" />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-foreground">
                  {item.titulo}
                </span>
                {/* A linha de `notifications` não tem texto: a prévia é
                    montada a partir do registro de origem. */}
                {item.previa && (
                  <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                    {item.previa}
                  </span>
                )}
              </span>

              <span className="flex-shrink-0 text-[10px] whitespace-nowrap text-muted-foreground">
                {item.horaLabel}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
