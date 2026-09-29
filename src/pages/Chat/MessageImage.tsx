import { cva } from 'class-variance-authority';
import { CircleAlert, ImageOff, RotateCw } from 'lucide-react';
import Skeleton from '../../components/ui/skeleton';
import { Spinner } from '../../components/ui/loading';
import { useChatAttachment } from '../../hooks/useChat';
import { useObjectUrl } from '../../hooks/useObjectUrl';

// A imagem de uma mensagem do chat: a que já está no bucket (`MessageImage`)
// e a que não chegou a subir (`UnsentImage`).

/** Moldura da imagem. O canto "de fala" fica do lado de quem escreveu. */
const imageFrame = cva(
  'relative flex aspect-[4/3] w-[200px] items-center justify-center overflow-hidden rounded-xl border border-border bg-muted',
  {
    variants: {
      side: {
        own: 'rounded-br-md',
        team: 'rounded-bl-md',
      },
    },
  }
);

const inlineActionClass =
  'inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-primary transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60';

interface MessageImageProps {
  storagePath: string;
  alt: string;
  side: 'own' | 'team';
}

/**
 * Baixa o arquivo pela Storage API e o mostra por um endereço `blob:` que
 * só existe na memória do aparelho (e é revogado quando a bolha sai da tela).
 *
 * Falhar aqui não derruba a conversa: a mensagem continua lá, só a imagem
 * vira um aviso com "Tentar de novo".
 */
export function MessageImage({ storagePath, alt, side }: MessageImageProps) {
  const { data, isError, isFetching, refetch } = useChatAttachment(storagePath);
  const url = useObjectUrl(data);

  if (isError) {
    return (
      <div className={imageFrame({ side })}>
        <div className="flex flex-col items-center gap-1 px-2 text-center">
          <ImageOff size={24} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          <span className="text-[11px] text-muted-foreground">Imagem indisponível</span>
          <button
            type="button"
            className={inlineActionClass}
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? <Spinner size="sm" /> : <RotateCw size={14} strokeWidth={2} aria-hidden="true" />}
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={imageFrame({ side })} aria-busy={url ? undefined : true}>
      {url ? (
        <img src={url} alt={alt} className="h-full w-full object-cover" />
      ) : (
        <Skeleton className="absolute inset-0 rounded-none" />
      )}
    </div>
  );
}

interface UnsentImageProps {
  file: File;
  retrying: boolean;
  onRetry: () => void;
}

/**
 * A imagem cuja mensagem foi criada, mas cujo arquivo não subiu. Mostra a
 * foto que está na memória (a pessoa sabe qual foi) e o "Reenviar", que manda
 * o mesmo arquivo para o mesmo caminho.
 */
export function UnsentImage({ file, retrying, onRetry }: UnsentImageProps) {
  const url = useObjectUrl(file);

  return (
    <div className="flex flex-col items-end gap-1">
      <div className={imageFrame({ side: 'own' })}>
        {url && (
          <img src={url} alt="Imagem que não foi enviada" className="h-full w-full object-cover opacity-60" />
        )}
      </div>
      <div className="flex items-center gap-1 text-[11px] text-destructive">
        <CircleAlert size={14} strokeWidth={2} aria-hidden="true" />
        <span>Imagem não enviada</span>
        <button type="button" className={inlineActionClass} onClick={onRetry} disabled={retrying}>
          {retrying ? <Spinner size="sm" /> : <RotateCw size={14} strokeWidth={2} aria-hidden="true" />}
          Reenviar
        </button>
      </div>
    </div>
  );
}
