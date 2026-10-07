import { useState } from 'react';
import { Link } from 'react-router';
import { Plus } from 'lucide-react';
import Tag from '../../components/ui/tag';
import ChipRow from '../../components/ui/chip-row';
import { buttonVariants } from '../../components/ui/button';
import GardenPainting from '../../components/ui/garden-painting';
import TabHeader from '../../components/ui/tab-header';
import TabScreen from '../../components/ui/tab-screen';
import AttentionBanner from './AttentionBanner';
import DiaryEntryList from './DiaryEntryList';
import DiaryEvolutionCard from './DiaryEvolutionCard';
import DiaryWeekSummary from './DiaryWeekSummary';
import { SymptomChipsSkeleton } from './DiarySkeletons';
import { useDiaryEntries, useSymptoms, useTodayEntry } from '../../hooks/useDiary';
import { cn } from '../../lib/utils';
import { buildDiaryChatDraft } from '../../utils/chat';

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
  const filtered = periodDays !== null || symptomFilter !== null;

  // Quem ainda não fez registro nenhum: sem gráfico vazio e sem filtros que não
  // filtram nada. O convite para o primeiro registro sobe para logo abaixo do
  // cabeçalho — antes ele ficava abaixo da dobra, e a tela parecia vazia. Só
  // com a lista SEM filtro e já confirmada (nunca a de um filtro anterior em
  // espera), para os filtros não sumirem no meio de uma troca.
  const hasNoEntries =
    !filtered &&
    entriesQuery.isSuccess &&
    !entriesQuery.isPlaceholderData &&
    (entriesQuery.data?.length ?? 0) === 0;
  const hasEntries = (entriesQuery.data?.length ?? 0) > 0;

  // O aviso do topo é sobre o registro de hoje, lido sem os filtros da lista
  // (e já em cache, vindo da Home). Fora do loading e do erro da tela de
  // propósito: é um aviso, e se a leitura falha ele só não aparece — o mesmo
  // sinal continua no selo do card e no detalhe do registro.
  const { data: today } = useTodayEntry();
  const todayAlertEntry = today?.entry?.hasAlert ? today.entry : null;

  return (
    <TabScreen
      header={
        <TabHeader eyebrow="Meu diário" title="Como tenho me sentido">
          {/* O "Novo registro" logo abaixo do título, no cabeçalho fixo: está
              sempre à vista e diz o que faz (pedido de 07/10 — no lugar do
              botão flutuante "+", que não se entendia). A cápsula discreta das
              ações de topo, a mesma do "Falar com a equipe". A cor vai no ícone
              e no `span`: o reset global (`a { color: inherit }`, fora de
              `@layer`) vence a do botão no `<a>`. */}
          <div className="mt-3 flex">
            <Link to="/diario/novo" className={cn(buttonVariants({ variant: 'soft', size: 'compact', pill: true }))}>
              <Plus size={18} strokeWidth={2} aria-hidden="true" className="shrink-0 text-primary-deep" />
              <span className="text-primary-deep">Novo registro</span>
            </Link>
          </div>
          <DiaryWeekSummary />
        </TabHeader>
      }
    >
      {/* Recuo de 16 px (`mx-4`), a margem das telas no guia, a mesma do
          cabeçalho. Entre o cabeçalho, o aviso, o gráfico, os filtros e a
          lista, 24 px (o espaço entre cards e blocos do guia): o primeiro
          bloco fica à mesma distância do cabeçalho, com ou sem o aviso. */}
      {todayAlertEntry && (
        <div className="mx-4 mt-6">
          <AttentionBanner
            title="Seu registro de hoje tem sintomas fortes"
            entryId={todayAlertEntry.id}
            chatDraft={buildDiaryChatDraft(todayAlertEntry.date)}
          />
        </div>
      )}

      {!hasNoEntries && <DiaryEvolutionCard periodDays={periodDays} />}

      <div className={cn('mx-4 mt-6 flex flex-col gap-2', hasNoEntries && 'hidden')}>
        <ChipRow>
          <Tag selected={periodDays === null} onClick={() => setPeriodDays(null)}>
            Tudo
          </Tag>
          <Tag selected={periodDays === 7} onClick={() => setPeriodDays(7)}>
            7 dias
          </Tag>
          <Tag selected={periodDays === 30} onClick={() => setPeriodDays(30)}>
            30 dias
          </Tag>
        </ChipRow>

        {loadingSymptoms ? (
          <SymptomChipsSkeleton />
        ) : (
          // Se o catálogo falhou, a fileira some e o aviso com "Tentar de novo"
          // é o do cartão do gráfico, que lê o mesmo catálogo.
          symptoms && (
            <ChipRow>
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
            </ChipRow>
          )
        )}
      </div>

      <DiaryEntryList query={entriesQuery} filtered={filtered} />

      {/* O canteiro do guia no fim da rolagem, como na Início (pedido de
          07/10). A lista cresce (`flex-1`) e o empurra para junto da barra de
          abas quando há pouco registro. Só com registros: a lista vazia já
          traz a touceira, e o guia pede uma pintura por tela. */}
      {hasEntries && <GardenPainting kind="band" className="h-[min(42vw,220px)]" />}
    </TabScreen>
  );
}
