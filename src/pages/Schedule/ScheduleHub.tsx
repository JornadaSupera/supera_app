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
import GardenPainting from '../../components/ui/garden-painting';
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
        <TabHeader eyebrow="Minha agenda" title="Compromissos">
          <div
            role="group"
            aria-label="Visão da agenda"
            className="mt-4 flex items-center gap-1 rounded-full bg-muted p-1"
          >
            {VIEWS.map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={view === item.key}
                className={cn(
                  // Botão de 40 px com o texto de rótulo do guia (`text-label`,
                  // 14/20); o `after` estende o toque pelos 4 px do trilho, até
                  // os 48 px. O fio na opção escolhida: no tema escuro o card e
                  // o trilho têm a mesma cor, e a escolha não pode ser só a cor
                  // do texto.
                  'relative min-h-10 flex-1 cursor-pointer rounded-full border-none bg-transparent px-4 text-label font-semibold text-muted-foreground transition-[background-color,color] duration-150 ease-[ease] after:absolute after:inset-x-0 after:-inset-y-1',
                  view === item.key && 'bg-card text-primary-deep shadow-sm ring-1 ring-border'
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
      {/* `--garden-h`: a parte à vista do gramado florido, acima da barra de
          abas, igual à da Início (42% da largura, até 220 px). O respiro de baixo, da mesma
          altura, deixa o fim da agenda parar acima da pintura. */}
      <main className="flex-1 px-4 pt-6 pb-[calc(var(--garden-h)_+_1rem)] [--garden-h:min(42vw,220px)]">
        {view === 'list' && <ScheduleListView typeCode={tipoFiltro} />}
        {view === 'week' && <ScheduleWeekView typeCode={tipoFiltro} />}
        {view === 'month' && <ScheduleMonthView typeCode={tipoFiltro} />}

        {/* O gramado florido do guia preso ao pé da tela, igual ao da Início:
            inteiro, apoiado em cima da barra de abas (74 px mais o recuo do
            aparelho), e os cartões rolam por cima dele. Ao abrir um
            compromisso, o detalhe troca para as flores de canto. */}
        <GardenPainting
          kind="band"
          className="fixed inset-x-0 bottom-[calc(4.625rem_+_var(--safe-bottom))] -z-10 h-[var(--garden-h)]"
        />
      </main>
    </TabScreen>
  );
}
