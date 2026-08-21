import { cx } from '../../utils/classNames';
import styles from './Tag.module.css';

export default function Tag({
  children,
  color = 'var(--color-primary)',
  selected = false,
  onClick,
  className = '',
  ...rest
}) {
  const selectable = Boolean(onClick);
  const Element = selectable ? 'button' : 'span';

  return (
    <Element
      type={selectable ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={selectable ? selected : undefined}
      className={cx(styles.tag, selectable && styles.selectable, selected && styles.selected, className)}
      style={{ '--tag-color': color }}
      {...rest}
    >
      {children}
    </Element>
  );
}
