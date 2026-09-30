import { MessageCircle } from 'lucide-react';
import EmptyState from '../../components/ui/empty-state';
import { cn } from '../../lib/utils';
import { chatCardClass } from './chatStyles';
import ConversationListItem from './ConversationListItem';
import type { ConversationSummary } from '../../types';

interface ConversationListProps {
  conversations: ConversationSummary[];
}

/** "Suas conversas": um cartão com uma linha por conversa, ou o vazio. */
export default function ConversationList({ conversations }: ConversationListProps) {
  return (
    <section aria-labelledby="chat-conversations-title" className="flex flex-col gap-3">
      {/* O espaço vem do `gap`: o reset global do `index.css` (fora de
          `@layer`) zera a margem do `h2`. */}
      <h2
        id="chat-conversations-title"
        className="px-1 text-[13px] font-semibold tracking-[0.04em] text-muted-foreground uppercase"
      >
        Suas conversas
      </h2>

      {conversations.length === 0 ? (
        <div className={chatCardClass}>
          <EmptyState
            className="min-h-0 py-8"
            icon={MessageCircle}
            iconTone="var(--color-supera-seguranca)"
            title="Nenhuma conversa ainda"
            description="Escolha um assunto acima para falar com a equipe."
          />
        </div>
      ) : (
        // Os cantos da primeira e da última linha acompanham os do cartão, sem
        // `overflow-hidden` — que cortaria o contorno de foco das linhas.
        <ul
          role="list"
          className={cn(
            chatCardClass,
            'flex flex-col divide-y divide-border [&>li:first-child>a]:rounded-t-[17px] [&>li:last-child>a]:rounded-b-[17px]'
          )}
        >
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <ConversationListItem conversation={conversation} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
