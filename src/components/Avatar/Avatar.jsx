import { cx } from '../../utils/classNames';
import styles from './Avatar.module.css';

function getInitials(name = '') {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({
  src,
  alt = '',
  name,
  size = 'md',
  ring = false,
  className = '',
  ...rest
}) {
  return (
    <span
      className={cx(styles.avatar, styles[size], ring && styles.ring, className)}
      {...rest}
    >
      {src ? (
        <img className={styles.image} src={src} alt={alt || name || ''} />
      ) : (
        <span aria-hidden="true">{getInitials(name)}</span>
      )}
    </span>
  );
}
