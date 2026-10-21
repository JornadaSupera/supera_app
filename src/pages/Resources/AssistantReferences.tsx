import { Link } from 'react-router';
import { ChevronRight } from 'lucide-react';
import Skeleton from '../../components/ui/skeleton';
import ResourceCard from './ResourceCard';
import { useResourcesByIds } from '../../hooks/useResources';
import type { AssistantReference } from '../../types';

interface AssistantReferencesProps {
  references: AssistantReference[];
}

/** Carregamento com a forma do card: etiqueta, título, resumo e rodapé. */
function ReferenceSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
      <Skeleton className="my-px h-[22px] w-24 rounded-full" />
      <Skeleton className="my-px h-5 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="my-px h-4 w-28" />
    </div>
  );
}

/**
 * Card só com o título, para a orientação que não veio na leitura (falha de
 * rede, ou despublicada depois da resposta). O toque ainda abre o detalhe, que
 * diz se ela existe.
 */
function ReferenceTitleCard({ reference }: { reference: AssistantReference }) {
  // Cor no `span`: o reset global do `index.css` apaga a cor do `a`.
  return (
    <Link
      to={`/orientacoes/${reference.resourceId}`}
      className="flex min-h-12 items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
    >
      <span className="min-w-0 flex-1 text-card-title font-bold break-words text-foreground">{reference.title}</span>
      <ChevronRight size={20} strokeWidth={2} className="shrink-0 text-primary-deep" aria-hidden="true" />
    </Link>
  );
}

/**
 * As orientações que a IA usou, na ordem de relevância. Cada uma aparece como
 * o card da biblioteca (o resumo); o toque abre a orientação inteira.
 */
export default function AssistantReferences({ references }: AssistantReferencesProps) {
  const ids = references.map((reference) => reference.resourceId);
  const { data: resources, isLoading } = useResourcesByIds(ids);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando orientações">
        {references.map((reference) => (
          <ReferenceSkeleton key={reference.resourceId} />
        ))}
      </div>
    );
  }

  const byId = new Map((resources ?? []).map((resource) => [resource.id, resource]));

  return (
    <div role="list" className="flex flex-col gap-2">
      {references.map((reference) => {
        const resource = byId.get(reference.resourceId);
        return (
          <div role="listitem" key={reference.resourceId}>
            {resource ? <ResourceCard orientacao={resource} /> : <ReferenceTitleCard reference={reference} />}
          </div>
        );
      })}
    </div>
  );
}
