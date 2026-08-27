import type { CSSProperties, MouseEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, ChevronRight, Star } from 'lucide-react';
import Badge from '../../components/ui/badge';
import { alternarFavoritoOrientacao } from '../../services/mockApi';
import { cn } from '../../lib/utils';
import type { OrientationDetail } from '../../types';

// Cor do círculo do ícone por especialidade/categoria (não por tipo de
// conteúdo) — replica o protótipo real, que colore o bubble do card pela
// categoria da orientação, mantendo o ícone (formato) definido pelo tipo.
const CATEGORIA_COLORS: Record<string, string> = {
  'Cuidados de Enfermagem': 'var(--color-primary)',
  Nutrição: 'var(--color-mood-1)',
  Psicologia: 'var(--color-supera-empatia)',
  'Medicação Oral': 'var(--color-supera-perfeicao)',
  Odontologia: 'var(--color-supera-uniao)',
  Fisioterapia: 'var(--color-supera-amor)',
};

interface ResourceCardProps {
  orientacao: OrientationDetail;
}

export default function ResourceCard({ orientacao }: ResourceCardProps) {
  const queryClient = useQueryClient();
  const Icon = orientacao.icon;
  const corCategoria = CATEGORIA_COLORS[orientacao.categoria];
  const favorito = orientacao.favorito;

  // Otimista (`onMutate`) pra manter o feedback instantâneo que a estrela já
  // tinha com `useState` local — sem isso, a latência simulada do mock
  // (150ms) criaria um atraso visível entre o toque e a estrela preencher.
  // `setQueriesData` (plural) em vez de `setQueryData` porque a lista pode
  // ter múltiplas entradas em cache — uma por combinação de filtro
  // (categoria/status) — e este card não sabe qual delas está ativa no
  // momento; o prefixo `['orientations']` casa com todas. `onSuccess`
  // invalida pra reconciliar com a "fonte da verdade" (ex.: some da lista se
  // o filtro atual for "Favoritas" e o item acabou de ser desfavoritado).
  const toggleFavoritoMutation = useMutation({
    mutationFn: alternarFavoritoOrientacao,
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['orientations'] });
      const anteriores = queryClient.getQueriesData<OrientationDetail[]>({
        queryKey: ['orientations'],
      });
      queryClient.setQueriesData<OrientationDetail[]>({ queryKey: ['orientations'] }, (atual) =>
        atual?.map((item) => (item.id === id ? { ...item, favorito: !item.favorito } : item))
      );
      return { anteriores };
    },
    onError: (_error, _id, context) => {
      context?.anteriores.forEach(([key, data]) => {
        if (data) queryClient.setQueryData(key, data);
      });
    },
    onSuccess: (_data, id) => {
      void queryClient.invalidateQueries({ queryKey: ['orientations'] });
      void queryClient.invalidateQueries({ queryKey: ['orientation', id] });
    },
  });

  function handleFavoritoClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    toggleFavoritoMutation.mutate(orientacao.id);
  }

  return (
    <Link
      to={`/orientacoes/${orientacao.id}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          corCategoria
            ? 'bg-[color-mix(in_srgb,var(--category-color)_15%,transparent)] text-[var(--category-color)]'
            : 'bg-muted text-muted-foreground'
        )}
        // Exceção deliberada à regra de não usar `style` inline: a cor varia
        // por instância (uma por categoria), então não há classe Tailwind
        // estática que a expresse — mesmo padrão de `--tag-color` (ui/tag.tsx)
        // e `--badge-color` (ui/badge.tsx).
        style={corCategoria ? ({ '--category-color': corCategoria } as CSSProperties) : undefined}
      >
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-foreground',
              orientacao.lida ? 'font-medium' : 'font-semibold'
            )}
          >
            {!orientacao.lida && (
              <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-primary" aria-hidden="true" />
            )}
            <span className="min-w-0 truncate">{orientacao.titulo}</span>
          </p>

          <button
            type="button"
            className="-m-1.5 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center self-start rounded-full border-none bg-transparent p-0 transition-colors duration-150 ease-[ease] hover:bg-muted"
            onClick={handleFavoritoClick}
            aria-label={favorito ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
            aria-pressed={favorito}
          >
            <Star
              size={16}
              strokeWidth={2}
              fill={favorito ? 'var(--color-brand-gold)' : 'none'}
              stroke={favorito ? 'var(--color-brand-gold)' : 'var(--color-muted-foreground)'}
            />
          </button>
        </div>

        <p className="mt-0.5 line-clamp-2 text-[13px]/[1.4] text-muted-foreground">
          {orientacao.resumo}
        </p>

        <div className="mt-2 flex items-center gap-2">
          <Badge tone="muted" variant="subtle" size="sm">
            {orientacao.tipoLabel}
          </Badge>
          <span className="inline-flex items-center gap-1 text-[12px] text-muted-foreground">
            <Clock size={12} strokeWidth={2} aria-hidden="true" />
            {orientacao.tempoLeituraMin} min
          </span>
        </div>
      </div>

      <ChevronRight
        size={16}
        strokeWidth={2}
        className="mt-2.5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </Link>
  );
}
