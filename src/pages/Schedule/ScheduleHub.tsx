import { useState } from 'react';
import { cn } from '@/lib/utils';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
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
    <TabScreen
      header={
        <TabHeader eyebrow="MINHA AGENDA" title="Compromissos">
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
        </TabHeader>
      }
    >
      <main className="flex-1 px-6 pt-5 pb-8">
        {view === 'lista' && <ScheduleListView />}
        {view === 'semanal' && <ScheduleWeekView />}
        {view === 'mensal' && <ScheduleMonthView />}
      </main>
    </TabScreen>
  );
}
