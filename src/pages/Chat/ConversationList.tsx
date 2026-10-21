import EmptyState from '../../components/ui/empty-state';
import { CARE_PHRASES } from '../../components/ui/affective-phrase';
import SectionHeading from '../../components/ui/section-heading';
import { cn } from '../../lib/utils';
import { chatCardClass } from './chatStyles';
import ConversationListItem from './ConversationListItem';
import type { ConversationSummary } from '../../types';

interface ConversationListProps {
  conversations: ConversationSummary[];
}

/**
 * "Conversas anteriores": as conversas do chat do app, de antes de a clínica
 * passar a atender pelo WhatsApp (21/10). Só leitura. Sem nenhuma, o vazio
 * convida a escolher um assunto — que agora abre o WhatsApp da enfermagem.
 */
export default function ConversationList({ conversations }: ConversationListProps) {
  return (
    // `mt-2`: somado ao vão de 24 px da tela, dá os 32 px do guia entre seções.
    <section aria-labelledby="chat-conversations-title" className="mt-2 flex flex-col gap-3">
      {/* A faixa de título do guia, em frase normal. O espaço vem do `gap`: o
          reset global do `index.css` (fora de `@layer`) zera a margem do `h2`. */}
      <SectionHeading id="chat-conversations-title">
        {conversations.length === 0 ? 'Fale com a enfermagem' : 'Conversas anteriores'}
      </SectionHeading>

      {conversations.length === 0 ? (
        <div className={chatCardClass}>
          {/* A touceira e a frase de apoio, como nas outras telas vazias:
              pedido de 06/10, por cima da exceção do guia para o Chat. Fica no
              cartão da lista, nunca na conversa. 140 px: a capa e os assuntos
              já ocupam o alto da tela. */}
          <EmptyState
            className="min-h-0 py-8"
            illustration
            illustrationSize="sm"
            phrase={CARE_PHRASES.notAlone}
            title="A enfermagem atende pelo WhatsApp"
            description="Escolha um assunto acima e escreva a sua dúvida. O WhatsApp abre com a mensagem pronta."
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
