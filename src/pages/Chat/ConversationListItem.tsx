import { Link } from 'react-router';
import { cva } from 'class-variance-authority';
import { Image as ImageIcon } from 'lucide-react';
import { isImageWithoutCaption } from '../../utils/chat';
import SubjectIcon from './SubjectIcon';
import type { ConversationSummary } from '../../types';

// Conversa com mensagem da equipe por ler: título e prévia em destaque, e a
// hora no verde da marca, como nos apps de mensagem. O título fica no tamanho
// do corpo do guia (`text-body`, 16/24), acima da prévia (`text-body-sm`,
// 14/21) e da hora (`text-caption`, 13/18).
const titleVariants = cva('min-w-0 flex-1 truncate text-body text-foreground', {
  variants: { unread: { true: 'font-semibold', false: 'font-medium' } },
  defaultVariants: { unread: false },
});

const timeVariants = cva('shrink-0 text-caption whitespace-nowrap', {
  variants: {
    unread: {
      true: 'font-semibold text-primary-deep',
      false: 'font-medium text-muted-foreground',
    },
  },
  defaultVariants: { unread: false },
});

const previewVariants = cva('flex min-w-0 flex-1 items-center gap-1 text-body-sm', {
  variants: { unread: { true: 'text-foreground', false: 'text-muted-foreground' } },
  defaultVariants: { unread: false },
});

interface ConversationListItemProps {
  conversation: ConversationSummary;
}

/**
 * Uma conversa na lista: o assunto, a última mensagem, a hora e as não lidas.
 * Mora dentro do cartão da lista (`ChatList`), uma linha por conversa.
 */
export default function ConversationListItem({ conversation }: ConversationListItemProps) {
  const { subjectInfo, specialty, unreadCount } = conversation;
  const unread = unreadCount > 0;

  // Prévia de uma mensagem com imagem: ícone de imagem + legenda (ou só
  // "Imagem", quando não houve legenda).
  const preview = isImageWithoutCaption(conversation.lastMessage) ? 'Imagem' : conversation.lastMessage;
  // A área que atende, não a pessoa: o nome do profissional não é legível
  // pelo paciente (ver `types/messages.ts`). Enquanto ninguém assume a
  // conversa, ela não tem nem especialidade.
  const details = [specialty, conversation.isOpen ? null : 'Encerrada'].filter(Boolean).join(' · ');

  return (
    <Link
      to={`/chat/${conversation.id}`}
      className="flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-muted)_60%,transparent)]"
    >
      {/* Como nas linhas de lista do app (`NavigationRow`): o ícone de 24 px
          na margem de 16 px do cartão, e o texto 12 px depois dele. */}
      <SubjectIcon info={subjectInfo} size="plain" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline gap-2">
          <span className={titleVariants({ unread })}>{conversation.title}</span>
          <span className={timeVariants({ unread })}>{conversation.timeLabel}</span>
        </div>

        <div className="flex items-center gap-2">
          <span className={previewVariants({ unread })}>
            {conversation.lastMessageHasAttachment && (
              <ImageIcon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            )}
            <span className="truncate">{preview}</span>
          </span>
          {unread && (
            <>
              {/* O laranja da marca marca o que não foi lido, em todo o app. */}
              <span
                aria-hidden="true"
                className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-orange px-2 text-caption leading-none font-semibold text-on-orange"
              >
                {unreadCount}
              </span>
              <span className="sr-only">
                , {unreadCount === 1 ? '1 mensagem não lida' : `${unreadCount} mensagens não lidas`}
              </span>
            </>
          )}
        </div>

        {details && <span className="truncate text-caption font-medium text-muted-foreground">{details}</span>}
      </div>
    </Link>
  );
}
