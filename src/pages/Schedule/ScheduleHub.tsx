import { useState } from 'react';
import { cn } from '@/lib/utils';
import BottomTab from '../../components/ui/bottom-tab';
import ScheduleListView from './ScheduleListView';
import ScheduleWeekView from './ScheduleWeekView';
import ScheduleMonthView from './ScheduleMonthView';

type ScheduleViewKey = 'mensal' | 'semanal' | 'lista';

const VIEWS: { key: ScheduleViewKey; label: string }[] = [
  { key: 'mensal', label: 'Mensal' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'lista', label: 'Lista' },
];

export default function ScheduleHub() {
  const [view, setView] = useState<ScheduleViewKey>('lista');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-6 pb-4 backdrop-blur-[8px]">
        <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
          MINHA AGENDA
        </p>
        <h1 className="mt-0.5 text-[24px] font-semibold tracking-[-0.6px] text-foreground">
          Compromissos
        </h1>

        <div className="mt-4 flex items-center gap-0.5 rounded-full bg-muted p-[3px]">
          {VIEWS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={cn(
                'flex-1 cursor-pointer rounded-full border-none bg-transparent px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-[ease]',
                view === item.key && 'bg-card text-primary shadow-sm'
              )}
              onClick={() => setView(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <main className="flex-1 px-6 pt-5 pb-8">
        {view === 'lista' && <ScheduleListView />}
        {view === 'semanal' && <ScheduleWeekView />}
        {view === 'mensal' && <ScheduleMonthView />}
      </main>

      <BottomTab />
    </div>
  );
}
