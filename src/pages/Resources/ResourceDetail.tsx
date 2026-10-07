import { useEffect } from 'react';
import { useParams } from 'react-router';
import { Star, CirclePlay, FileText, Clock, ExternalLink } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import Tag from '../../components/ui/tag';
import Button from '../../components/ui/button';
import { cn } from '../../lib/utils';
import {
  useCanMarkResources,
  useMarkResourceRead,
  useOpenResourceAttachment,
  useResource,
  useSetResourceFavorite,
} from '../../hooks/useResources';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { getContentTypeInfo, getVideoEmbedUrl } from '../../utils/resources';
import { buildDownloadFileName } from '../../utils/files';
import ResourceImage from './ResourceImage';

interface DocumentCardProps {
  fileName: string;
  caption: string;
  disabled?: boolean;
  loading?: boolean;
  /** Ausente quando não há arquivo publicado para baixar. */
  onDownload?: () => void;
}

/**
 * Um PDF da orientação: o card de lista do guia, com o ícone solto no verde
 * escuro (sem pastilha colorida) e o botão secundário de 48 px.
 */
function DocumentCard({ fileName, caption, disabled, loading, onDownload }: DocumentCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
      <FileText size={24} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="truncate text-label font-semibold text-foreground">{fileName}</p>
        <p className="text-caption font-medium text-muted-foreground">{caption}</p>
      </div>
      <Button
        variant="outline"
        disabled={disabled || !onDownload}
        loading={loading}
        onClick={onDownload}
        aria-label={`Baixar ${fileName}`}
      >
        Baixar
      </Button>
    </div>
  );
}

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  // Volta para onde a pessoa estava (a biblioteca, as Notificações, a Home);
  // só cai na biblioteca quando a orientação foi aberta direto.
  const goBack = useGoBackOr('/orientacoes');

  const { data: orientacao, isLoading: carregando, isError: erro, error, refetch } = useResource(id);

  const marcarLidaMutation = useMarkResourceRead();
  const favoriteMutation = useSetResourceFavorite();
  const abrirAnexoMutation = useOpenResourceAttachment();
  // Favorito e "lida" são do titular: `patient_content_states` não tem
  // política para o acompanhante.
  const podeMarcar = useCanMarkResources();

  // `read_at` registra a PRIMEIRA leitura e não deve andar para frente a cada
  // reabertura — daí a guarda por `lida` em vez de disparar sempre que a
  // página monta. Depois da gravação a orientação volta com `lida: true`, o
  // efeito reexecuta e a condição barra o segundo envio.
  const naoLida = orientacao ? !orientacao.isRead : false;

  useEffect(() => {
    if (id && naoLida && podeMarcar) {
      marcarLidaMutation.mutate(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, naoLida, podeMarcar]);

  if (carregando) {
    return <Loading />;
  }

  if (erro || !orientacao) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-background">
        <StepHeader onBack={goBack} meta="Orientação" />
        {/* Uma orientação inelegível e uma inexistente são indistinguíveis:
            a RLS devolve vazio nos dois casos. Por isso a descrição vem da
            mensagem lançada pelo service, em vez de a tela adivinhar qual
            dos dois aconteceu. */}
        <ErrorState
          title="Não foi possível abrir"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      </div>
    );
  }

  const favorito = orientacao.isFavorite;
  const embedUrl = getVideoEmbedUrl(orientacao.videoUrl);
  const { images, documents } = orientacao;
  const pdfLabel = getContentTypeInfo('pdf').label;
  // O tempo de leitura é da orientação, não de cada anexo: só acompanha o PDF
  // quando ele É a orientação.
  const documentCaption =
    orientacao.type === 'pdf' && orientacao.readingMinutes !== null
      ? `${pdfLabel} · ${orientacao.readingMinutes} min de leitura`
      : pdfLabel;
  // Com mais de um PDF, o número no nome evita dois arquivos iguais no aparelho.
  const documentTitle = (index: number) =>
    documents.length > 1 ? `${orientacao.title} (${index + 1})` : orientacao.title;
  const imageAlt = (index: number) =>
    images.length > 1
      ? `imagem ${index + 1} de ${images.length} da orientação ${orientacao.title}`
      : `imagem da orientação ${orientacao.title}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader
        onBack={goBack}
        meta="Orientação"
        actions={
          podeMarcar ? (
            // 48 px de toque e a estrela de 24 px, como o voltar do cabeçalho.
            // O `-mr-3` põe a estrela na margem direita da tela, no espelho do
            // `-ml-3` que põe a seta do voltar na esquerda.
            <button
              type="button"
              className="-mr-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              // O valor desejado vai explícito, e o botão fica travado
              // enquanto grava: sem as duas coisas, dois toques seguidos
              // gravavam o mesmo estado e a estrela terminava invertida.
              onClick={() =>
                favoriteMutation.mutate({ resourceId: orientacao.id, favorite: !favorito })
              }
              disabled={favoriteMutation.isPending}
              aria-busy={favoriteMutation.isPending}
              aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-pressed={favorito}
            >
              <Star
                size={24}
                strokeWidth={2}
                aria-hidden="true"
                className={cn(favorito ? 'fill-current text-primary-deep' : 'text-muted-foreground')}
              />
            </button>
          ) : undefined
        }
      />

      {/* Margem de 16 px, a do cabeçalho (`StepHeader`) e a das telas no guia.
          Os blocos ficam numa coluna com 12 px entre si (24 px depois do
          vídeo/PDF, o espaço entre blocos do guia): o reset global do
          `index.css` zera a margem do `h1` e dos `p`. */}
      <main className="flex flex-1 flex-col gap-3 px-4 pt-6 pb-[calc(2rem_+_var(--safe-bottom))]">
        {orientacao.type === 'video' && (
          <div className="mb-3">
            {embedUrl ? (
              <div className="aspect-video overflow-hidden rounded-2xl bg-muted">
                <iframe
                  src={embedUrl}
                  title={orientacao.title}
                  className="h-full w-full border-0"
                  // O vídeo é embed de terceiro (YouTube/Vimeo, restrição do
                  // banco). `referrerPolicy` evita vazar a URL interna do app
                  // para o provedor.
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              // Cartaz de fallback: a URL não virou embed reconhecível. Chapado
              // na caixa verde-água clara do guia, sem degradê.
              <div className="relative flex aspect-video items-center justify-center rounded-2xl bg-secondary">
                <div className="flex items-center justify-center rounded-full bg-card p-4 shadow-sm">
                  <CirclePlay size={48} strokeWidth={2} className="text-primary-deep" aria-hidden="true" />
                </div>
                {orientacao.durationLabel && (
                  <span className="absolute right-3 bottom-3 rounded-sm bg-[color-mix(in_srgb,var(--color-foreground)_80%,transparent)] px-2 py-0.5 text-caption font-semibold text-background">
                    {orientacao.durationLabel}
                  </span>
                )}
              </div>
            )}

            {/* Saída para fora da WebView. O embed depende do provedor aceitar
                a origem do app, e no iOS (`capacitor://localhost`, sem
                Referer) o player pode recusar — aí o quadro fica preto e o
                vídeo vira um beco sem saída. O link abre a página original no
                navegador do aparelho, onde ele sempre toca; `target="_blank"`
                é o que o Capacitor traduz para o navegador do sistema.
                Cor e sublinhado vão no `span`: o reset global do `index.css`
                (fora de `@layer`) apaga os dois no `a`. O desenho é o do botão
                pequeno do guia: `text-label` com o ícone de 20 px. */}
            {orientacao.videoUrl && (
              <div className="flex justify-end">
                <a
                  href={orientacao.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex min-h-12 items-center gap-2 px-1"
                >
                  <ExternalLink size={20} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
                  <span className="text-label font-semibold text-primary-deep underline underline-offset-2">
                    Abrir no navegador
                  </span>
                </a>
              </div>
            )}
          </div>
        )}

        {/* Tudo o que a versão publicada tem anexado aparece, em qualquer
            tipo de orientação: as imagens inteiras, na ordem em que a equipe
            anexou, e cada PDF com o seu "Baixar". */}
        {images.length > 0 && (
          <div className="mb-3 flex flex-col gap-3">
            {images.map((image, index) => (
              <ResourceImage key={image.id} storagePath={image.storagePath} alt={imageAlt(index)} />
            ))}
          </div>
        )}

        {documents.length > 0 ? (
          <div className="mb-3 flex flex-col gap-3">
            {documents.map((pdf, index) => (
              <DocumentCard
                key={pdf.id}
                fileName={buildDownloadFileName(documentTitle(index), pdf.mimeType)}
                caption={documentCaption}
                // Um download por vez; o "carregando" fica só no que foi tocado.
                disabled={abrirAnexoMutation.isPending}
                loading={
                  abrirAnexoMutation.isPending &&
                  abrirAnexoMutation.variables.attachment.id === pdf.id
                }
                onDownload={() =>
                  abrirAnexoMutation.mutate({ attachment: pdf, title: documentTitle(index) })
                }
              />
            ))}
          </div>
        ) : (
          orientacao.type === 'pdf' && (
            // Sem anexo publicado não há nome de arquivo para prometer — só o título.
            <div className="mb-3">
              <DocumentCard
                fileName={orientacao.title}
                caption="Arquivo ainda não publicado pela equipe"
                disabled
              />
            </div>
          )
        )}

        <Tag>{orientacao.category}</Tag>

        {/* O título na aba do folheto do guia ("TituloSecao", `tab`): pílula no
            verde escuro que encosta na borda esquerda da tela. A margem
            negativa vai no `div`, porque o reset global zera a do `h1`. */}
        <div className="-ml-4 w-fit max-w-[calc(100%+1rem)] rounded-r-full bg-primary-deep py-2 pr-6 pl-4">
          <h1 className="text-section font-bold break-words text-on-primary-deep">{orientacao.title}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-caption font-medium text-muted-foreground">
          {orientacao.readingMinutes !== null && (
            <>
              <span className="inline-flex items-center gap-1">
                <Clock size={16} strokeWidth={2} aria-hidden="true" />
                {orientacao.readingMinutes} min
              </span>
              <span>·</span>
            </>
          )}
          <span>{orientacao.publishedLabel}</span>
        </div>

        <div className="mt-3 flex flex-col gap-4">
          {orientacao.content.map((paragrafo, index) => (
            <p key={index} className="text-body break-words text-foreground">
              {paragrafo}
            </p>
          ))}
        </div>
      </main>
    </div>
  );
}
