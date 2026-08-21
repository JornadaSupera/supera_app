import { useState } from 'react';
import BottomTab from '../../components/BottomTab';
import { cx } from '../../utils/classNames';
import ScheduleListView from './ScheduleListView';
import ScheduleWeekView from './ScheduleWeekView';
import ScheduleMonthView from './ScheduleMonthView';
import styles from './ScheduleHub.module.css';

const VIEWS = [
  { key: 'mensal', label: 'Mensal' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'lista', label: 'Lista' },
];

export default function ScheduleHub() {
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
        {view === 'lista' && <ScheduleListView />}
        {view === 'semanal' && <ScheduleWeekView />}
        {view === 'mensal' && <ScheduleMonthView />}
      </main>

      <BottomTab />
    </div>
  );
}
