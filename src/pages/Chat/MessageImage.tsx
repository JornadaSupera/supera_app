import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import { ImageOff, Maximize2, RotateCw } from 'lucide-react';
import { buttonVariants } from '../../components/ui/button';
import Skeleton from '../../components/ui/skeleton';
import ImageViewer from '../../components/ui/image-viewer';
import { Spinner } from '../../components/ui/loading';
import { useChatAttachment } from '../../hooks/useChat';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { cn } from '../../lib/utils';
import { bubbleCorners } from './chatStyles';
import type { BubblePosition } from '../../types';

// A imagem de uma mensagem do chat: a miniatura que abre em tela cheia
// (`MessageImage`) e o visualizador (`ChatImageViewer`).

/** A proporção da foto é respeitada, dentro destes limites (de 3:4 a 16:9). */
const MIN_RATIO = 3 / 4;
const MAX_RATIO = 16 / 9;
const DEFAULT_RATIO = 4 / 3;

const frameClass =
  'relative block w-[min(260px,68vw)] overflow-hidden bg-muted [-webkit-tap-highlight-color:transparent]';

/**
 * "Tentar de novo": o botão de texto do guia no tamanho de linha (48 px,
 * cantos de 14, `text-label` e ícone de 20 px).
 */
const inlineActionClass = buttonVariants({ variant: 'ghost', size: 'sm' });

function naturalRatio(event: SyntheticEvent<HTMLImageElement>): number {
  const { naturalWidth, naturalHeight } = event.currentTarget;
  if (!naturalWidth || !naturalHeight) return DEFAULT_RATIO;
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, naturalWidth / naturalHeight));
}

interface MessageImageProps {
  storagePath: string;
  alt: string;
  side: 'own' | 'team';
  position: BubblePosition;
  timeLabel: string;
  /** Abre a imagem em tela cheia. */
  onOpen: () => void;
}

/**
 * Miniatura de uma imagem do chat. O arquivo é baixado pela Storage API e
 * mostrado por um endereço `blob:` que só existe na memória (revogado quando a
 * bolha sai da tela). Tocar abre em tela cheia.
 *
 * Falhar aqui não derruba a conversa: a mensagem continua lá, só a imagem
 * vira um aviso com "Tentar de novo".
 */
export function MessageImage({ storagePath, alt, side, position, timeLabel, onOpen }: MessageImageProps) {
  const { data, isError, isFetching, refetch } = useChatAttachment(storagePath);
  const url = useObjectUrl(data);
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  // Com o arquivo já na memória, uma nova tentativa que falhe não apaga a
  // imagem que a pessoa já está vendo.
  if (isError && !data) {
    return (
      <div
        className={cn(frameClass, bubbleCorners({ side, position }), 'flex items-center justify-center')}
        style={{ aspectRatio: DEFAULT_RATIO }}
      >
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <ImageOff size={24} strokeWidth={2} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-caption font-medium text-muted-foreground">Imagem indisponível</span>
          <button type="button" className={inlineActionClass} onClick={() => void refetch()} disabled={isFetching}>
            {isFetching ? <Spinner size="md" /> : <RotateCw size={20} strokeWidth={2} aria-hidden="true" />}
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!url}
      aria-label={`Ampliar: ${alt}`}
      aria-busy={url ? undefined : true}
      className={cn(frameClass, bubbleCorners({ side, position }), 'cursor-zoom-in disabled:cursor-default')}
      style={{ aspectRatio: ratio }}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={(event) => setRatio(naturalRatio(event))}
          className="h-full w-full object-cover [-webkit-touch-callout:none]"
        />
      ) : (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
      {url && (
        <>
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"
          >
            <Maximize2 size={16} strokeWidth={2} />
          </span>
          <span className="absolute right-2 bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-caption font-medium text-white">
            {timeLabel}
          </span>
        </>
      )}
    </button>
  );
}

/** A imagem aberta em tela cheia; `null` fecha. */
export interface OpenChatImage {
  storagePath: string;
  alt: string;
  /** Quem mandou e quando, no topo do visualizador. */
  caption: string;
}

interface ChatImageViewerProps {
  image: OpenChatImage | null;
  onClose: () => void;
}

/**
 * O visualizador em tela cheia do Chat. Lê o mesmo arquivo que a miniatura já
 * baixou (cache em memória), mas com um endereço `blob:` próprio: o da
 * miniatura é revogado se a bolha sair da tela com o visualizador aberto.
 */
export function ChatImageViewer({ image, onClose }: ChatImageViewerProps) {
  const { data } = useChatAttachment(image?.storagePath ?? null);
  const url = useObjectUrl(image ? data : null);

  return (
    <ImageViewer
      open={image !== null}
      src={url}
      alt={image?.alt ?? 'Imagem do chat'}
      caption={image?.caption}
      onClose={onClose}
    />
  );
}
