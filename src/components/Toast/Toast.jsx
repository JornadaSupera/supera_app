import { CheckCircle2, XCircle, Info, Bell, X } from 'lucide-react';
import { cx } from '../../utils/classNames';
import styles from './Toast.module.css';

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  default: Bell,
};

export default function Toast({ message, variant = 'default', onClose }) {
  const Icon = ICONS[variant] || ICONS.default;

  return (
    <div className={styles.toast} role="status">
      <span className={cx(styles.icon, styles[`icon--${variant}`])}>
        <Icon size={20} strokeWidth={2} aria-hidden="true" />
      </span>
      <div className={styles.body}>
        <p className={styles.message}>{message}</p>
      </div>
      {onClose && (
        <button
          type="button"
          className={styles.closeButton}
          onClick={onClose}
          aria-label="Fechar notificação"
        >
          <X size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
