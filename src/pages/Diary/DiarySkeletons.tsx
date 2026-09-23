import Card from '../../components/ui/card';
import Skeleton from '../../components/ui/skeleton';

// Carregamento de cada bloco da timeline do Diário, com a forma do bloco que
// vai chegar. A regra do projeto pede "skeleton com a forma da lista, não
// spinner solto": a tela já nasce na altura final e não pula quando o dado
// chega.

/**
 * Placeholder com a mesma altura do gráfico (170px). Serve ao carregamento da
 * série e ao do chunk do Recharts — sem ele o layout pula quando o gráfico
 * aparece.
 */
export function ChartSkeleton() {
  return <Skeleton className="h-[170px] w-full rounded-lg" />;
}

/** O cartão "Evolução" inteiro, enquanto o catálogo de sintomas ainda não chegou. */
export function ChartCardSkeleton() {
  return (
    <Card
      padding="md"
      className="mx-6 mt-4"
      aria-busy="true"
      aria-label="Carregando o gráfico de evolução"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <div>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="mt-1.5 h-2.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      <div className="mt-3">
        <ChartSkeleton />
      </div>
    </Card>
  );
}

const CHIP_WIDTHS = ['w-28', 'w-16', 'w-20', 'w-24', 'w-16'];

/** A fileira de chips de sintoma, enquanto o catálogo carrega. */
export function SymptomChipsSkeleton() {
  return (
    <div
      className="flex flex-nowrap gap-2 overflow-hidden pb-1"
      aria-busy="true"
      aria-label="Carregando os sintomas"
    >
      {CHIP_WIDTHS.map((width, index) => (
        <Skeleton key={index} className={`h-6 shrink-0 rounded-full ${width}`} />
      ))}
    </div>
  );
}

/** A lista de registros: um cabeçalho de mês e três cartões com a forma do `DiaryEntryCard`. */
export function EntriesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Carregando os registros">
      <Skeleton className="mb-3 h-3 w-32" />

      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Card key={row} padding="md">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="mt-3 h-3.5 w-4/5" />
            <div className="mt-3 flex gap-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
