import * as React from 'react';
import { Inbox } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from './button';

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}>;

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: IconComponent;
  iconTone?: string;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon = Inbox,
  iconTone,
  title = 'Nada por aqui ainda',
  description,
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
      <span
        className={cn(
          'mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-muted text-muted-foreground',
          iconTone &&
            'bg-[color-mix(in_srgb,var(--icon-tone)_10%,transparent)] text-[var(--icon-tone)]'
        )}
      >
        <Icon size={28} strokeWidth={1.75} aria-hidden />
      </span>
      <p className="text-[17px] font-semibold text-foreground">{title}</p>
      {description && (
        <p className="max-w-[280px] text-[14px]/[20px] text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-2">
          <Button size="sm" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
