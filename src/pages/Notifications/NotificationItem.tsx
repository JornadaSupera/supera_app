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
    if (!notificacao.isRead) {
      onLida(notificacao.id);
    }
  }

  const conteudo = (
    <>
      {/* Ícone solto, sem pastilha: traço de 2 px na cor da categoria (o
          verde escuro dos ícones; o vermelho só no alerta). Com 24 px, tem a
          altura da primeira linha do título (`text-body`, 24 px) e fica
          centrado nela sem ajuste. */}
      <span
        className="inline-flex shrink-0 text-[var(--notification-icon-color)]"
        // Exceção deliberada à regra de não usar `style` inline: a cor varia por
        // instância (uma por categoria), então não há classe Tailwind estática
        // que a expresse — mesmo padrão de `--badge-color` (ui/badge.tsx).
        style={{ '--notification-icon-color': categoryInfo.colorVar } as CSSProperties}
      >
        <Icon size={24} strokeWidth={2} aria-hidden="true" />
      </span>

      {/* O título vem do tipo; a prévia é montada a partir do registro de
          origem, porque `notifications` não guarda conteúdo — só a
          referência (ver `types/notifications.ts`). A hora fecha o texto, no
          rodapé, como no card de orientação do guia: numa coluna à direita,
          ela estreitava o título e a prévia em toda a altura do card. */}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span
          className={cn(
            'break-words text-body text-foreground',
            notificacao.isRead ? 'font-medium' : 'font-semibold'
          )}
        >
          {notificacao.title}
        </span>
        {notificacao.preview && (
          <span className="break-words text-body-sm text-muted-foreground">
            {notificacao.preview}
          </span>
        )}
        <span className="text-caption font-medium text-muted-foreground">
          {notificacao.timeLabel}
        </span>
      </span>

      {/* Não lida: o ponto laranja do guia no canto de cima, sempre com o
          rótulo para leitor de tela, porque a cor sozinha não diz nada. O
          `mt-[7px]` centra o ponto de 10 px na primeira linha do título
          (`text-body`, 24 px). */}
      {!notificacao.isRead && (
        <>
          <span aria-hidden="true" className="mt-[7px] size-2.5 shrink-0 rounded-full bg-orange" />
          <span className="sr-only">Não lida</span>
        </>
      )}
    </>
  );

  // O botão de arquivar não pode morar DENTRO do Link/button de conteúdo
  // (elemento interativo aninhado é inválido) — por isso o card é um wrapper
  // com dois filhos irmãos. O wrapper não corta o que passa da borda
  // (`overflow-hidden`): o anel de foco de cada filho tem de aparecer inteiro,
  // então são os filhos que arredondam os próprios cantos.
  const contentClassName =
    'flex min-h-12 min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-l-lg p-4 text-left';

  // Arquivar e tirar do arquivo: 48 px de largura e o ícone de 24 px. Ao passar
  // o mouse, o verde escuro — o vermelho do guia é só para alerta.
  const archiveButtonClassName =
    'flex w-12 shrink-0 cursor-pointer items-center justify-center rounded-r-lg border-0 border-l border-l-border bg-transparent text-muted-foreground transition-colors duration-150 ease-[ease] hover:bg-muted hover:text-primary-deep';

  // O card de lista do guia: branco, fio claro, cantos de 14 px e a sombra
  // única dos cards. A não lida se distingue pelo ponto laranja e pelo título
  // em seminegrito, não por um contorno.
  return (
    <div className="flex items-stretch rounded-lg border border-border bg-card shadow-sm transition-[border-color] duration-150 ease-[ease] hover:border-[color-mix(in_srgb,var(--color-primary)_30%,var(--color-border))]">
      {notificacao.destination ? (
        <Link to={notificacao.destination} onClick={handleClick} className={contentClassName}>
          {conteudo}
        </Link>
      ) : (
        <button type="button" onClick={handleClick} className={contentClassName}>
          {conteudo}
        </button>
      )}

      {notificacao.isArchived && onDesarquivar ? (
        <button
          type="button"
          onClick={() => onDesarquivar(notificacao.id)}
          aria-label="Tirar do arquivo"
          className={archiveButtonClassName}
        >
          <ArchiveRestore size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      ) : (
        <button
          type="button"
          onClick={() => onArquivar(notificacao.id)}
          aria-label="Arquivar notificação"
          className={archiveButtonClassName}
        >
          <Archive size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
