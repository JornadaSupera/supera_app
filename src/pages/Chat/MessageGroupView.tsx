import { Info } from 'lucide-react';
import BrandMark from '../../components/ui/brand-mark';
import { cn } from '../../lib/utils';
import { getBubblePosition, isImageWithoutCaption } from '../../utils/chat';
import { bubbleCorners, bubbleSurface, bubbleTime, groupAlignment } from './chatStyles';
import { MessageImage, UnsentImage, type OpenChatImage } from './MessageImage';
import type { BubblePosition, EnrichedMessage, MessageGroup, UnsentChatImage } from '../../types';

/**
 * Separador de dia: "Hoje", "Ontem", "5 de janeiro". É um título: o leitor
 * de tela navega pela conversa de dia em dia.
 */
export function DaySeparator({ label }: { label: string }) {
  return (
    <div className="flex justify-center">
      <h2 className="rounded-full bg-card px-3 py-1 text-[12px] font-medium text-muted-foreground shadow-[var(--shadow-bubble)]">
        {label}
      </h2>
    </div>
  );
}

/**
 * Mensagem do sistema — transferência entre áreas ou resposta fora do
 * horário, geradas pelo próprio banco. Vai centralizada, sem autor.
 */
function SystemMessage({ message }: { message: EnrichedMessage }) {
  return (
    <div className="flex justify-center">
      <p className="flex max-w-[90%] items-start gap-1.5 rounded-2xl bg-card px-3 py-2 text-left text-[13px] leading-[1.45] text-muted-foreground shadow-[var(--shadow-bubble)]">
        <Info size={15} strokeWidth={2} className="mt-[2px] shrink-0" aria-hidden="true" />
        <span>{message.text}</span>
      </p>
    </div>
  );
}

interface TextBubbleProps {
  message: EnrichedMessage;
  side: 'own' | 'team';
  position: BubblePosition;
  /** Texto para quem usa leitor de tela: quem escreveu e quando. */
  srPrefix: string;
  /** A legenda de uma imagem é texto, sem a hora (ela já está na imagem). */
  withTime?: boolean;
  text?: string;
}

function TextBubble({ message, side, position, srPrefix, withTime = true, text }: TextBubbleProps) {
  return (
    <div className={cn(bubbleSurface({ side }), bubbleCorners({ side, position }))}>
      <span className="sr-only">{srPrefix}</span>
      {text ?? message.text}
      {withTime && (
        <span aria-hidden="true" className={bubbleTime({ side })}>
          {message.timeLabel}
        </span>
      )}
    </div>
  );
}

interface MessageGroupViewProps {
  group: MessageGroup;
  /** Rótulo do dia do grupo — entra na legenda do visualizador de imagem. */
  dayLabel: string;
  /** Quem atende: a área ("Enfermagem") ou "Equipe Supera". */
  teamName: string;
  /**
   * Deste lado, quando quem escreveu não é quem está olhando ("Enviada pelo
   * seu acompanhante"); `null` na própria mensagem.
   */
  senderLabel: string | null;
  /** Quem escreveu deste lado, em poucas palavras ("Você", "Seu acompanhante"). */
  ownAuthorName: string;
  unsentImages: ReadonlyMap<string, UnsentChatImage>;
  retryingMessageId: string | null;
  onRetryImage: (image: UnsentChatImage) => void;
  onOpenImage: (image: OpenChatImage) => void;
}

/**
 * Um grupo de mensagens seguidas do mesmo remetente: quem escreveu aparece uma
 * vez, e as bolhas ficam coladas (os cantos que se tocam ficam pequenos). A
 * hora vai dentro de cada bolha, e o leitor de tela ouve "Enfermagem, 14:32:"
 * antes de cada mensagem.
 */
export default function MessageGroupView({
  group,
  dayLabel,
  teamName,
  senderLabel,
  ownAuthorName,
  unsentImages,
  retryingMessageId,
  onRetryImage,
  onOpenImage,
}: MessageGroupViewProps) {
  if (group.side === 'system') {
    return (
      <>
        {group.messages.map((message) => (
          <SystemMessage key={message.id} message={message} />
        ))}
      </>
    );
  }

  const side = group.side;
  const who = side === 'team' ? teamName : ownAuthorName;

  return (
    <div className={groupAlignment({ side, width: 'group' })}>
      {side === 'team' && (
        <div className="mb-1 flex items-center gap-2" aria-hidden="true">
          <BrandMark size="sm" />
          <span className="text-[13px] font-medium text-muted-foreground">{teamName}</span>
        </div>
      )}
      {side === 'own' && senderLabel && (
        <span className="mb-1 text-[12px] text-muted-foreground">{senderLabel}</span>
      )}

      {group.messages.map((message, index) => {
        const position = getBubblePosition(index, group.messages.length);
        const srPrefix = `${who}, ${message.timeLabel}: `;
        const unsent = side === 'own' ? unsentImages.get(message.id) : undefined;

        if (unsent) {
          return (
            <UnsentImage
              key={message.id}
              file={unsent.file}
              position={position}
              retrying={retryingMessageId === message.id}
              onRetry={() => onRetryImage(unsent)}
            />
          );
        }

        if (!message.attachment) {
          return <TextBubble key={message.id} message={message} side={side} position={position} srPrefix={srPrefix} />;
        }

        // Sem legenda, `text` é só o marcador que o banco exige (`body` não
        // pode ser vazio) — não faz sentido mostrá-lo como mensagem digitada.
        const caption = isImageWithoutCaption(message.text) ? null : message.text;
        const alt = caption ?? `Imagem enviada por ${who === 'Você' ? 'você' : who}`;
        // Com legenda, a imagem é o alto da bolha e a legenda, a base.
        const imagePosition: BubblePosition = !caption
          ? position
          : position === 'single' || position === 'first'
            ? 'first'
            : 'middle';
        const captionPosition: BubblePosition =
          position === 'single' || position === 'last' ? 'last' : 'middle';

        return (
          <div key={message.id} className={groupAlignment({ side })}>
            <span className="sr-only">{srPrefix}</span>
            <MessageImage
              storagePath={message.attachment.storagePath}
              alt={alt}
              side={side}
              position={imagePosition}
              timeLabel={message.timeLabel}
              onOpen={() =>
                onOpenImage({
                  storagePath: message.attachment?.storagePath ?? '',
                  alt,
                  caption: `${who} · ${dayLabel} às ${message.timeLabel}`,
                })
              }
            />
            {caption && (
              <TextBubble
                message={message}
                side={side}
                position={captionPosition}
                srPrefix=""
                withTime={false}
                text={caption}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
