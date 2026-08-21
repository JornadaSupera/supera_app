import { Inbox } from 'lucide-react';
import Button from '../Button';
import { cx } from '../../utils/classNames';
import styles from './EmptyState.module.css';

export default function EmptyState({
  icon: Icon = Inbox,
  title = 'Nada por aqui ainda',
  description,
  actionLabel,
  onAction,
  className = '',
}) {
  return (
    <div className={cx(styles.wrapper, className)}>
      <span className={styles.iconWrapper}>
        <Icon size={28} strokeWidth={1.75} aria-hidden="true" />
      </span>
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {actionLabel && onAction && (
        <div className={styles.action}>
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
