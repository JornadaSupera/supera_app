import { useId } from 'react';
import { cx } from '../../utils/classNames';
import styles from './Input.module.css';

export default function Input({
  label,
  id,
  type = 'text',
  error,
  helperText,
  iconLeft: IconLeft,
  rightSlot,
  required = false,
  className = '',
  ...rest
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const describedBy = error ? `${inputId}-error` : helperText ? `${inputId}-helper` : undefined;

  return (
    <div className={cx(styles.field, className)}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && <span className={styles.required}>*</span>}
        </label>
      )}
      <div className={styles.inputWrapper}>
        {IconLeft && (
          <span className={styles.iconLeft}>
            <IconLeft size={18} strokeWidth={2} aria-hidden="true" />
          </span>
        )}
        <input
          id={inputId}
          type={type}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          className={cx(
            styles.input,
            IconLeft && styles.hasIconLeft,
            rightSlot && styles.hasRightSlot,
            error && styles.error
          )}
          {...rest}
        />
        {rightSlot && <span className={styles.rightSlot}>{rightSlot}</span>}
      </div>
      {error && (
        <span id={`${inputId}-error`} className={styles.errorText}>
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={`${inputId}-helper`} className={styles.helperText}>
          {helperText}
        </span>
      )}
    </div>
  );
}
