import { Link } from 'react-router-dom';
import { Activity, Calendar, BookOpen, MessageCircle } from 'lucide-react';
import styles from './ShortcutsGrid.module.css';

const SHORTCUTS = [
  {
    label: 'Diário',
    to: '/diario',
    icon: Activity,
    tone: 'var(--color-supera-empatia)',
  },
  {
    label: 'Agenda',
    to: '/agenda',
    icon: Calendar,
    tone: 'var(--color-primary)',
  },
  {
    label: 'Orientações',
    to: '/orientacoes',
    icon: BookOpen,
    tone: 'var(--color-secondary-foreground)',
    toneBg: 'var(--color-secondary)',
  },
  {
    label: 'Chat',
    to: '/chat',
    icon: MessageCircle,
    tone: 'var(--color-supera-uniao)',
  },
];

export default function ShortcutsGrid({ mensagensNaoLidas = 0 }) {
  return (
    <section>
      <h3 className={styles.title}>Atalhos</h3>

      <div className={styles.grid}>
        {SHORTCUTS.map((item) => {
          const Icon = item.icon;
          const showIndicator = item.label === 'Chat' && mensagensNaoLidas > 0;

          return (
            <Link key={item.to} to={item.to} className={styles.shortcut}>
              <span
                className={styles.iconWrapper}
                style={{
                  background:
                    item.toneBg ||
                    `color-mix(in srgb, ${item.tone} 15%, transparent)`,
                  color: item.tone,
                }}
              >
                <Icon size={16} strokeWidth={2} />
                {showIndicator && (
                  <span className={styles.indicator} aria-hidden="true" />
                )}
              </span>
              <span className={styles.label}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
