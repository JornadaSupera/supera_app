import { MessageCircle } from 'lucide-react';
import EmptyState from '../../components/ui/empty-state';
import SectionHeading from '../../components/ui/section-heading';
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
    // `mt-2`: somado ao vão de 24 px da tela, dá os 32 px do guia entre seções.
    <section aria-labelledby="chat-conversations-title" className="mt-2 flex flex-col gap-3">
      {/* A faixa de título do guia, em frase normal. O espaço vem do `gap`: o
          reset global do `index.css` (fora de `@layer`) zera a margem do `h2`. */}
      <SectionHeading id="chat-conversations-title">Suas conversas</SectionHeading>

      {conversations.length === 0 ? (
        <div className={chatCardClass}>
          <EmptyState
            className="min-h-0 py-8"
            icon={MessageCircle}
            iconTone="var(--color-primary-deep)"
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
            'flex flex-col divide-y divide-border [&>li:first-child>a]:rounded-t-[13px] [&>li:last-child>a]:rounded-b-[13px]'
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
