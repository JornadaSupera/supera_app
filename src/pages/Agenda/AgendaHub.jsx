import { useState } from 'react';
import BottomTab from '../../components/BottomTab';
import { cx } from '../../utils/classNames';
import AgendaListView from './AgendaListView';
import AgendaWeekView from './AgendaWeekView';
import AgendaMonthView from './AgendaMonthView';
import styles from './AgendaHub.module.css';

const VIEWS = [
  { key: 'lista', label: 'Lista' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'mensal', label: 'Mensal' },
];

export default function AgendaHub() {
  const [view, setView] = useState('lista');

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>MINHA AGENDA</p>
        <h1 className={styles.title}>Compromissos</h1>

        <div className={styles.tabs}>
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cx(styles.tab, view === item.key && styles.tabActive)}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className={styles.content}>
        {view === 'lista' && <AgendaListView />}
        {view === 'semanal' && <AgendaWeekView />}
        {view === 'mensal' && <AgendaMonthView />}
      </main>

      <BottomTab />
    </div>
  );
}
