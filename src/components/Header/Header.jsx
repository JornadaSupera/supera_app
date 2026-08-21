import { ArrowLeft, ChevronLeft } from 'lucide-react';
import { cx } from '../../utils/classNames';
import styles from './Header.module.css';

export default function Header({
  variant = 'page',
  title,
  subtitle,
  meta,
  onBack,
  actions,
  sticky = false,
  bordered = false,
  blurred = false,
  className = '',
}) {
  const isStep = variant === 'step';
  const BackIcon = isStep ? ChevronLeft : ArrowLeft;
  const backIconSize = isStep ? 18 : 20;

  return (
    <header
      className={cx(
        styles.header,
        isStep && styles.step,
        sticky && styles.sticky,
        bordered && styles.bordered,
        blurred && styles.blurred,
        className
      )}
    >
      {onBack && (
        <button
          type="button"
          className={styles.backButton}
          onClick={onBack}
          aria-label="Voltar"
        >
          <BackIcon size={backIconSize} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
      {isStep ? (
        meta && <p className={styles.metaText}>{meta}</p>
      ) : (
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        </div>
      )}
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
