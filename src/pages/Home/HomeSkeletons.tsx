import Card from '../../components/ui/card';
import Skeleton from '../../components/ui/skeleton';

// Carregamento de cada bloco da Home, com a forma do bloco que vai chegar. A
// regra do projeto pede "skeleton com a forma da lista, não spinner solto":
// a tela já nasce na altura final e não pula quando o dado chega.
//
// Cada barra fica centrada na linha do texto que ela ocupa: título de card
// (`text-card-title`, 22 px), corpo (`text-body`, 24 px), corpo menor
// (`text-body-sm`, 21 px) e legenda (`text-caption`, 18 px). As barras moram
// em colunas flexíveis, como os textos dos cards carregados: entre blocos
// comuns, as margens de duas barras vizinhas se fundiriam e a altura sairia
// menor.

/** O rótulo dos cards da Home: ícone de 24 px e o texto ao lado. */
function CardLabelSkeleton() {
  return (
    <div className="flex items-center gap-2">
      <Skeleton className="size-6 rounded-sm" />
      <Skeleton className="h-3.5 w-2/5" />
    </div>
  );
}

/** Uma frase de `text-body-sm` que, no celular, ocupa duas linhas de 21 px. */
function TwoLineSentenceSkeleton() {
  return (
    <div className="flex flex-col">
      <Skeleton className="my-[3.5px] h-3.5 w-full" />
      <Skeleton className="my-[3.5px] h-3.5 w-3/5" />
    </div>
  );
}

export function NextAppointmentSkeleton() {
  return (
    <Card elevation="raised" padding="md" aria-busy="true" aria-label="Carregando o próximo compromisso">
      {/* Os blocos e os vãos do card carregado: o rótulo e o título, a pílula
          do dia (28 px) e o local, a caixa da especialidade (64 px) e o "Ver
          detalhes" (44 px). */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardLabelSkeleton />
          <Skeleton className="my-px h-5 w-3/4" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-1/2 rounded-full" />
          <Skeleton className="my-[3.5px] h-3.5 w-2/5" />
        </div>
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-11 w-full" />
      </div>
    </Card>
  );
}

export function DiarySummarySkeleton() {
  return (
    <Card elevation="raised" padding="md" aria-busy="true" aria-label="Carregando o registro de hoje">
      {/* O card vazio: o rótulo, o título, a frase e o botão de 48 px. */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <CardLabelSkeleton />
          <Skeleton className="my-px h-5 w-1/2" />
          <TwoLineSentenceSkeleton />
        </div>
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </Card>
  );
}

export function NotificationsPreviewSkeleton() {
  return (
    // Mesmo `mt-2` da seção carregada, para nada pular quando ela chega.
    <section aria-busy="true" aria-label="Carregando as notificações" className="mt-2 flex flex-col gap-3">
      {/* A faixa do título de seção, de 48 px, encostada na borda esquerda e
          arredondada só à direita. O `rounded-l-none` desfaz os cantos do
          `rounded-md` da base, que o `rounded-r-lg` sozinho não substitui. */}
      <Skeleton className="-ml-4 h-12 rounded-l-none rounded-r-lg" />
      <div className="flex flex-col gap-2">
        {[0, 1].map((linha) => (
          <div
            key={linha}
            className="flex items-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          >
            <Skeleton className="size-6 rounded-sm" />
            {/* O título e a prévia, com o vão de 2 px do card carregado. */}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <Skeleton className="my-1 h-4 w-1/2" />
              <Skeleton className="my-[3.5px] h-3.5 w-3/4" />
            </div>
            {/* A hora: os 3 px que a descem no card, mais 3 px até o meio da
                linha de 18 px dela. */}
            <Skeleton className="mt-1.5 h-3 w-10" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function CareTeamSkeleton() {
  return (
    <Card elevation="raised" padding="md" aria-busy="true" aria-label="Carregando a sua equipe">
      <div className="flex flex-col gap-1">
        <Skeleton className="my-px h-5 w-1/2" />
        <TwoLineSentenceSkeleton />
      </div>
      {/* As bolhas sobrepostas e a legenda abaixo delas, onde ela costuma
          ficar no celular, sem espaço ao lado das bolhas. */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex">
          {[0, 1, 2].map((bolha) => (
            <Skeleton key={bolha} className="size-10 rounded-full border-2 border-card not-first:-ml-2" />
          ))}
        </div>
        <Skeleton className="my-[3px] h-3 w-1/2" />
      </div>
    </Card>
  );
}
