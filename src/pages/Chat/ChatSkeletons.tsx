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
          // O mesmo piso de 128 px e os mesmos 20 px de canto do cartão do
          // assunto (`SubjectGrid`), com o ícone de 24 px no alto.
          <div key={card} className={cn(chatCardClass, 'flex min-h-[128px] flex-col gap-3 rounded-2xl p-4')}>
            <Skeleton className="h-6 w-6 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          </div>
        ))}
      </div>

      {/* `mt-2`, como a seção "Suas conversas": 32 px depois dos assuntos. */}
      <div className="mt-2 flex flex-col gap-3" aria-hidden="true">
        {/* A faixa do título "Suas conversas" (`SectionHeading`): 48 px, da
            borda da tela, arredondada só à direita. */}
        <Skeleton className="-ml-4 h-12 w-44 rounded-l-none rounded-r-lg" />
        <div className={cn(chatCardClass, 'flex flex-col divide-y divide-border')}>
          {[0, 1, 2].map((row) => (
            // 91 px: a altura da linha com título (`text-body`, linha de 24),
            // prévia (`text-body-sm`, 21) e a área que atende (`text-caption`,
            // 18), 2 px entre elas e 12 em cima e embaixo — a mais comum,
            // depois que a conversa é assumida.
            <div key={row} className="flex min-h-[91px] items-center gap-3 px-4 py-3">
              {/* O ícone do assunto, de 24 px, na margem do cartão. */}
              <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-1/3" />
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
        {/* 20 + 10 + 16 = 46 px, a altura do título (`text-section`, linha de
            24), dos 2 px e do assunto (`text-label`, 20): a barra não pula
            quando a conversa chega. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2.5">
          <Skeleton className={cn('h-5 w-32', ON_BRAND_SKELETON)} />
          <Skeleton className={cn('h-4 w-24', ON_BRAND_SKELETON)} />
        </div>
      </ConversationTopBar>

      <main className="flex flex-1 flex-col gap-4 overflow-hidden px-4 pt-4">
        <span role="status" className="sr-only">
          Carregando a conversa
        </span>
        {/* O separador de dia: a linha de 20 px do `text-label` com 4 px em
            cima e embaixo, 28 px. */}
        <Skeleton className="mx-auto h-7 w-20 rounded-full" />
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
