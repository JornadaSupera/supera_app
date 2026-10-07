import { useState } from 'react';
import { ImageOff, Maximize2, RotateCw } from 'lucide-react';
import { buttonVariants } from '../../components/ui/button';
import Skeleton from '../../components/ui/skeleton';
import ImageViewer from '../../components/ui/image-viewer';
import { Spinner } from '../../components/ui/loading';
import { useResourceFile } from '../../hooks/useResources';
import { useObjectUrl } from '../../hooks/useObjectUrl';
import { cn } from '../../lib/utils';

const frameClass =
  'relative block w-full overflow-hidden rounded-2xl bg-muted [-webkit-tap-highlight-color:transparent]';

interface ResourceImageProps {
  storagePath: string;
  /** Descrição para o leitor de tela — o banco não guarda texto alternativo. */
  alt: string;
}

/**
 * Uma imagem anexada à orientação, na largura da tela e inteira (sem corte).
 * O arquivo é baixado pela Storage API e mostrado por um endereço `blob:` que
 * só existe na memória. Tocar abre em tela cheia, com pinça para ampliar.
 *
 * Falhar aqui não derruba a orientação: o texto continua lá, só a imagem vira
 * um aviso com "Tentar de novo".
 */
export default function ResourceImage({ storagePath, alt }: ResourceImageProps) {
  const { data, isError, isFetching, refetch } = useResourceFile(storagePath);
  const url = useObjectUrl(data);
  const [viewerOpen, setViewerOpen] = useState(false);

  if (isError && !data) {
    return (
      <div className={cn(frameClass, 'flex aspect-video flex-col items-center justify-center gap-1 px-4 text-center')}>
        <ImageOff size={24} strokeWidth={2} className="text-muted-foreground" aria-hidden="true" />
        <span className="text-caption font-medium text-muted-foreground">Imagem indisponível</span>
        <button
          type="button"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? <Spinner size="md" /> : <RotateCw size={20} strokeWidth={2} aria-hidden="true" />}
          Tentar de novo
        </button>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        disabled={!url}
        aria-label={`Ampliar: ${alt}`}
        aria-busy={url ? undefined : true}
        className={cn(frameClass, 'cursor-zoom-in disabled:cursor-default', !url && 'aspect-video')}
      >
        {url ? (
          <img
            src={url}
            alt=""
            draggable={false}
            className="block max-h-[70dvh] w-full object-contain [-webkit-touch-callout:none]"
          />
        ) : (
          <Skeleton className="absolute inset-0 rounded-none" />
        )}
        {url && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-white"
          >
            <Maximize2 size={16} strokeWidth={2} />
          </span>
        )}
      </button>

      <ImageViewer open={viewerOpen} src={url} alt={alt} onClose={() => setViewerOpen(false)} />
    </>
  );
}
