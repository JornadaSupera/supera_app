import { cx } from '../../utils/classNames';
import styles from './Logo.module.css';

export default function Logo({ size = 'md', className = '' }) {
  return (
    <span className={cx(styles.logo, styles[size], className)} role="img" aria-label="Supera Oncologia">
      <span className={styles.wordmark}>supera</span>
      <span className={styles.suffix}>oncologia</span>
    </span>
  );
}
