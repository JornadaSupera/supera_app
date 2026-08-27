import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star, CirclePlay, Image, FileText, User, Clock, Eye } from 'lucide-react';
import Header from '../../components/ui/header';
import Loading from '../../components/ui/loading';
import EmptyState from '../../components/ui/empty-state';
import Badge from '../../components/ui/badge';
import Button from '../../components/ui/button';
import {
  getOrientacaoPorId,
  marcarOrientacaoComoLida,
  alternarFavoritoOrientacao,
} from '../../services/mockApi';
import { useToast } from '../../contexts/ToastContext';
import type { OrientationDetail } from '../../types';

export default function ResourceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const {
    data: orientacao,
    isLoading: carregando,
    isError: erro,
  } = useQuery({
    queryKey: ['orientation', id],
    queryFn: () => getOrientacaoPorId(id as string),
    enabled: Boolean(id),
  });

  // Fire-and-forget, igual ao `.then()` original: marca como lida assim que
  // o conteúdo carrega, sem bloquear o render nem tratar erro. Só invalida a
  // lista (`['orientations']`) — é lá que `lida` tem efeito visível (ponto de
  // não lida em ResourceCard); esta própria página nunca lê `orientacao.lida`.
  const marcarLidaMutation = useMutation({
    mutationFn: marcarOrientacaoComoLida,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['orientations'] });
    },
  });

  useEffect(() => {
    if (orientacao) {
      marcarLidaMutation.mutate(orientacao.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orientacao?.id]);

  // Mesmo padrão otimista de ResourceCard (ver comentário lá) — aqui só
  // precisa mexer na entrada única `['orientation', id]`, já que a estrela
  // do cabeçalho só reflete esta orientação.
  const toggleFavoritoMutation = useMutation({
    mutationFn: alternarFavoritoOrientacao,
    onMutate: async (favId: string) => {
      await queryClient.cancelQueries({ queryKey: ['orientation', favId] });
      const anterior = queryClient.getQueryData<OrientationDetail>(['orientation', favId]);
      if (anterior) {
        queryClient.setQueryData<OrientationDetail>(['orientation', favId], {
          ...anterior,
          favorito: !anterior.favorito,
        });
      }
      return { anterior };
    },
    onError: (_error, favId, context) => {
      if (context?.anterior) {
        queryClient.setQueryData(['orientation', favId], context.anterior);
      }
    },
    onSuccess: (_data, favId) => {
      void queryClient.invalidateQueries({ queryKey: ['orientation', favId] });
      void queryClient.invalidateQueries({ queryKey: ['orientations'] });
    },
  });

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
        <EmptyState
          title="Orientação não encontrada"
          description="Esse conteúdo pode ter sido removido ou movido de categoria."
          actionLabel="Voltar para Orientações"
          onAction={() => navigate('/orientacoes')}
        />
      </div>
    );
  }

  const favorito = orientacao.favorito;

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
          <button
            type="button"
            className="-m-1 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
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
        }
      />

      <main className="flex-1 p-6 pb-8">
        {orientacao.tipo === 'video' && (
          <div className="relative mb-5 flex aspect-video items-center justify-center rounded-2xl bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-primary)_20%,transparent),color-mix(in_srgb,var(--color-supera-empatia)_20%,transparent))]">
            <div className="flex items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-background)_90%,transparent)] p-4 backdrop-blur-[8px] shadow-lg">
              <CirclePlay size={40} strokeWidth={1.5} color="var(--color-primary)" aria-hidden="true" />
            </div>
            {orientacao.duracaoLabel && (
              <span className="absolute right-3 bottom-3 rounded-md bg-[color-mix(in_srgb,var(--color-foreground)_80%,transparent)] px-2 py-[3px] text-[10px] font-semibold text-background">
                {orientacao.duracaoLabel}
              </span>
            )}
          </div>
        )}

        {orientacao.tipo === 'infografico' && (
          <div className="mb-5 flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-[linear-gradient(135deg,color-mix(in_srgb,var(--color-supera-uniao)_10%,transparent),color-mix(in_srgb,var(--color-supera-empatia)_10%,transparent))]">
            <Image
              size={48}
              strokeWidth={1.5}
              className="text-[color-mix(in_srgb,var(--color-muted-foreground)_40%,transparent)]"
              aria-hidden="true"
            />
            <span className="text-[12px] text-muted-foreground">Infográfico em alta resolução</span>
          </div>
        )}

        {orientacao.tipo === 'pdf' && (
          <div className="mb-5 flex items-center gap-3 rounded-2xl border border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,transparent)] p-4">
            <span className="inline-flex shrink-0 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--color-supera-perfeicao)_15%,transparent)] p-3 text-[var(--color-supera-perfeicao)]">
              <FileText size={20} strokeWidth={2} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">{orientacao.titulo}.pdf</p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {orientacao.tipoLabel} · {orientacao.tempoLeituraMin} min de leitura
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                showToast('O download não está disponível nesta demonstração.', {
                  variant: 'info',
                })
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
          <Badge tone="secondary" size="sm">
            {orientacao.subcategoria}
          </Badge>
        </div>

        <h1 className="mb-2 text-[24px]/[1.25] font-semibold tracking-[-0.4px] text-foreground">
          {orientacao.titulo}
        </h1>
        <p className="mb-4 text-[14px]/[1.5] text-muted-foreground">{orientacao.resumo}</p>

        <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <User size={13} strokeWidth={2} aria-hidden="true" />
            {orientacao.autor}
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Clock size={13} strokeWidth={2} aria-hidden="true" />
            {orientacao.tempoLeituraMin} min
          </span>
          <span>·</span>
          <span className="inline-flex items-center gap-1">
            <Eye size={13} strokeWidth={2} aria-hidden="true" />
            {orientacao.acessos.toLocaleString('pt-BR')} acessos
          </span>
        </div>

        <p className="mb-6 text-[12px] text-muted-foreground">{orientacao.publicadoLabel}</p>

        <div className="mb-6 flex flex-col gap-4">
          {orientacao.conteudo.map((paragrafo, index) => (
            <p key={index} className="text-[15px]/[1.6] text-foreground">
              {paragrafo}
            </p>
          ))}
        </div>

        {orientacao.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {orientacao.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex h-5 items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-normal text-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
