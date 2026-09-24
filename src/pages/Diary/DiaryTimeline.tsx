import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import Tag from '../../components/ui/tag';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import AttentionBanner from './AttentionBanner';
import DiaryEntryList from './DiaryEntryList';
import DiaryEvolutionCard from './DiaryEvolutionCard';
import DiaryWeekSummary from './DiaryWeekSummary';
import { SymptomChipsSkeleton } from './DiarySkeletons';
import { useDiaryEntries, useSymptoms, useTodayEntry } from '../../hooks/useDiary';

export default function DiaryTimeline() {
  const [periodDays, setPeriodDays] = useState<number | null>(null);
  const [symptomFilter, setSymptomFilter] = useState<string | null>(null);

  // Cada bloco da tela — cabeçalho, gráfico, filtros e lista — cuida do
  // próprio carregamento e do próprio erro. Nenhum deles segura a página
  // inteira, e nenhum falha calado: um bloco que não carregou nunca parece
  // vazio.
  const { data: symptoms, isLoading: loadingSymptoms } = useSymptoms();

  const entriesQuery = useDiaryEntries({
    periodDays: periodDays === null ? undefined : periodDays,
    symptomId: symptomFilter === null ? undefined : symptomFilter,
  });

  // O aviso do topo é sobre o registro de hoje, lido sem os filtros da lista
  // (e já em cache, vindo da Home). Fora do loading e do erro da tela de
  // propósito: é um aviso, e se a leitura falha ele só não aparece — o mesmo
  // sinal continua no selo do card e no detalhe do registro.
  const { data: today } = useTodayEntry();
  const todayAlertEntry = today?.entry?.hasAlert ? today.entry : null;

  return (
    <TabScreen
      header={
        <TabHeader eyebrow="MEU DIÁRIO" title="Como tenho me sentido">
          <DiaryWeekSummary />
        </TabHeader>
      }
    >
      {todayAlertEntry && (
        <div className="mx-6 mt-4">
          <AttentionBanner
            title="Seu registro de hoje tem sintomas fortes"
            entryId={todayAlertEntry.id}
          />
        </div>
      )}

      <DiaryEvolutionCard periodDays={periodDays} />

      <div className="mx-6 mt-4 flex flex-col gap-2">
        <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
          <Tag selected={periodDays === null} onClick={() => setPeriodDays(null)}>
            Tudo
          </Tag>
          <Tag selected={periodDays === 7} onClick={() => setPeriodDays(7)}>
            7 dias
          </Tag>
          <Tag selected={periodDays === 30} onClick={() => setPeriodDays(30)}>
            30 dias
          </Tag>
        </div>

        {loadingSymptoms ? (
          <SymptomChipsSkeleton />
        ) : (
          // Se o catálogo falhou, a fileira some e o aviso com "Tentar de novo"
          // é o do cartão do gráfico, que lê o mesmo catálogo.
          symptoms && (
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
              <Tag selected={symptomFilter === null} onClick={() => setSymptomFilter(null)}>
                Todos os sintomas
              </Tag>
              {symptoms.map((symptom) => (
                <Tag
                  key={symptom.id}
                  selected={symptomFilter === symptom.id}
                  onClick={() => setSymptomFilter(symptom.id)}
                >
                  {symptom.label}
                </Tag>
              ))}
            </div>
          )
        )}
      </div>

      <DiaryEntryList
        query={entriesQuery}
        filtered={periodDays !== null || symptomFilter !== null}
      />

      <Link
        to="/diario/novo"
        aria-label="Novo registro no diário"
        // Sombra composta (padrão + halo na cor da marca) escrita como um único
        // arbitrary value, igual ao box-shadow original — ver o mesmo padrão em
        // Input.tsx (foco) por este projeto evitar as utilities `ring-*`.
        className="fixed right-6 bottom-[80px] z-[25] inline-flex h-[52px] w-[52px] items-center justify-center rounded-full bg-[var(--color-supera-empatia)] text-white shadow-[var(--shadow-lg),0_0_0_4px_color-mix(in_srgb,var(--color-supera-empatia)_20%,transparent)] transition-transform duration-150 ease-[ease] hover:scale-105 active:scale-95"
      >
        <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
      </Link>
    </TabScreen>
  );
}
