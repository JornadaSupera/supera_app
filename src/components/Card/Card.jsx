import { cx } from '../../utils/classNames';
import styles from './Card.module.css';

export default function Card({
  children,
  variant = 'default',
  padding = 'md',
  decorated = false,
  as = 'div',
  href,
  onClick,
  className = '',
  ...rest
}) {
  const Tag = href ? 'a' : as;
  const clickable = Boolean(onClick || href);

  return (
    <Tag
      href={href}
      onClick={onClick}
      className={cx(
        styles.card,
        styles[variant],
        styles[`padding-${padding}`],
        clickable && styles.clickable,
        className
      )}
      {...rest}
    >
      {decorated && <span aria-hidden="true" className={styles.glow} />}
      <div className={styles.content}>{children}</div>
    </Tag>
  );
}
