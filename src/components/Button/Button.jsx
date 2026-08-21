import Spinner from '../Loading/Spinner';
import { cx } from '../../utils/classNames';
import styles from './Button.module.css';

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  pill = false,
  iconLeft: IconLeft,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  ...rest
}) {
  const iconOnly = !children && (IconLeft || IconRight);
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 16 : 18;

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        pill && styles.pill,
        iconOnly && styles.iconOnly,
        className
      )}
      {...rest}
    >
      {loading ? (
        <Spinner size={iconSize} />
      ) : (
        <>
          {IconLeft && (
            <span className={styles.icon}>
              <IconLeft size={iconSize} strokeWidth={2} aria-hidden="true" />
            </span>
          )}
          {children}
          {IconRight && (
            <span className={styles.icon}>
              <IconRight size={iconSize} strokeWidth={2} aria-hidden="true" />
            </span>
          )}
        </>
      )}
    </button>
  );
}
