import { cx } from '../../utils/classNames';
import styles from './IconHeading.module.css';

export default function IconHeading({
  icon: Icon,
  iconTone = 'var(--color-primary)',
  title,
  description,
  align = 'left',
  size = 'md',
  compact = false,
  className = '',
  ...rest
}) {
  return (
    <div
      className={cx(styles.iconHeading, styles[align], styles[size], className)}
      style={{ '--icon-tone': iconTone }}
      {...rest}
    >
      {Icon && (
        <div className={cx(styles.bubble, compact && styles.bubbleCompact)}>
          <Icon
            size={compact ? 28 : 48}
            strokeWidth={compact ? 1.75 : 1.5}
            className={styles.icon}
            aria-hidden="true"
          />
        </div>
      )}
      <h1 className={styles.title}>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
