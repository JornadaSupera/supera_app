import { cx } from '../../utils/classNames';
import styles from './IconHeading.module.css';

export default function IconHeading({
  icon: Icon,
  iconTone = 'var(--color-primary)',
  title,
  description,
  align = 'left',
  className = '',
  ...rest
}) {
  return (
    <div
      className={cx(styles.iconHeading, styles[align], className)}
      style={{ '--icon-tone': iconTone }}
      {...rest}
    >
      {Icon && (
        <div className={styles.bubble}>
          <Icon size={48} strokeWidth={1.5} className={styles.icon} aria-hidden="true" />
        </div>
      )}
      <h1 className={styles.title}>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </div>
  );
}
