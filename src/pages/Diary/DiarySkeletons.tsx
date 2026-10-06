import Card from '../../components/ui/card';
import Skeleton from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';

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

/**
 * O gráfico e, abaixo dele, o resumo em texto: 8 px e duas linhas de
 * `text-caption` (18 px), o que o resumo ocupa no cartão pronto. Sem as
 * linhas, o cartão crescia quando a série chegava e empurrava a lista.
 */
export function ChartBodySkeleton() {
  return (
    <>
      <ChartSkeleton />
      <div className="flex flex-col items-center pt-2">
        <Skeleton className="my-0.5 h-3.5 w-4/5" />
        <Skeleton className="my-0.5 h-3.5 w-3/5" />
      </div>
    </>
  );
}

/** O cartão "Evolução" inteiro, enquanto o catálogo de sintomas ainda não chegou. */
export function ChartCardSkeleton() {
  return (
    <Card
      elevation="raised"
      padding="md"
      className="mx-4 mt-6"
      aria-busy="true"
      aria-label="Carregando o gráfico de evolução"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Skeleton className="size-6 rounded-full" />
          <div className="flex flex-col gap-1">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
        <Skeleton className="h-12 w-28 rounded-sm" />
      </div>

      <div className="mt-3">
        <ChartBodySkeleton />
      </div>

      {/* A legenda da escala: mais uma linha de `text-caption`, 8 px abaixo. */}
      <div className="flex justify-center pt-2">
        <Skeleton className="my-0.5 h-3.5 w-52" />
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
        // 40 px, a altura do chip de filtro do guia: com menos a fileira pulava
        // quando os chips de verdade chegavam.
        <Skeleton key={index} className={cn('h-10 shrink-0 rounded-full', width)} />
      ))}
    </div>
  );
}

/** A lista de registros: a faixa do mês e três cartões com a forma do `DiaryEntryCard`. */
export function EntriesSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando os registros">
      {/* A faixa do mês (`SectionHeading`): 48 px, da borda da tela,
          arredondada só à direita. */}
      <Skeleton className="-ml-4 h-12 rounded-l-none rounded-r-lg" />

      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Card key={row} padding="md">
            {/* As etiquetas medem 22 px: a linha de 18 px do `text-caption` e
                2 px em cima e embaixo. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-[22px] w-24 rounded-full" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              {/* Uma linha do texto livre (`text-body-sm`, 21 px). */}
              <Skeleton className="h-[21px] w-4/5" />
              <div className="flex gap-2">
                <Skeleton className="h-[22px] w-20 rounded-full" />
                <Skeleton className="h-[22px] w-16 rounded-full" />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
