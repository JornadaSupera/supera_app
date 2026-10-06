import * as React from 'react';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { pushBackHandler } from '@/lib/androidBackButton';

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
  titleIconTone = 'var(--color-primary-deep)',
  children,
  footer,
}: ModalProps) {
  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose?.();
    }

    document.addEventListener('keydown', handleKeyDown);

    // O voltar do Android fecha a folha antes de voltar de tela.
    const removeBackHandler = onClose ? pushBackHandler(onClose) : undefined;

    // Trava a rolagem na raiz (`html`), que é quem rola a página. No `body` não
    // serve: o `overflow-x: clip` do `html` (a trava do arrasto lateral, em
    // `index.css`) impede o `overflow` do `body` de chegar à página, e o `body`
    // virava uma caixa própria, da altura da tela. A página pulava para cima e
    // a barra de navegação (`sticky`) subia para o meio da tela atrás da folha.
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      removeBackHandler?.();
      root.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      // O véu (`--color-scrim`) é o mesmo nos dois temas: escurece por cima de qualquer um.
      className="animate-overlay-fade-in fixed inset-0 z-[200] flex items-end justify-center bg-scrim motion-reduce:animate-none"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        // `pb` com a barra de navegação do aparelho: a folha encosta na borda
        // de baixo, e os botões do Android (ou o indicador do iPhone) ficam por
        // cima do app.
        className="animate-sheet-slide-up max-h-[88vh] w-full max-w-[480px] overflow-x-clip overflow-y-auto rounded-t-2xl bg-card pb-[var(--safe-bottom)] text-card-foreground shadow-sm motion-reduce:animate-none"
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
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--icon-tone)_14%,transparent)] text-[var(--icon-tone)]"
                  >
                    <TitleIcon size={24} strokeWidth={2} />
                  </span>
                )}
                <h2 className="text-card-title font-bold text-foreground">{title}</h2>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                aria-label="Fechar"
                className="flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-muted text-muted-foreground hover:text-foreground"
              >
                <X size={24} strokeWidth={2} aria-hidden="true" />
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
