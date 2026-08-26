import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const cardVariants = cva(
  // A duração vai como propriedade arbitrária porque o CSS original usa
  // durações diferentes por propriedade (box-shadow 150ms, transform 100ms) e
  // um único `duration-*` não expressa isso. `transition-[...]` e `ease-[...]`
  // seguem como grupos nomeados, então continuam sobrescrevíveis via `cn()`.
  'relative block overflow-hidden rounded-2xl transition-[box-shadow,transform] [transition-duration:150ms,100ms] ease-[ease]',
  {
    variants: {
      variant: {
        default: 'bg-card text-card-foreground border border-border shadow-sm',
        primary: 'bg-primary text-primary-foreground border-none shadow-sm',
        outline: 'bg-transparent text-foreground border border-border',
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
      // Declarado depois de `variant` de propósito: assim `shadow-none` sai
      // depois de `shadow-sm` na string final e o tailwind-merge resolve o
      // conflito a favor do flat, sem precisar do seletor composto que o CSS
      // antigo usava (.card.flat).
      flat: {
        true: 'shadow-none',
      },
    },
    defaultVariants: { variant: 'default', padding: 'md' },
  }
);

export interface CardProps
  extends React.HTMLAttributes<HTMLElement>,
    Omit<VariantProps<typeof cardVariants>, 'clickable'> {
  decorated?: boolean;
  as?: React.ElementType;
  href?: string;
}

export default function Card({
  children,
  variant,
  padding,
  decorated = false,
  flat = false,
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
      className={cn(cardVariants({ variant, padding, clickable, flat }), className)}
      {...rest}
    >
      {decorated && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-current opacity-10 blur-[32px]"
        />
      )}
      <div className="relative">{children}</div>
    </Tag>
  );
}
