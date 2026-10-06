import type { MouseEvent } from 'react';
import { Link } from 'react-router';
import { Star } from 'lucide-react';
import Tag from '../../components/ui/tag';
import { useCanMarkResources, useSetResourceFavorite } from '../../hooks/useResources';
import { cn } from '../../lib/utils';
import type { EnrichedResource } from '../../types';

interface ResourceCardProps {
  orientacao: EnrichedResource;
}

export default function ResourceCard({ orientacao }: ResourceCardProps) {
  const favoriteMutation = useSetResourceFavorite();
  // O acompanhante lê a biblioteca, mas não gerencia os marcadores do
  // titular — oferecer a estrela só levaria a uma recusa da RLS.
  const podeMarcar = useCanMarkResources();
  const Icon = orientacao.icon;
  const favorito = orientacao.isFavorite;

  function handleFavoritoClick(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    if (favoriteMutation.isPending) return;
    // O estado desejado vai explícito: o service não lê nem nega, senão dois
    // toques rápidos gravariam o mesmo valor.
    favoriteMutation.mutate({ resourceId: orientacao.id, favorite: !favorito });
  }

  // O card de orientação do guia da clínica ("CardOrientacao"): branco, fio
  // claro, cantos de 14 px e a sombra dos cards. Em cima, a etiqueta da
  // especialidade e, à direita, o ponto de "não lida" e a estrela; depois o
  // título, o resumo e o rodapé com o tipo de conteúdo e o tempo de leitura.
  // No código o título vem primeiro, para o leitor de tela começar por ele; o
  // `order-first` leva a linha da etiqueta para o alto na tela.
  return (
    <Link
      to={`/orientacoes/${orientacao.id}`}
      className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm transition-[border-color] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary-deep)_35%,var(--color-border))]"
    >
      <h3 className="line-clamp-2 text-card-title font-bold break-words text-foreground">
        {orientacao.title}
      </h3>

      <div className="order-first flex items-center justify-between gap-2">
        <Tag>{orientacao.category}</Tag>

        <div className="flex items-center gap-1">
          {/* "Nunca só cor": o ponto laranja tem nome para o leitor de tela. */}
          {!orientacao.isRead && (
            <span role="img" aria-label="Não lida" className="size-2.5 shrink-0 rounded-full bg-orange" />
          )}

          {podeMarcar && (
            // Margem negativa: os 48 px de toque não fazem a linha crescer, e
            // a estrela fica alinhada à borda do conteúdo do card.
            <button
              type="button"
              className="-my-3 -mr-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent p-0 transition-colors duration-150 ease-[ease] hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleFavoritoClick}
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
          )}
        </div>
      </div>

      <p className="line-clamp-2 text-body-sm text-muted-foreground">{orientacao.summary}</p>

      <div className="flex items-center gap-2 text-caption font-medium text-muted-foreground">
        <Icon size={16} strokeWidth={2} className="shrink-0" aria-hidden="true" />
        {/* Um texto só: no `flex`, cada pedaço solto viraria um item com o vão
            de 8 px entre eles. O tempo de leitura é opcional no banco: sem
            estimativa, ele some em vez de anunciar "null min". */}
        <span>
          {orientacao.typeLabel}
          {orientacao.readingMinutes !== null && ` · ${orientacao.readingMinutes} min`}
        </span>
      </div>
    </Link>
  );
}
