import { cx } from '../../utils/classNames';
import styles from './Badge.module.css';

const TONES = {
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary-foreground)',
  muted: 'var(--color-muted-foreground)',
  destructive: 'var(--color-destructive)',
  'mood-0': 'var(--color-mood-0)',
  'mood-1': 'var(--color-mood-1)',
  'mood-2': 'var(--color-mood-2)',
  'mood-3': 'var(--color-mood-3)',
  'mood-4': 'var(--color-mood-4)',
  'mood-5': 'var(--color-mood-5)',
  'infusion-waiting': 'var(--color-infusion-waiting)',
  'infusion-prep': 'var(--color-infusion-prep)',
  'infusion-active': 'var(--color-infusion-active)',
  'infusion-done': 'var(--color-infusion-done)',
};

export default function Badge({
  children,
  tone = 'primary',
  variant = 'subtle',
  size = 'sm',
  withDot = false,
  className = '',
  ...rest
}) {
  const color = TONES[tone] || tone;

  return (
    <span
      className={cx(styles.badge, styles[variant], styles[size], className)}
      style={{ '--badge-color': color }}
      {...rest}
    >
      {withDot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}
