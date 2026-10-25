import { Link } from 'react-router';
import { Info, MessageSquarePlus, Sparkles } from 'lucide-react';
import Button from '../../components/ui/button';
import InlineError from '../../components/ui/inline-error';
import Skeleton from '../../components/ui/skeleton';
import AssistantReferences from './AssistantReferences';
import { AppError, isTransientError } from '../../lib/appError';
import type { AssistantExchange } from '../../types';

/** Falhas que uma nova tentativa pode resolver: rede e o provedor da IA. */
const RETRYABLE_CODES = new Set(['ai_unavailable', 'unavailable']);

function canRetry(error: Error): boolean {
  return isTransientError(error) || (error instanceof AppError && RETRYABLE_CODES.has(error.code));
}

interface AssistantExchangeCardProps {
  exchange: AssistantExchange;
  /** Para dizer o limite quando a pessoa chega nele. */
  hourlyLimit: number;
  /** Esta pergunta já virou pedido de orientação. */
  requested: boolean;
  /** Sem ela, a falha não oferece nova tentativa (outra pergunta ainda está em andamento). */
  onRetry?: () => void;
  onRequest: () => void;
}

/** Uma pergunta e o que voltou dela: a resposta, o "não achei" ou a falha. */
export default function AssistantExchangeCard({
  exchange,
  hourlyLimit,
  requested,
  onRetry,
  onRequest,
}: AssistantExchangeCardProps) {
  const { question, isPending, reply, error } = exchange;

  function renderReply() {
    if (isPending) {
      return (
        <div role="status" aria-busy="true" className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 shadow-sm">
          <span className="text-body-sm font-medium text-muted-foreground">Procurando nas orientações…</span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      );
    }

    if (error) {
      const description =
        error instanceof AppError && error.code === 'rate_limited'
          ? `Você pode fazer até ${hourlyLimit} perguntas por hora. Tente de novo mais tarde.`
          : error.message;

      return (
        <InlineError
          title="Não foi possível responder"
          description={description}
          onRetry={onRetry && canRetry(error) ? onRetry : undefined}
        />
      );
    }

    if (!reply) return null;

    if (reply.status === 'answered') {
      return (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-2 text-label font-semibold text-primary-deep">
            <Sparkles size={20} strokeWidth={2} className="shrink-0" aria-hidden="true" />
            <span>Resposta da IA</span>
          </div>

          <p className="text-body whitespace-pre-line text-foreground">{reply.answer}</p>

          <div className="flex flex-col gap-2">
            <h3 className="text-label font-semibold text-foreground">Orientações para ler</h3>
            <AssistantReferences references={reply.references} />
          </div>

          <p className="flex items-start gap-2 text-caption font-medium text-muted-foreground">
            <Info size={16} strokeWidth={2} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>{reply.disclaimer}</span>
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <p className="text-body text-foreground">{reply.message}</p>

        {requested ? (
          // Cor e sublinhado no `span`: o reset global do `index.css` os apaga no `a`.
          <p className="text-body-sm text-muted-foreground">
            Pedido enviado.{' '}
            <Link to="/orientacoes/pedidos" className="inline-flex min-h-11 items-center">
              <span className="font-semibold text-primary-deep underline underline-offset-2">Ver meus pedidos</span>
            </Link>
          </p>
        ) : (
          reply.canRequest && (
            <Button
              variant="soft"
              size="compact"
              pill
              iconLeft={MessageSquarePlus}
              className="self-start"
              onClick={onRequest}
            >
              Pedir uma orientação
            </Button>
          )
        )}
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-2">
      {/* A pergunta, à direita, como na conversa do Chat. */}
      <p className="max-w-[85%] self-end rounded-lg bg-secondary px-4 py-3 text-body break-words whitespace-pre-line text-foreground">
        <span className="sr-only">Você perguntou: </span>
        {question}
      </p>
      {renderReply()}
    </article>
  );
}
