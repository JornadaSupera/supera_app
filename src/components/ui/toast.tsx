import { CheckCircle2, XCircle, Info, Bell, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ToastVariant = 'default' | 'success' | 'error' | 'info';

const ICONS: Record<ToastVariant, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  default: Bell,
};

const ICON_TONES: Record<ToastVariant, string> = {
  success: 'text-primary-deep',
  error: 'text-destructive',
  info: 'text-primary-deep',
  default: 'text-muted-foreground',
};

export interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onClose?: () => void;
}

/**
 * Área onde os toasts empilham. Fica aqui, junto do próprio Toast, porque a
 * posição e o `pointer-events-none` só fazem sentido em conjunto — o
 * `pointer-events-auto` do card é o que devolve o clique ao botão de fechar.
 */
export const TOAST_VIEWPORT_CLASS =
  'pointer-events-none fixed right-0 bottom-[calc(1.5rem_+_var(--toast-lift,0px)_+_var(--safe-bottom))] left-0 z-[100] flex flex-col items-center gap-2 px-safe-4';

export default function Toast({ message, variant = 'default', onClose }: ToastProps) {
  const Icon = ICONS[variant] ?? ICONS.default;

  return (
    <div
      role="status"
      className="animate-toast-slide-up pointer-events-auto flex max-w-[360px] min-w-0 items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-sm"
    >
      {/* Ícone de 24 px centrado na primeira linha do texto (`text-body-sm`,
          21 px): sobra 1,5 px em cima e embaixo, que a margem negativa põe no
          respiro do cartão. O botão de fechar, também de 24 px, faz o mesmo. */}
      <span
        className={cn(
          '-my-[1.5px] flex size-6 shrink-0 items-center justify-center',
          ICON_TONES[variant] ?? ICON_TONES.default
        )}
      >
        <Icon size={24} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-card-foreground">{message}</p>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar notificação"
          className="relative -my-[1.5px] flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-muted-foreground after:absolute after:-inset-3 hover:text-foreground"
        >
          <X size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
