import * as React from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number }>;

export interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  titleIcon?: IconComponent;
  /** Cor do ícone do título. Aceita token ou qualquer cor CSS. */
  titleIconTone?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
}

export default function Modal({
  open,
  onClose,
  title,
  titleIcon: TitleIcon,
  titleIconTone = 'var(--color-primary)',
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose?.();
    }

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      // A cor do véu é fixa (não é token): escurece por cima de qualquer tema.
      className="animate-overlay-fade-in fixed inset-0 z-[200] flex items-end justify-center bg-[rgba(6,20,18,0.5)]"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="animate-sheet-slide-up max-h-[88vh] w-full max-w-[480px] overflow-y-auto rounded-t-2xl bg-card text-card-foreground shadow-lg"
      >
        <div className="flex justify-center pt-2">
          <span className="h-1 w-9 rounded-full bg-border" />
        </div>

        {(title || onClose) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-4">
            {title && (
              <div className="flex min-w-0 items-center gap-2">
                {TitleIcon && (
                  <span
                    aria-hidden="true"
                    // A cor do ícone varia por instância (por isso custom
                    // property inline): nenhuma classe estática a expressa.
                    style={{ '--icon-tone': titleIconTone } as React.CSSProperties}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--icon-tone)_14%,transparent)] text-[var(--icon-tone)]"
                  >
                    <TitleIcon size={16} strokeWidth={2} />
                  </span>
                )}
                <h2 className="text-[18px] font-semibold text-foreground">{title}</h2>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-muted text-muted-foreground hover:text-foreground"
              >
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className="p-5">{children}</div>

        {footer && <div className="flex gap-3 px-5 pb-5">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
