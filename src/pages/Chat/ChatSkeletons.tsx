import Skeleton from '../../components/ui/skeleton';
import { cn } from '../../lib/utils';
import { getBubblePosition } from '../../utils/chat';
import ConversationTopBar from './ConversationTopBar';
import { bubbleCorners, chatCardClass, conversationBackgroundClass, groupAlignment } from './chatStyles';

// Carregamento do Chat com a forma do que vai chegar — a regra do projeto pede
// "skeleton com a forma da lista, não spinner solto": a tela já nasce na
// altura final e não pula quando o dado chega.

/**
 * Corpo da lista, abaixo da capa: os quatro cartões de assunto e o cartão com
 * três conversas, na forma do `ConversationListItem`.
 */
export function ChatListSkeleton() {
  return (
    <>
      <span role="status" className="sr-only">
        Carregando suas conversas
      </span>

      <div className="grid grid-cols-1 gap-3 min-[300px]:grid-cols-2" aria-hidden="true">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className={cn(chatCardClass, 'flex min-h-[124px] flex-col gap-3 p-4')}>
            <Skeleton className="h-7 w-7 rounded-lg" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3" aria-hidden="true">
        <Skeleton className="ml-1 h-3.5 w-28" />
        <div className={cn(chatCardClass, 'flex flex-col divide-y divide-border')}>
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex min-h-[76px] items-center gap-3 px-4 py-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-2xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3.5 w-2/5" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/** Grupos de bolhas alternados: da equipe à esquerda, deste lado à direita. */
const SKELETON_GROUPS: { side: 'own' | 'team'; widths: string[] }[] = [
  { side: 'team', widths: ['w-3/5', 'w-2/5'] },
  { side: 'own', widths: ['w-1/2'] },
  { side: 'team', widths: ['w-2/3'] },
  { side: 'own', widths: ['w-2/5', 'w-3/5'] },
];

const ON_BRAND_SKELETON = 'bg-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)]';

/** A conversa inteira: topo (com o "Voltar" já funcionando) e bolhas. */
export function ConversationSkeleton() {
  return (
    <div className={cn('flex h-[100dvh] bleed-x flex-col px-safe-0', conversationBackgroundClass)}>
      <ConversationTopBar>
        {/* Sobre a barra verde, o bloco do skeleton é um véu branco. */}
        <Skeleton className={cn('h-10 w-10 shrink-0 rounded-full', ON_BRAND_SKELETON)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Skeleton className={cn('h-4 w-32', ON_BRAND_SKELETON)} />
          <Skeleton className={cn('h-3 w-24', ON_BRAND_SKELETON)} />
        </div>
      </ConversationTopBar>

      <main className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pt-4">
        <span role="status" className="sr-only">
          Carregando a conversa
        </span>
        <Skeleton className="mx-auto h-6 w-16 rounded-full" />
        {SKELETON_GROUPS.map((group, groupIndex) => (
          <div key={groupIndex} className={cn(groupAlignment({ side: group.side }), 'w-full')} aria-hidden="true">
            {group.widths.map((width, index) => (
              <Skeleton
                key={index}
                className={cn(
                  'h-10',
                  bubbleCorners({ side: group.side, position: getBubblePosition(index, group.widths.length) }),
                  width
                )}
              />
            ))}
          </div>
        ))}
      </main>
    </div>
  );
}
