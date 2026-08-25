import { NavLink } from 'react-router';
import { Activity, Calendar, BookOpen, MessageCircle, User } from 'lucide-react';
import { cx } from '../../utils/classNames';
import styles from './BottomTab.module.css';

const ITEMS = [
  { to: '/home', label: 'Início', icon: Activity, end: true },
  { to: '/agenda', label: 'Agenda', icon: Calendar },
  { to: '/diario', label: 'Diário', icon: BookOpen },
  { to: '/chat', label: 'Chat', icon: MessageCircle },
  { to: '/perfil', label: 'Perfil', icon: User },
];

export default function BottomTab() {
  return (
    <nav className={styles.nav} aria-label="Navegação principal">
      <ul className={styles.list}>
        {ITEMS.map(({ to, label, icon: Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) => cx(styles.item, isActive && styles.active)}
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 2} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
