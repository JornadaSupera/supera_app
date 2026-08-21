import { cx } from '../../utils/classNames';
import styles from './Switch.module.css';

export default function Switch({
  id,
  checked = false,
  onChange,
  label,
  disabled = false,
  className = '',
}) {
  return (
    <label htmlFor={id} className={cx(styles.wrapper, disabled && styles.disabled, className)}>
      {label && <span className={styles.label}>{label}</span>}
      <span className={styles.track} data-checked={checked}>
        <input
          type="checkbox"
          id={id}
          role="switch"
          aria-checked={checked}
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange?.(event.target.checked)}
          className={styles.input}
        />
        <span className={styles.thumb} aria-hidden="true" />
      </span>
    </label>
  );
}
