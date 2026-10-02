import { useEffect, useState } from 'react';
import { useNavigationType } from 'react-router';
import { cn } from '@/lib/utils';
import Tag from '../../components/ui/tag';
import ChipRow from '../../components/ui/chip-row';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import ScheduleListView from './ScheduleListView';
import ScheduleWeekView from './ScheduleWeekView';
import ScheduleMonthView from './ScheduleMonthView';
import { useAppointmentTypes } from '../../hooks/useSchedule';
import { useScheduleViewStore } from '../../stores/scheduleViewStore';
import type { ScheduleViewKey } from '../../types';

const VIEWS: { key: ScheduleViewKey; label: string }[] = [
  { key: 'month', label: 'Mensal' },
  { key: 'week', label: 'Semanal' },
  { key: 'list', label: 'Lista' },
];

export default function ScheduleHub() {
  const navigationType = useNavigationType();

  // Voltar de um compromisso (navegação 'POP') devolve a Agenda como estava:
  // a visão, o filtro e — nas visões semanal e mensal, que leem o mesmo
  // `scheduleViewStore` — a semana, o mês e o dia escolhido. Entrar pela aba
  // ou por um atalho começa do zero, como sempre foi. Decidido uma vez, antes
  // de as visões lerem o que ficou guardado.
  const [initial] = useState(() => {
    if (navigationType !== 'POP') useScheduleViewStore.getState().reset();
    return useScheduleViewStore.getState();
  });

  const [view, setView] = useState<ScheduleViewKey>(initial.view);
  // Um filtro só para as três visões: trocar de visão não perde o recorte, e
  // o paciente não precisa filtrar de novo em cada uma.
  const [tipoFiltro, setTipoFiltro] = useState<string | null>(initial.typeCode);

  useEffect(() => {
    useScheduleViewStore.getState().update({ view, typeCode: tipoFiltro });
  }, [view, tipoFiltro]);

  function handleViewChange(next: ScheduleViewKey) {
    if (next === view) return;

    // Trocar de visão abre a nova em hoje, como antes: a semana e o mês
    // navegados só servem para a volta de um compromisso.
    useScheduleViewStore.getState().update({ weekReference: null, monthReference: null, selectedDay: null });
    setView(next);
  }

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
                  // `after`: área de toque de 44px sem mudar o desenho do seletor.
                  'relative flex-1 cursor-pointer rounded-full border-none bg-transparent px-3.5 py-1.5 text-[12px] font-medium text-muted-foreground transition-[background-color,color] duration-150 ease-[ease] after:absolute after:inset-x-0 after:-inset-y-[7px]',
                  view === item.key && 'bg-card text-primary shadow-sm'
                )}
                onClick={() => handleViewChange(item.key)}
              >
                {item.label}
              </button>
            ))}
          </div>

          {tipos.length > 0 && (
            <ChipRow role="group" aria-label="Filtrar por tipo de compromisso" offset="sm">
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
            </ChipRow>
          )}
        </TabHeader>
      }
    >
      <main className="flex-1 px-6 pt-5 pb-8">
        {view === 'list' && <ScheduleListView typeCode={tipoFiltro} />}
        {view === 'week' && <ScheduleWeekView typeCode={tipoFiltro} />}
        {view === 'month' && <ScheduleMonthView typeCode={tipoFiltro} />}
      </main>
    </TabScreen>
  );
}
