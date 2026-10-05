import { Check, CheckCheck } from 'lucide-react';
import { describeMessageAuthor, describeMessageSender, groupMessagesByDay, type ChatViewer } from '../../utils/chat';
import MessageGroupView, { DaySeparator } from './MessageGroupView';
import type { OpenChatImage } from './MessageImage';
import type { EnrichedMessage, MessageDeliveryStatus, UnsentChatImage } from '../../types';

interface MessageLogProps {
  /** A conversa em ordem cronológica. */
  messages: EnrichedMessage[];
  /** Quem atende: a área ("Enfermagem") ou "Equipe Supera". */
  teamName: string;
  viewer: ChatViewer;
  /**
   * "Enviada" / "Lida pela equipe" sob a última mensagem — `null` quando ela
   * não é deste lado (ou quando a imagem dela ainda não subiu).
   */
  deliveryStatus: MessageDeliveryStatus | null;
  unsentImages: ReadonlyMap<string, UnsentChatImage>;
  retryingMessageId: string | null;
  onRetryImage: (image: UnsentChatImage) => void;
  onOpenImage: (image: OpenChatImage) => void;
}

/**
 * As mensagens da conversa: dias, grupos de mensagens seguidas do mesmo
 * remetente e, no fim, se a equipe já leu.
 */
export default function MessageLog({
  messages,
  teamName,
  viewer,
  deliveryStatus,
  unsentImages,
  retryingMessageId,
  onRetryImage,
  onOpenImage,
}: MessageLogProps) {
  const days = groupMessagesByDay(messages);

  return days.map((day, dayIndex) => (
    <div
      key={day.key}
      className="flex flex-col gap-3"
      // Contra o custo de layout de uma conversa longa: o navegador pula os
      // dias fora da tela até que a rolagem chegue perto deles. A altura é só
      // uma estimativa até o dia ser medido — o `auto` guarda a medida real.
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 400px' }}
    >
      <DaySeparator label={day.label} />

      {day.groups.map((group) => {
        const [firstMessage] = group.messages;
        return (
          <MessageGroupView
            key={group.key}
            group={group}
            dayLabel={day.label}
            teamName={teamName}
            senderLabel={describeMessageSender(firstMessage, viewer)}
            ownAuthorName={describeMessageAuthor(firstMessage, viewer) ?? 'Você'}
            unsentImages={unsentImages}
            retryingMessageId={retryingMessageId}
            onRetryImage={onRetryImage}
            onOpenImage={onOpenImage}
          />
        );
      })}

      {deliveryStatus && dayIndex === days.length - 1 && (
        <div className="-mt-1.5 flex items-center justify-end gap-1 pr-1 text-[12px] text-foreground">
          {deliveryStatus === 'read' ? (
            <CheckCheck
              size={15}
              strokeWidth={2.2}
              className="text-[var(--color-supera-seguranca)]"
              aria-hidden="true"
            />
          ) : (
            <Check size={15} strokeWidth={2.2} aria-hidden="true" />
          )}
          <span>{deliveryStatus === 'read' ? 'Lida pela equipe' : 'Enviada'}</span>
        </div>
      )}
    </div>
  ));
}
