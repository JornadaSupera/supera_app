import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { MessageCircle } from 'lucide-react';
import Badge from '../../components/ui/badge';
import type { ConversationSummary } from '../../types';

interface ConversationListItemProps {
  conversa: ConversationSummary;
}

export default function ConversationListItem({ conversa }: ConversationListItemProps) {
  const { assuntoInfo, profissional } = conversa;
  const Icon = assuntoInfo ? assuntoInfo.icon : MessageCircle;

  return (
    <Link
      to={`/chat/${conversa.id}`}
      className="relative flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
    >
      <span
        className={
          assuntoInfo
            ? 'flex shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--assunto-color)_15%,transparent)] p-2 text-[var(--assunto-color)]'
            : 'flex shrink-0 items-center justify-center rounded-lg bg-muted p-2 text-muted-foreground'
        }
        // Exceção deliberada à regra de não usar `style` inline: a cor do
        // assunto varia por instância (vem de `assuntoInfo.colorVar`), então
        // não há classe Tailwind estática que a expresse — mesmo mecanismo de
        // custom property usado em `components/ui/badge.tsx` e `tag.tsx`.
        style={assuntoInfo ? ({ '--assunto-color': assuntoInfo.colorVar } as CSSProperties) : undefined}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{conversa.titulo}</p>
          <span className="shrink-0 text-[11px] whitespace-nowrap text-muted-foreground">
            {conversa.horaLabel}
          </span>
        </div>

        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">{conversa.ultimaMensagem}</p>

        {(assuntoInfo || profissional) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {assuntoInfo && (
              <Badge tone="muted" variant="subtle" size="sm">
                {assuntoInfo.label}
              </Badge>
            )}
            {profissional && (
              <span className="text-[11px] text-muted-foreground">
                · com {profissional.cargo} {profissional.nome}
              </span>
            )}
          </div>
        )}
      </div>

      {conversa.naoLidas > 0 && (
        <span
          className="absolute top-2.5 right-2.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-supera-empatia)] px-[5px] text-[10px] leading-none font-semibold text-white"
          aria-label={`${conversa.naoLidas} mensagens não lidas`}
        >
          {conversa.naoLidas}
        </span>
      )}
    </Link>
  );
}
