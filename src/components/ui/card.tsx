import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  // A duração vai como propriedade arbitrária porque o CSS original usa
  // durações diferentes por propriedade (box-shadow 150ms, transform 100ms) e
  // um único `duration-*` não expressa isso. `transition-[...]` e `ease-[...]`
  // seguem como grupos nomeados, então continuam sobrescrevíveis via `cn()`.
  //
  // ⚠️ Consequência para quem consome: passar `duration-*` no `className` NÃO
  // tem efeito aqui — o tailwind-merge não enxerga conflito entre um grupo
  // nomeado e uma propriedade arbitrária, então as duas classes sobrevivem e a
  // arbitrária vence. Para mudar a duração, edite esta linha. `transition-*` e
  // `ease-*` continuam sobrescrevíveis normalmente.
  'relative block overflow-hidden rounded-2xl transition-[box-shadow,transform] [transition-duration:150ms,100ms] ease-[ease]',
  {
    variants: {
      // Só cor e borda. Sombra é eixo próprio (`elevation`) — antes vivia aqui
      // dentro e era desligada por um booleano `flat` solto.
      variant: {
        default: 'bg-card text-card-foreground border border-border',
        primary: 'bg-primary text-primary-foreground border-none',
        // `primary` com o brilho decorativo no canto. Variante, e não um
        // booleano `decorated`: o brilho usa `currentColor` e só funciona
        // sobre fundo colorido — num card branco ou contornado ficava errado,
        // e o booleano deixava fazer isso.
        highlight: 'bg-primary text-primary-foreground border-none',
        outline: 'bg-transparent text-foreground border border-border',
      },
      elevation: {
        sm: 'shadow-sm',
        none: 'shadow-none',
      },
      padding: {
        none: 'p-0',
        sm: 'p-3',
        md: 'p-5',
        lg: 'p-6',
      },
      clickable: {
        true: 'cursor-pointer hover:shadow-md active:translate-y-px',
      },
    },
    defaultVariants: { variant: 'default', elevation: 'sm', padding: 'md' },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLElement>,
    Omit<VariantProps<typeof cardVariants>, 'clickable'> {
  as?: React.ElementType;
  href?: string;
}

export default function Card({
  children,
  variant,
  elevation,
  padding,
  as = 'div',
  href,
  onClick,
  className,
  ...rest
}: CardProps) {
  const Tag = (href ? 'a' : as) as React.ElementType;
  const clickable = Boolean(onClick || href);

  return (
    <Tag
      href={href}
      onClick={onClick}
      className={cn(cardVariants({ variant, elevation, padding, clickable }), className)}
      {...rest}
    >
      {variant === 'highlight' && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-current opacity-10 blur-[32px]"
        />
      )}
      <div className="relative">{children}</div>
    </Tag>
  );
}
