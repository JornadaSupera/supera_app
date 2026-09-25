import Card from '../../components/ui/card';
import Skeleton from '../../components/ui/skeleton';

// Carregamento de cada bloco da Home, com a forma do bloco que vai chegar. A
// regra do projeto pede "skeleton com a forma da lista, não spinner solto":
// a tela já nasce na altura final e não pula quando o dado chega.

export function NextAppointmentSkeleton() {
  return (
    <Card elevation="raised" padding="md" aria-busy="true" aria-label="Carregando o próximo compromisso">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-[16px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-3 w-2/5" />
          <Skeleton className="h-5 w-3/4" />
        </div>
      </div>
      <Skeleton className="mt-4 h-8 w-1/2 rounded-full" />
      <Skeleton className="mt-4 h-4 w-1/3" />
    </Card>
  );
}

export function DiarySummarySkeleton() {
  return (
    <Card elevation="raised" padding="md" aria-busy="true" aria-label="Carregando o registro de hoje">
      <div className="flex items-start gap-3">
        <Skeleton className="size-12 rounded-[16px]" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-5 w-1/2" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      </div>
      <Skeleton className="mt-4 h-11 w-full rounded-lg" />
    </Card>
  );
}

export function NotificationsPreviewSkeleton() {
  return (
    <section aria-busy="true" aria-label="Carregando as notificações">
      <Skeleton className="mb-3 h-4 w-32" />
      <div className="flex flex-col gap-2.5">
        {[0, 1].map((linha) => (
          <div
            key={linha}
            className="flex items-start gap-3 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-raised)]"
          >
            <Skeleton className="size-9 rounded-[12px]" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="mt-2 h-3 w-3/4" />
            </div>
            <Skeleton className="h-2.5 w-10" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function CareTeamSkeleton() {
  return (
    <Card elevation="raised" padding="md" aria-busy="true" aria-label="Carregando a sua equipe">
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="mt-2 h-3 w-4/5" />
      <div className="mt-3 flex items-center gap-2">
        {[0, 1, 2].map((bolha) => (
          <Skeleton key={bolha} className="h-9 w-9 rounded-full" />
        ))}
      </div>
    </Card>
  );
}
