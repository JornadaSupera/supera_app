import { Check } from 'lucide-react';
import { cx } from '../../utils/classNames';
import styles from './Checkbox.module.css';

export default function Checkbox({
  id,
  checked = false,
  onChange,
  label,
  className = '',
  ...rest
}) {
  const handleChange = (event) => {
    onChange?.(event.target.checked);
  };

  return (
    <label htmlFor={id} className={cx(styles.card, className)}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        onChange={handleChange}
        className={styles.input}
        {...rest}
      />
      <span className={styles.box} aria-hidden="true">
        {checked && <Check size={12} strokeWidth={3} className={styles.check} />}
      </span>
      <span className={styles.label}>{label}</span>
    </label>
  );
}
