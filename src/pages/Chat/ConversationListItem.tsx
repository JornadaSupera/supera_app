import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Image as ImageIcon, MessageCircle } from 'lucide-react';
import Badge from '../../components/ui/badge';
import { isImagemSemLegenda } from '../../utils/chat';
import type { ConversationSummary } from '../../types';

interface ConversationListItemProps {
  conversa: ConversationSummary;
}

export default function ConversationListItem({ conversa }: ConversationListItemProps) {
  const { assuntoInfo, especialidade } = conversa;
  const Icon = assuntoInfo ? assuntoInfo.icon : MessageCircle;

  // Prévia de uma mensagem com imagem: ícone de imagem + legenda (ou só
  // "Imagem", quando não houve legenda). O ícone é o mesmo `Image` do lucide
  // que a conversa usa no lugar da foto que ainda não carregou.
  const previaEhImagem = conversa.ultimaMensagemTemAnexo;
  const previaTexto = isImagemSemLegenda(conversa.ultimaMensagem)
    ? 'Imagem'
    : conversa.ultimaMensagem;

  return (
    <Link
      to={`/chat/${conversa.id}`}
      className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-[border-color,box-shadow] duration-200 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm"
    >
      <span
        className={
          assuntoInfo
            ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--assunto-color)_15%,transparent)] text-[var(--assunto-color)]'
            : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground'
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
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{conversa.titulo}</p>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] whitespace-nowrap text-muted-foreground">{conversa.horaLabel}</span>
            {conversa.naoLidas > 0 && (
              <span
                className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-supera-empatia)] px-[5px] text-[10px] leading-none font-semibold text-white"
                aria-label={`${conversa.naoLidas} mensagens não lidas`}
              >
                {conversa.naoLidas}
              </span>
            )}
          </div>
        </div>

        <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted-foreground">
          {previaEhImagem && (
            <ImageIcon size={12} strokeWidth={2} className="shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">{previaTexto}</span>
        </p>

        {(assuntoInfo || especialidade) && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {assuntoInfo && (
              <Badge tone="muted" variant="subtle" size="sm">
                {assuntoInfo.label}
              </Badge>
            )}
            {/* A área que atende, não a pessoa: o nome do profissional não é
                legível pelo paciente (ver `types/messages.ts`). Enquanto
                ninguém assume a conversa, ela não tem nem especialidade. */}
            {especialidade && (
              <span className="text-[11px] text-muted-foreground">· {especialidade}</span>
            )}
          </div>
        )}

        {!conversa.aberta && (
          <p className="mt-1.5 text-[11px] text-muted-foreground">Conversa encerrada</p>
        )}
      </div>
    </Link>
  );
}
