import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import styles from './AppointmentListItem.module.css';

export default function AppointmentListItem({ compromisso }) {
  const Icon = compromisso.icon;
  const statusLabel = compromisso.status === 'confirmado' ? 'Confirmado' : 'Realizado';

  return (
    <Link to={`/agenda/${compromisso.id}`} className={styles.item}>
      <span
        className={styles.iconBubble}
        style={{
          color: compromisso.colorVar,
          background: `color-mix(in srgb, ${compromisso.colorVar} 15%, transparent)`,
        }}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className={styles.content}>
        <div className={styles.topRow}>
          <p className={styles.titulo}>{compromisso.titulo}</p>
          <span className={styles.dataLabel}>{compromisso.dataLabel}</span>
        </div>

        <p className={styles.meta}>
          {compromisso.hora} · {compromisso.local}
        </p>

        <p className={styles.profissional}>
          com{' '}
          {compromisso.profissional
            ? `${compromisso.profissional.cargo} ${compromisso.profissional.nome}`
            : '—'}
        </p>

        {compromisso.status && <span className={styles.badge}>{statusLabel}</span>}
      </div>

      <ChevronRight
        size={16}
        strokeWidth={2}
        className={styles.chevron}
        aria-hidden="true"
      />
    </Link>
  );
}
