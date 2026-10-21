import InlineError from '../../components/ui/inline-error';
import SectionHeading from '../../components/ui/section-heading';
import Skeleton from '../../components/ui/skeleton';
import Tag from '../../components/ui/tag';
import ResourceCard from './ResourceCard';
import { useCanMarkResources, useDirectedSends, useResourcesByIds } from '../../hooks/useResources';
import { formatDateBr } from '../../utils/date';
import type { DirectedSend } from '../../types';

/** Um card por orientação, mesmo enviada mais de uma vez: vale o envio mais recente. */
interface DirectedItem {
  resourceId: string;
  lastSentAt: string;
  /** Algum envio dela ainda não foi aberto pelo titular. */
  hasUnopened: boolean;
}

function groupByResource(sends: DirectedSend[]): DirectedItem[] {
  const byResource = new Map<string, DirectedItem>();
  // A lista já vem do envio mais recente para o mais antigo.
  sends.forEach((send) => {
    const item = byResource.get(send.resourceId);
    if (item) {
      item.hasUnopened ||= !send.openedAt;
      return;
    }
    byResource.set(send.resourceId, {
      resourceId: send.resourceId,
      lastSentAt: send.sentAt,
      hasUnopened: !send.openedAt,
    });
  });
  return [...byResource.values()];
}

/** Carregamento com a forma do card da biblioteca. */
function DirectedSkeleton() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm" aria-hidden="true">
      <Skeleton className="my-px h-[22px] w-24 rounded-full" />
      <Skeleton className="my-px h-5 w-4/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="my-px h-4 w-36" />
    </div>
  );
}

/**
 * "Enviadas para você": as orientações que a equipe mandou a este paciente
 * (envio dirigido, guia §5.5), no topo da biblioteca. Sem envio, a seção não
 * existe — a biblioteca segue como sempre.
 *
 * "Nova" só para o titular: é ele quem marca a abertura. O acompanhante vê o
 * envio, mas a abertura dele não conta, e "Nova" ali confundiria.
 */
export default function DirectedSendsSection() {
  const isOwner = useCanMarkResources();
  const { data: sends = [], isLoading, isError, refetch } = useDirectedSends();
  const items = groupByResource(sends);
  const { data: resources, isLoading: loadingResources } = useResourcesByIds(items.map((item) => item.resourceId));

  if (isError) {
    return (
      <InlineError
        title="Não foi possível carregar as orientações enviadas"
        onRetry={() => void refetch()}
      />
    );
  }

  if (isLoading || items.length === 0) return null;

  const byId = new Map((resources ?? []).map((resource) => [resource.id, resource]));
  // Orientação despublicada depois do envio: a RLS não a abre, e o card some.
  const visible = loadingResources ? items : items.filter((item) => byId.has(item.resourceId));
  if (visible.length === 0) return null;

  return (
    <section aria-labelledby="directed-sends-title" className="flex flex-col gap-3">
      <SectionHeading id="directed-sends-title">
        Enviadas para você <span className="font-semibold">· {visible.length}</span>
      </SectionHeading>
      <div role="list" className="flex flex-col gap-2">
        {visible.map((item) => {
          const resource = byId.get(item.resourceId);
          return (
            <div role="listitem" key={item.resourceId}>
              {resource ? (
                <ResourceCard
                  orientacao={resource}
                  badge={isOwner && item.hasUnopened ? <Tag tone="attention">Nova</Tag> : undefined}
                  note={`Enviada pela sua equipe em ${formatDateBr(item.lastSentAt)}`}
                />
              ) : (
                <DirectedSkeleton />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
