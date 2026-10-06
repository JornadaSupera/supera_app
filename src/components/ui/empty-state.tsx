import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import flowerClump from '@/assets/design/flower-clump.webp';
import Button, { type ButtonProps } from './button';

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}>;

interface EmptyStateBaseProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: IconComponent;
  iconTone?: string;
  title?: string;
  description?: string;
  /**
   * Troca o ícone pela pintura da touceira de flores (`touceira-flores` do guia
   * da clínica). Só nas telas vazias do Diário, da Agenda e das Notificações —
   * nunca no Chat, em alertas, formulários ou na leitura de uma orientação.
   */
  illustration?: boolean;
  /**
   * Variante do botão da ação. Primário por padrão; `outline` quando a tela já
   * tem o seu botão principal (o "+" do Diário): o guia pede um só por tela.
   */
  actionVariant?: ButtonProps['variant'];
}

/**
 * Ação é tudo ou nada: rótulo e handler juntos, ou nenhum dos dois. Com os
 * dois opcionais soltos, passar só um compilava e o botão simplesmente não
 * aparecia — erro silencioso que agora o TypeScript acusa.
 */
type EmptyStateActionProps =
  | { actionLabel: string; onAction: () => void }
  | { actionLabel?: never; onAction?: never };

export type EmptyStateProps = EmptyStateBaseProps & EmptyStateActionProps;

export default function EmptyState({
  icon: Icon = Inbox,
  iconTone,
  title = 'Nada por aqui ainda',
  description,
  illustration = false,
  actionVariant,
  actionLabel,
  onAction,
  className,
  style,
  ...rest
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center gap-3 px-5 py-8 text-center',
        className
      )}
      // Exceção deliberada ao "nunca style inline": a cor do ícone varia por
      // instância (`iconTone`), sem classe Tailwind estática equivalente —
      // mesmo padrão de `--badge-color`/`--tag-color` em badge.tsx/tag.tsx.
      style={iconTone ? ({ ...style, '--icon-tone': iconTone } as React.CSSProperties) : style}
      {...rest}
    >
      {illustration ? (
        // Decorativa (`alt` vazio), 170 px de largura: o guia pede de 140 a 200.
        // `width`/`height` reservam o espaço antes de a imagem chegar.
        <img
          src={flowerClump}
          alt=""
          width={650}
          height={700}
          className="mb-1 h-auto w-[170px] select-none"
        />
      ) : (
        <span
          className={cn(
            'mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground',
            iconTone &&
              'bg-[color-mix(in_srgb,var(--icon-tone)_10%,transparent)] text-[var(--icon-tone)]'
          )}
        >
          <Icon size={28} strokeWidth={2} aria-hidden />
        </span>
      )}
      {/* Título `text-title` (20/26) e frase `text-body-sm` (14/21): a tela
          vazia do guia da clínica, um ponto abaixo dele. */}
      <p className="text-title font-bold text-foreground">{title}</p>
      {description && (
        <p className="max-w-[280px] text-body-sm text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-2">
          <Button variant={actionVariant} onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
