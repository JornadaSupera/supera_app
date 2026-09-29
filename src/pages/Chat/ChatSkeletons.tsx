import Skeleton from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import ConversationTopBar from './ConversationTopBar';

// Carregamento do Chat com a forma do que vai chegar — a regra do projeto pede
// "skeleton com a forma da lista, não spinner solto": a tela já nasce na
// altura final e não pula quando o dado chega.

// O mesmo espaçamento da `ChatList`: seção com `gap`, porque o reset global
// zera a margem do `h2`.
const sectionClass = 'flex flex-col gap-3';
const sectionTitleClass = 'text-[12px] font-semibold tracking-[0.05em] text-muted-foreground uppercase';

/** Corpo da lista: os quatro assuntos e três conversas, na forma do `ConversationListItem`. */
export function ChatListSkeleton() {
  return (
    <main
      className="flex flex-1 flex-col gap-6 px-6 pt-5 pb-8"
      aria-busy="true"
      aria-label="Carregando suas conversas"
    >
      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>INICIAR NOVA CONVERSA</h2>
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((card) => (
            <div key={card} className="flex flex-col gap-1.5 rounded-xl border border-border bg-card p-3.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="mt-0.5 h-3.5 w-3/5" />
              <Skeleton className="h-2.5 w-full" />
              <Skeleton className="h-2.5 w-4/5" />
            </div>
          ))}
        </div>
      </section>

      <section className={sectionClass}>
        <h2 className={sectionTitleClass}>CONVERSAS</h2>
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5">
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-2.5 w-12" />
                </div>
                <Skeleton className="mt-2 h-3 w-4/5" />
                <Skeleton className="mt-2.5 h-5 w-20 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

/** Bolhas alternadas: da equipe à esquerda, deste lado à direita. */
const BUBBLES = [
  { own: false, width: 'w-3/5' },
  { own: true, width: 'w-1/2' },
  { own: false, width: 'w-2/3' },
  { own: true, width: 'w-2/5' },
  { own: true, width: 'w-3/5' },
];

/** A conversa inteira: topo (com o "Voltar" já funcionando) e bolhas. */
export function ConversationSkeleton() {
  return (
    <div className="flex h-[100dvh] flex-col bg-background">
      <ConversationTopBar>
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="mt-1.5 h-2.5 w-44" />
        </div>
      </ConversationTopBar>

      <main
        className="flex flex-1 flex-col gap-4 overflow-hidden p-4"
        aria-busy="true"
        aria-label="Carregando a conversa"
      >
        <Skeleton className="mx-auto h-4 w-16 rounded-full" />
        {BUBBLES.map((bubble, index) => (
          <div key={index} className={cn('flex flex-col gap-1', bubble.own ? 'items-end' : 'items-start')}>
            <Skeleton
              className={cn('h-11 rounded-xl', bubble.own ? 'rounded-br-md' : 'rounded-bl-md', bubble.width)}
            />
            <Skeleton className="h-2.5 w-14" />
          </div>
        ))}
      </main>
    </div>
  );
}
