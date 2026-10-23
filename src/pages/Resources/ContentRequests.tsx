import { useState } from 'react';
import { useNavigate } from 'react-router';
import { cn } from '@/lib/utils';
import StepHeader from '../../components/ui/step-header';
import GardenPainting from '../../components/ui/garden-painting';
import Skeleton from '../../components/ui/skeleton';
import EmptyState from '../../components/ui/empty-state';
import { CARE_PHRASES } from '../../components/ui/affective-phrase';
import ErrorState from '../../components/ui/error-state';
import ConfirmDialog from '../../components/ui/confirm-dialog';
import ContentRequestCard from './ContentRequestCard';
import {
  useCancelContentRequest,
  useContentAssistantSettings,
  useContentRequests,
} from '../../hooks/useContentAssistant';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { useSessionStore } from '../../stores/sessionStore';

/** Carregamento com a forma da lista: a situação, a data e o texto do pedido. */
function RequestsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando pedidos">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <Skeleton className="h-6 w-36 rounded-full" />
            <Skeleton className="h-4 w-24" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      ))}
    </div>
  );
}

/**
 * Os pedidos de orientação: o titular vê todos os da ficha (inclusive os do
 * acompanhante); o acompanhante, só os dele. O recorte é da RLS. É também o
 * destino do aviso "Sua solicitação de orientação foi respondida".
 */
export default function ContentRequests() {
  const navigate = useNavigate();
  const goBack = useGoBackOr('/orientacoes');
  const accountId = useSessionStore((state) => state.accountId);
  const { data: requests = [], isLoading, isError, refetch } = useContentRequests();
  const { data: settings } = useContentAssistantSettings();
  const cancelMutation = useCancelContentRequest();
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const hasRequests = !isLoading && !isError && requests.length > 0;

  function renderContent() {
    if (isLoading) return <RequestsSkeleton />;

    if (isError) return <ErrorState onRetry={() => void refetch()} />;

    if (requests.length === 0) {
      const empty = {
        illustration: true,
        phrase: CARE_PHRASES.seeBeauty,
        title: 'Nenhum pedido por aqui',
        description:
          'Quando a IA não encontrar uma orientação sobre o seu assunto, você pode pedir que a equipe escreva uma. Os pedidos aparecem aqui.',
      };

      // O atalho para perguntar só existe com o assistente ligado.
      return settings?.enabled ? (
        <EmptyState {...empty} actionLabel="Perguntar à IA" onAction={() => navigate('/orientacoes/assistente')} />
      ) : (
        <EmptyState {...empty} />
      );
    }

    return (
      <div role="list" className="flex flex-col gap-3">
        {requests.map((request) => (
          <div role="listitem" key={request.id}>
            <ContentRequestCard
              request={request}
              isMine={request.requestedBy === accountId}
              onCancel={() => setCancelTarget(request.id)}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={goBack} title="Meus pedidos" meta="Orientações" />

      <main
        className={cn('flex flex-1 flex-col px-4 pt-6', hasRequests ? 'pb-8' : 'pb-[calc(2rem_+_var(--safe-bottom))]')}
      >
        {renderContent()}
      </main>

      {/* O gramado florido no fim da rolagem, como no Diário (pedido de
          23/10). Só com pedidos: a tela vazia já traz a touceira, e o guia
          pede uma pintura por tela. */}
      {hasRequests && <GardenPainting kind="band" className="h-[min(42vw,220px)]" />}

      <ConfirmDialog
        open={cancelTarget !== null}
        title="Retirar o pedido?"
        description="A equipe deixa de ver este pedido. Se mudar de ideia, você pode pedir de novo."
        confirmLabel="Retirar"
        cancelLabel="Manter"
        destructive
        loading={cancelMutation.isPending}
        onConfirm={() => {
          if (!cancelTarget) return;
          cancelMutation.mutate(cancelTarget, { onSettled: () => setCancelTarget(null) });
        }}
        onCancel={() => setCancelTarget(null)}
      />
    </div>
  );
}
