import { useEffect, useRef, type ComponentType } from 'react';
import { Link } from 'react-router';
import { AlertCircle, ChevronRight, LoaderCircle, MessageSquarePlus, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '../../utils/date';
import { assistantSearchParams, type AssistantHistoryLinkState } from './assistantSearch';
import type { AssistantExchange } from '../../types';

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number; className?: string; 'aria-hidden'?: boolean }>;

const HISTORY_LINK_STATE: AssistantHistoryLinkState = { fromHistoryList: true };

interface ExchangeSummary {
  icon: IconComponent;
  text: string;
  tone: 'default' | 'muted' | 'alert';
}

/** Uma linha sobre o que voltou da pergunta, para a lista não repetir a resposta inteira. */
function summarize(exchange: AssistantExchange, requested: boolean): ExchangeSummary {
  if (exchange.isPending) {
    return { icon: LoaderCircle, text: 'Procurando nas orientações…', tone: 'muted' };
  }

  if (exchange.error || !exchange.reply) {
    return { icon: AlertCircle, text: 'Não foi possível responder', tone: 'alert' };
  }

  if (exchange.reply.status === 'answered') {
    const count = exchange.reply.references.length;
    const references = count === 1 ? '1 orientação para ler' : `${count} orientações para ler`;
    return { icon: Sparkles, text: count > 0 ? `Respondida · ${references}` : 'Respondida', tone: 'default' };
  }

  return {
    icon: MessageSquarePlus,
    text: requested ? 'Pedido de orientação enviado' : 'Ainda sem orientação sobre o assunto',
    tone: 'muted',
  };
}

const SUMMARY_TONE: Record<ExchangeSummary['tone'], string> = {
  default: 'text-primary-deep',
  muted: 'text-muted-foreground',
  alert: 'text-destructive-deep',
};

interface AssistantHistoryListProps {
  exchanges: AssistantExchange[];
  requestedExchangeIds: string[];
  /** `Date.now()` de quem desenha, para todas as linhas contarem do mesmo instante. */
  now: number;
  /** A pergunta de onde se voltou: a linha dela recebe o foco, e o teclado continua dali. */
  focusExchangeId?: string | null;
}

/**
 * As perguntas da sessão, da mais recente para a mais antiga, num cartão só
 * com uma linha por pergunta (como a lista de conversas do Chat). Tocar abre a
 * pergunta inteira, com a resposta e as orientações citadas.
 */
export default function AssistantHistoryList({
  exchanges,
  requestedExchangeIds,
  now,
  focusExchangeId = null,
}: AssistantHistoryListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  // A rolagem a volta já restaura; aqui só o foco.
  useEffect(() => {
    if (!focusExchangeId) return;
    const links = listRef.current?.querySelectorAll<HTMLAnchorElement>('a[data-exchange-id]') ?? [];
    Array.from(links)
      .find((link) => link.dataset.exchangeId === focusExchangeId)
      ?.focus({ preventScroll: true });
  }, [focusExchangeId]);

  return (
    <ul
      ref={listRef}
      role="list"
      aria-label="Suas perguntas"
      // Sem `overflow-hidden`, para o anel de foco das linhas não ser cortado:
      // a primeira e a última linha arredondam o próprio fundo.
      className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card shadow-sm [&>li:first-child>a]:rounded-t-[13px] [&>li:last-child>a]:rounded-b-[13px]"
    >
      {exchanges.map((exchange) => {
        const summary = summarize(exchange, requestedExchangeIds.includes(exchange.id));
        const Icon = summary.icon;
        const minutesAgo = Math.max(0, (now - exchange.askedAt) / 60000);

        return (
          <li key={exchange.id}>
            <Link
              to={{ search: `?${assistantSearchParams({ tab: 'history', exchangeId: exchange.id }).toString()}` }}
              state={HISTORY_LINK_STATE}
              data-exchange-id={exchange.id}
              className="flex min-h-[76px] items-center gap-3 px-4 py-3 transition-colors duration-150 ease-[ease] hover:bg-[color-mix(in_srgb,var(--color-muted)_60%,transparent)]"
            >
              {/* Os espaços vêm do `gap`: o reset global do `index.css` zera a margem do `p`. */}
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="line-clamp-2 text-body font-semibold break-words text-foreground">
                  {exchange.question}
                </span>
                <span className={cn('flex items-center gap-1.5 text-body-sm', SUMMARY_TONE[summary.tone])}>
                  <Icon
                    size={16}
                    strokeWidth={2}
                    className={cn('shrink-0', exchange.isPending && 'motion-safe:animate-spin')}
                    aria-hidden
                  />
                  <span className="min-w-0 truncate">{summary.text}</span>
                </span>
                <span className="text-caption font-medium text-muted-foreground">{formatRelativeTime(minutesAgo)}</span>
              </span>
              <ChevronRight size={20} strokeWidth={2} className="shrink-0 text-muted-foreground" aria-hidden="true" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
