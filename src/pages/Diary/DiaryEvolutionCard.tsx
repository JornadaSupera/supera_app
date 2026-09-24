import { lazy, Suspense, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import Card from '../../components/ui/card';
import SelectMenu from '../../components/ui/select-menu';
import ErrorState from '../../components/ui/error-state';
import InlineError from '../../components/ui/inline-error';
import EvolutionSummary from './EvolutionSummary';
import { ChartCardSkeleton, ChartSkeleton } from './DiarySkeletons';
import { useSymptomEvolution, useSymptoms } from '../../hooks/useDiary';
import { cn } from '../../lib/utils';
import { getEvolutionWindow } from '../../utils/symptoms';

// Isolado do módulo principal: o Recharts (~370 kB) não deve atrasar o
// cabeçalho, os filtros e a lista, que não dependem dele.
const DiaryEvolutionChart = lazy(() => import('./DiaryEvolutionChart'));

interface DiaryEvolutionCardProps {
  /** Filtro de período da timeline; `null` é "Tudo". */
  periodDays: number | null;
}

/**
 * Cartão "Evolução" da timeline: a intensidade de um sintoma ao longo do
 * período, com a escolha do sintoma (a "seleção de métrica" do escopo).
 *
 * Tem os quatro estados por conta própria — a lista abaixo não depende do
 * gráfico, então nenhuma falha aqui pode derrubar a tela nem parecer vazio.
 */
export default function DiaryEvolutionCard({ periodDays }: DiaryEvolutionCardProps) {
  const [metricId, setMetricId] = useState<string | null>(null);

  const {
    data: symptoms,
    isLoading: loadingSymptoms,
    refetch: reloadSymptoms,
  } = useSymptoms();

  // O gráfico plota um sintoma por vez. Sem escolha explícita, mostra o
  // primeiro do catálogo, para a tela nunca abrir com um gráfico vazio
  // esperando interação.
  const selectedMetric = metricId ?? symptoms?.[0]?.id;
  const metricLabel = symptoms?.find((symptom) => symptom.id === selectedMetric)?.label ?? '';

  // O gráfico acompanha o filtro de período da lista; em "Tudo" tem teto (ver
  // `getEvolutionWindow`) e o cartão diz qual é a janela.
  const periodWindow = getEvolutionWindow(periodDays);

  const {
    data: evolution,
    isLoading: loadingEvolution,
    isError: evolutionFailed,
    isPlaceholderData: isPreviousSeries,
    refetch: reloadEvolution,
  } = useSymptomEvolution(selectedMetric, periodWindow.days);

  if (loadingSymptoms) return <ChartCardSkeleton />;

  // Sem o catálogo não há o que escolher nem o que plotar. A fileira de chips
  // da timeline some pelo mesmo motivo, e este é o único aviso — vale pelos dois.
  if (!symptoms) {
    return (
      <InlineError
        className="mx-6 mt-4"
        title="Não foi possível carregar os sintomas"
        onRetry={() => void reloadSymptoms()}
      />
    );
  }

  const points = evolution ?? [];

  return (
    <Card padding="md" className="mx-6 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-supera-empatia)_15%,transparent)] text-[var(--color-supera-empatia)]">
            <TrendingUp size={16} strokeWidth={2} aria-hidden="true" />
          </span>
          <div>
            <h3 className="text-[14px] font-semibold text-foreground">Evolução</h3>
            <p className="text-[11px] text-muted-foreground">{periodWindow.label}</p>
          </div>
        </div>
        <SelectMenu
          value={selectedMetric ?? ''}
          onChange={setMetricId}
          options={symptoms.map((symptom) => ({ value: symptom.id, label: symptom.label }))}
          aria-label="Sintoma exibido no gráfico"
        />
      </div>

      <div className="mt-3">
        {loadingEvolution ? (
          <ChartSkeleton />
        ) : evolutionFailed && evolution === undefined ? (
          // Sem isto, falha na série caía no `[]` padrão e virava "ainda não
          // há registros" — mentira pro paciente. Dado em mãos vence o erro:
          // uma releitura que falha não troca o gráfico já mostrado por isto.
          <ErrorState
            className="min-h-0 py-4"
            title="Não foi possível carregar o gráfico"
            onRetry={() => void reloadEvolution()}
          />
        ) : points.length === 0 ? (
          <p className="py-10 text-center text-[13px] text-muted-foreground">
            Você ainda não fez registros neste período para montar o gráfico.
          </p>
        ) : (
          // Trocar de sintoma mantém a série anterior na tela até a nova
          // chegar (`keepPreviousData`) — esmaecida, para não parecer a
          // evolução do sintoma recém-escolhido.
          <div
            className={cn(
              'transition-opacity duration-150 ease-[ease]',
              isPreviousSeries && 'opacity-50'
            )}
            aria-busy={isPreviousSeries}
          >
            <div
              role="img"
              aria-label={`Gráfico da intensidade de ${metricLabel}, ${periodWindow.label.toLowerCase()}`}
            >
              <Suspense fallback={<ChartSkeleton />}>
                <DiaryEvolutionChart data={points} />
              </Suspense>
            </div>

            {/* Enquanto a série é a do sintoma ou do período anterior, o
                resumo descreveria o dado errado — some até a nova chegar. */}
            <div className="min-h-10">
              {!isPreviousSeries && (
                <EvolutionSummary
                  points={points}
                  symptomLabel={metricLabel}
                  periodLabel={periodWindow.label}
                />
              )}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-center text-[11px] text-muted-foreground">
        0 = não senti · 5 = insuportável
      </p>
    </Card>
  );
}
