import * as React from 'react';
import { cn } from '@/lib/utils';

export interface TagProps extends React.HTMLAttributes<HTMLElement> {
  color?: string;
  selected?: boolean;
  onClick?: () => void;
}

export default function Tag({
  children,
  color = 'var(--color-primary)',
  selected = false,
  onClick,
  className,
  style,
  ...rest
}: TagProps) {
  const selectable = Boolean(onClick);
  const Element = (selectable ? 'button' : 'span') as React.ElementType;

  return (
    <Element
      type={selectable ? 'button' : undefined}
      onClick={onClick}
      aria-pressed={selectable ? selected : undefined}
      className={cn(
        // `tracking-[0.02em]` é arbitrário porque `tracking-wide` vale 0.025em
        // no Tailwind, e o CSS original usa 0.02em.
        'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-[3px] text-[11px] font-medium tracking-[0.02em] transition-[opacity,background-color] duration-150 ease-[ease]',
        'border-[color-mix(in_srgb,var(--tag-color)_25%,transparent)] bg-[color-mix(in_srgb,var(--tag-color)_10%,transparent)] text-[var(--tag-color)]',
        selectable && [
          'relative cursor-pointer bg-transparent hover:opacity-80',
          // Área de toque invisível expandida para pelo menos 44x44px, sem
          // mudar o tamanho visual do chip (que precisa seguir pequeno/denso).
          "before:absolute before:inset-[-11px_-6px] before:content-['']",
        ],
        selected && 'border-transparent bg-[var(--tag-color)] text-primary-foreground',
        className
      )}
      // Exceção deliberada à regra de não usar `style` inline: a cor varia por
      // instância, então não há classe Tailwind estática equivalente. É uma
      // custom property, não algo que o Tailwind saiba gerar.
      style={{ ...style, '--tag-color': color } as React.CSSProperties}
      {...rest}
    >
      {children}
    </Element>
  );
}
