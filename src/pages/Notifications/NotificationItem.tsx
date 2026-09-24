import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { NotificationDetail } from '../../types';
import { cn } from '../../lib/utils';

interface NotificationItemProps {
  notificacao: NotificationDetail;
  onLida: (id: string) => void;
  onArquivar: (id: string) => void;
  /** Só na aba do arquivo: traz a notificação de volta para a caixa. */
  onDesarquivar?: (id: string) => void;
}

export default function NotificationItem({
  notificacao,
  onLida,
  onArquivar,
  onDesarquivar,
}: NotificationItemProps) {
  const { categoryInfo } = notificacao;
  const Icon = categoryInfo.icon;

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
        // instância (uma por categoria), então não há classe Tailwind estática
        // que a expresse — mesmo padrão de `--tag-color` (ui/tag.tsx) e
        // `--badge-color` (ui/badge.tsx).
        style={{ '--notification-icon-color': categoryInfo.colorVar } as CSSProperties}
      >
        <Icon size={16} strokeWidth={2} aria-hidden="true" />
      </span>

      {/* O título vem do tipo; a prévia é montada a partir do registro de
          origem, porque `notifications` não guarda conteúdo — só a
          referência (ver `types/notifications.ts`). */}
      <span className="min-w-0 flex-1 text-left">
        <span
          className={cn(
            'block text-[14px] text-foreground',
            notificacao.lida ? 'font-medium' : 'font-semibold'
          )}
        >
          {notificacao.titulo}
        </span>
        {notificacao.previa && (
          <span className="mt-0.5 block text-[12px] text-muted-foreground">
            {notificacao.previa}
          </span>
        )}
      </span>

      <span className="mt-1 shrink-0 text-[10px] whitespace-nowrap text-muted-foreground">
        {notificacao.horaLabel}
      </span>
    </>
  );

  // O botão de arquivar não pode morar DENTRO do Link/button de conteúdo
  // (elemento interativo aninhado é inválido) — por isso o card virou um
  // wrapper com dois filhos irmãos, e a borda/sombra de não-lida saiu daqui
  // pro wrapper, via `group`.
  const contentClassName = 'flex min-w-0 flex-1 items-start gap-3 p-3.5 text-left cursor-pointer';

  return (
    <div
      className={cn(
        'group flex items-stretch overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))] hover:shadow-sm',
        !notificacao.lida &&
          'shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_15%,transparent)] hover:shadow-[0_0_0_1px_color-mix(in_srgb,var(--color-primary)_15%,transparent),var(--shadow-sm)]'
      )}
    >
      {notificacao.destino ? (
        <Link to={notificacao.destino} onClick={handleClick} className={contentClassName}>
          {conteudo}
        </Link>
      ) : (
        <button type="button" onClick={handleClick} className={contentClassName}>
          {conteudo}
        </button>
      )}

      {notificacao.arquivada && onDesarquivar ? (
        <button
          type="button"
          onClick={() => onDesarquivar(notificacao.id)}
          aria-label="Tirar do arquivo"
          className="flex w-11 shrink-0 cursor-pointer items-center justify-center border-0 border-l border-l-border bg-transparent text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted hover:text-primary"
        >
          <ArchiveRestore size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onArquivar(notificacao.id)}
          aria-label="Arquivar notificação"
          className="flex w-11 shrink-0 cursor-pointer items-center justify-center border-0 border-l border-l-border bg-transparent text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted hover:text-destructive"
        >
          <Archive size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
