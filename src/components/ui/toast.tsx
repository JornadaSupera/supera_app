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
  success: 'text-primary',
  error: 'text-destructive',
  info: 'text-[var(--color-infusion-waiting)]',
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
  'pointer-events-none fixed right-0 bottom-6 left-0 z-[100] flex flex-col items-center gap-2 px-4';

export default function Toast({ message, variant = 'default', onClose }: ToastProps) {
  const Icon = ICONS[variant] ?? ICONS.default;

  return (
    <div
      role="status"
      className="animate-toast-slide-up pointer-events-auto flex max-w-[360px] min-w-[260px] items-start gap-3 rounded-lg border border-border bg-card px-4 py-3 text-card-foreground shadow-lg"
    >
      <span
        className={cn(
          'mt-px flex h-5 w-5 shrink-0 items-center justify-center',
          ICON_TONES[variant] ?? ICON_TONES.default
        )}
      >
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[14px]/[20px] font-medium text-card-foreground">{message}</p>
      </div>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar notificação"
          className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 text-muted-foreground hover:text-foreground"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
