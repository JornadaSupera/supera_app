import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import styles from './Modal.module.css';

export default function Modal({
  open,
  onClose,
  title,
  titleIcon: TitleIcon,
  titleIconTone = 'var(--color-primary)',
  children,
  footer,
}) {
  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
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
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={styles.panel} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.grabber}>
          <span className={styles.grabberBar} />
        </div>
        {(title || onClose) && (
          <div className={styles.header}>
            {title && (
              <div className={styles.titleGroup}>
                {TitleIcon && (
                  <span
                    className={styles.titleIconWrapper}
                    style={{ '--icon-tone': titleIconTone }}
                    aria-hidden="true"
                  >
                    <TitleIcon size={16} strokeWidth={2} />
                  </span>
                )}
                <h2 className={styles.title}>{title}</h2>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                className={styles.closeButton}
                onClick={onClose}
                aria-label="Fechar"
              >
                <X size={18} strokeWidth={2} aria-hidden="true" />
              </button>
            )}
          </div>
        )}
        <div className={styles.body}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
