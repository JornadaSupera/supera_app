import { useState } from 'react';
import { cn } from '@/lib/utils';
import Tag from '../../components/ui/tag';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import ScheduleListView from './ScheduleListView';
import ScheduleWeekView from './ScheduleWeekView';
import ScheduleMonthView from './ScheduleMonthView';
import { useAppointmentTypes } from '../../hooks/useSchedule';

type ScheduleViewKey = 'mensal' | 'semanal' | 'lista';

const VIEWS: { key: ScheduleViewKey; label: string }[] = [
  { key: 'mensal', label: 'Mensal' },
  { key: 'semanal', label: 'Semanal' },
  { key: 'lista', label: 'Lista' },
];

export default function ScheduleHub() {
  const [view, setView] = useState<ScheduleViewKey>('lista');
  // Um filtro só para as três visões: trocar de visão não perde o recorte, e
  // o paciente não precisa filtrar de novo em cada uma.
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(null);

  // Os tipos vêm do catálogo do banco (só os ativos, na ordem cadastrada) —
  // lista fixa no app sairia do ar assim que a clínica criasse um tipo novo.
  const { data: tipos = [] } = useAppointmentTypes();

  return (
    <TabScreen
      header={
        <TabHeader eyebrow="MINHA AGENDA" title="Compromissos">
          <div
            role="group"
            aria-label="Visão da agenda"
            className="mt-4 flex items-center gap-0.5 rounded-full bg-muted p-[3px]"
          >
            {VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={view === item.key}
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

          {tipos.length > 0 && (
            <div
              role="group"
              aria-label="Filtrar por tipo de compromisso"
              className="mt-3 flex flex-nowrap gap-2 overflow-x-auto pb-1"
            >
              <Tag selected={tipoFiltro === null} onClick={() => setTipoFiltro(null)}>
                Todos
              </Tag>
              {tipos.map((tipo) => (
                <Tag
                  key={tipo.id}
                  selected={tipoFiltro === tipo.code}
                  onClick={() => setTipoFiltro(tipo.code)}
                >
                  {tipo.label}
                </Tag>
              ))}
            </div>
          )}
        </TabHeader>
      }
    >
      <main className="flex-1 px-6 pt-5 pb-8">
        {view === 'lista' && <ScheduleListView typeCode={tipoFiltro} />}
        {view === 'semanal' && <ScheduleWeekView typeCode={tipoFiltro} />}
        {view === 'mensal' && <ScheduleMonthView typeCode={tipoFiltro} />}
      </main>
    </TabScreen>
  );
}
