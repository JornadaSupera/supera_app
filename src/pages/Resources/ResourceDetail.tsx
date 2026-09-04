import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Star, CirclePlay, FileText, Clock } from 'lucide-react';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import {
  useCanMarkResources,
  useMarkOrientationAsRead,
  useOrientation,
  useToggleOrientationFavorite,
} from '../../hooks/useResources';
import { getVideoEmbedUrl } from '../../utils/orientations';
import { useToast } from '../../contexts/ToastContext';

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: orientacao, isLoading: carregando, isError: erro, error, refetch } = useOrientation(id);

  const marcarLidaMutation = useMarkOrientationAsRead();
  const toggleFavoritoMutation = useToggleOrientationFavorite();
  // Favorito e "lida" são do titular: `patient_content_states` não tem
  // política para o acompanhante.
  const podeMarcar = useCanMarkResources();

  // `read_at` registra a PRIMEIRA leitura e não deve andar para frente a cada
  // reabertura — daí a guarda por `lida` em vez de disparar sempre que a
  // página monta. Depois da gravação a orientação volta com `lida: true`, o
  // efeito reexecuta e a condição barra o segundo envio.
  const naoLida = orientacao ? !orientacao.lida : false;

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
      <div className="flex min-h-screen flex-col bg-background">
        <Header
          variant="step"
          sticky
          bordered
          blurred
          onBack={() => navigate('/orientacoes')}
          meta="Orientação"
          title={undefined}
          subtitle={undefined}
          actions={undefined}
        />
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

  const favorito = orientacao.favorito;
  const embedUrl = getVideoEmbedUrl(orientacao.videoUrl);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        variant="step"
        sticky
        bordered
        blurred
        onBack={() => navigate('/orientacoes')}
        meta="Orientação"
        title={undefined}
        subtitle={undefined}
        actions={
          podeMarcar ? (
            <button
              type="button"
              className="-mr-2 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
              onClick={() => toggleFavoritoMutation.mutate(orientacao.id)}
              aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
              aria-pressed={favorito}
            >
              <Star
                size={16}
                strokeWidth={2}
                fill={favorito ? 'var(--color-brand-gold)' : 'none'}
                stroke={favorito ? 'var(--color-brand-gold)' : 'currentColor'}
                aria-hidden="true"
              />
            </button>
          ) : undefined
        }
      />

      <main className="flex-1 p-6 pb-8">
        {orientacao.tipo === 'video' &&
          (embedUrl ? (
            <div className="mb-5 aspect-video overflow-hidden rounded-2xl bg-muted">
              <iframe
                src={embedUrl}
                title={orientacao.titulo}
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
            // Cartaz de fallback: a URL não virou embed reconhecível.
            <div className="relative mb-5 flex aspect-video items-center justify-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_20%,transparent),color-mix(in_srgb,var(--color-supera-empatia)_20%,transparent))]">
              <div className="flex items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-background)_90%,transparent)] p-4 shadow-lg backdrop-blur-[8px]">
                <CirclePlay
                  size={40}
                  strokeWidth={1.5}
                  color="var(--color-primary)"
                  aria-hidden="true"
                />
              </div>
              {orientacao.duracaoLabel && (
                <span className="absolute right-3 bottom-3 rounded-md bg-[color-mix(in_srgb,var(--color-foreground)_80%,transparent)] px-2 py-[3px] text-[10px] font-semibold text-background">
                  {orientacao.duracaoLabel}
                </span>
              )}
            </div>
          ))}

        {orientacao.tipo === 'pdf' && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-4">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--color-supera-perfeicao)_15%,transparent)] text-[var(--color-supera-perfeicao)]">
              <FileText size={18} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                {orientacao.titulo}.pdf
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {orientacao.tipoLabel}
                {orientacao.tempoLeituraMin !== null && ` · ${orientacao.tempoLeituraMin} min de leitura`}
              </p>
            </div>
            {/* O anexo vive no bucket `content-attachments`, cuja política de
                Storage ainda não foi escrita — enquanto isso, baixar o
                arquivo não é uma operação que se possa oferecer. */}
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                showToast('O download ainda não está disponível.', { variant: 'info' })
              }
            >
              Baixar
            </Button>
          </div>
        )}

        <div className="mb-3 flex items-center gap-2">
          <Badge tone="muted" variant="subtle" size="sm">
            {orientacao.categoria}
          </Badge>
        </div>

        <h1 className="mb-2 text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
          {orientacao.titulo}
        </h1>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          {orientacao.tempoLeituraMin !== null && (
            <>
              <span className="inline-flex items-center gap-1">
                <Clock size={13} strokeWidth={2} aria-hidden="true" />
                {orientacao.tempoLeituraMin} min
              </span>
              <span>·</span>
            </>
          )}
          <span>{orientacao.publicadoLabel}</span>
        </div>

        <div className="mt-6 flex flex-col gap-4">
          {orientacao.conteudo.map((paragrafo, index) => (
            <p key={index} className="text-[15px]/[1.6] text-foreground">
              {paragrafo}
            </p>
          ))}
        </div>
      </main>
    </div>
  );
}
