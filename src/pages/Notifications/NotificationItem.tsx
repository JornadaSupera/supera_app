import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { NotificationDetail } from '../../types';
import { cn } from '../../lib/utils';

interface NotificationItemProps {
  notificacao: NotificationDetail;
  onLida: (id: string) => void;
}

export default function NotificationItem({ notificacao, onLida }: NotificationItemProps) {
  const { tipoInfo } = notificacao;
  const Icon = tipoInfo.icon;

  function handleClick() {
    if (!notificacao.lida) {
      onLida(notificacao.id);
    }
  }

  const conteudo = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--notification-icon-color)_15%,transparent)] text-[var(--notification-icon-color)]"
        // Exceção deliberada à regra de não usar `style` inline: a cor varia por
        // instância (uma por tipo de notificação), então não há classe
        // Tailwind estática que a expresse — mesmo padrão de `--tag-color`
        // (ui/tag.tsx) e `--badge-color` (ui/badge.tsx).
        style={{ '--notification-icon-color': tipoInfo.colorVar } as CSSProperties}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span
          className={cn(
            'text-[14px] text-foreground',
            notificacao.lida ? 'font-medium' : 'font-semibold'
          )}
        >
          {notificacao.titulo}
        </span>
        <span className="line-clamp-2 overflow-hidden text-[12px] text-muted-foreground">
          {notificacao.descricao}
        </span>
      </span>

      <span className="mt-1 shrink-0 text-[10px] whitespace-nowrap text-muted-foreground">
        {notificacao.horaLabel}
      </span>
    </>
  );

  const className = cn(
    'flex w-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 text-left cursor-pointer transition-[border-color,box-shadow] duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm',
    !notificacao.lida &&
      'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_15%,transparent)] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_15%,transparent),var(--shadow-sm)]'
  );

  if (tipoInfo.destino) {
    return (
      <Link to={tipoInfo.destino} onClick={handleClick} className={className}>
        {conteudo}
      </Link>
    );
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {conteudo}
    </button>
  );
}
