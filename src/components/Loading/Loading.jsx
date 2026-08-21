import Spinner from './Spinner';
import { cx } from '../../utils/classNames';
import styles from './Loading.module.css';

export default function Loading({ label = 'Carregando…', inline = false, className = '' }) {
  return (
    <div
      className={cx(styles.wrapper, inline ? styles.inline : styles.fullPage, className)}
      role="status"
      aria-live="polite"
    >
      <Spinner size={inline ? 'sm' : 'lg'} />
      {label && <span className={styles.label}>{label}</span>}
    </div>
  );
}
