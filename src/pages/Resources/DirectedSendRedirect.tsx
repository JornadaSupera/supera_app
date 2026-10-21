import { Navigate, useNavigate, useParams } from 'react-router';
import { BookX } from 'lucide-react';
import StepHeader from '../../components/ui/step-header';
import Loading from '../../components/ui/loading';
import ErrorState from '../../components/ui/error-state';
import EmptyState from '../../components/ui/empty-state';
import { useDirectedSend } from '../../hooks/useResources';
import { useGoBackOr } from '../../hooks/useGoBackOr';
import { isNotFoundError } from '../../lib/appError';

/**
 * Destino do aviso "Sua equipe enviou uma orientação": o alvo do aviso é o
 * envio (`content_directed_sends`), e a pessoa quer a orientação. Acha o item
 * do envio e abre o detalhe no lugar desta tela, que é onde a abertura é
 * marcada para a equipe.
 */
export default function DirectedSendRedirect() {
  const { sendId } = useParams<{ sendId: string }>();
  const navigate = useNavigate();
  const goBack = useGoBackOr('/orientacoes');
  const { data: send, isLoading, error, refetch } = useDirectedSend(sendId);

  if (send) return <Navigate to={`/orientacoes/${send.resourceId}`} replace />;

  if (isLoading) return <Loading />;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background">
      <StepHeader onBack={goBack} meta="Orientação" />
      {/* Envio que a RLS não mostra (acompanhante sem a área, envio sigiloso) e
          envio inexistente são a mesma resposta: tentar de novo não muda nada,
          o caminho é a biblioteca. */}
      {isNotFoundError(error) ? (
        <EmptyState
          icon={BookX}
          title="Esta orientação não está mais disponível"
          description="As outras orientações da sua equipe estão na biblioteca."
          actionLabel="Ver orientações"
          onAction={() => navigate('/orientacoes', { replace: true })}
        />
      ) : (
        <ErrorState
          title="Não foi possível abrir"
          description={error instanceof Error ? error.message : undefined}
          onRetry={() => void refetch()}
        />
      )}
    </div>
  );
}
