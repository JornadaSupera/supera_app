import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const TONES: Record<string, string> = {
  primary: 'var(--color-primary)',
  secondary: 'var(--color-secondary-foreground)',
  muted: 'var(--color-muted-foreground)',
  destructive: 'var(--color-destructive)',
  'mood-0': 'var(--color-mood-0)',
  'mood-1': 'var(--color-mood-1)',
  'mood-2': 'var(--color-mood-2)',
  'mood-3': 'var(--color-mood-3)',
  'mood-4': 'var(--color-mood-4)',
  'mood-5': 'var(--color-mood-5)',
  'infusion-waiting': 'var(--color-infusion-waiting)',
  'infusion-prep': 'var(--color-infusion-prep)',
  'infusion-active': 'var(--color-infusion-active)',
  'infusion-done': 'var(--color-infusion-done)',
};

// `leading-none` NÃO pode morar no base: o tailwind-merge trata `text-[...]`
// das variantes como conflitante com `leading-*` (no Tailwind v4 a sintaxe
// `text-[tamanho]/[entrelinha]` permite que `text-*` carregue line-height), e
// descartaria o `leading-none` silenciosamente. Por isso cada tamanho declara
// font-size e entrelinha juntos, na forma `text-[..]/[1]`.
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full font-semibold',
  {
    variants: {
      variant: {
        subtle:
          'bg-[color-mix(in_srgb,var(--badge-color)_14%,transparent)] text-[var(--badge-color)]',
        solid: 'bg-[var(--badge-color)] text-primary-foreground',
      },
      size: {
        // Tamanhos arbitrários de propósito: `text-xs` valeria 12px mas
        // traria `line-height: 1.333`, e o CSS original usa `line-height: 1`
        // em todos os tamanhos.
        //
        // ⚠️ Ao consumir: passar `text-*` via `className` substitui esta classe
        // inteira, inclusive o `/[1]`, e a entrelinha volta ao padrão. Para
        // mudar só o tamanho, passe também a entrelinha: `text-[20px]/[1]`.
        sm: 'px-2.5 py-1 text-[11px]/[1]',
        md: 'px-3 py-[5px] text-[12px]/[1]',
      },
    },
    defaultVariants: { variant: 'subtle', size: 'sm' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  tone?: string;
  withDot?: boolean;
}

export default function Badge({
  children,
  tone = 'primary',
  variant,
  size,
  withDot = false,
  className,
  style,
  ...rest
}: BadgeProps) {
  const color = TONES[tone] || tone;

  return (
    <span
      className={cn(badgeVariants({ variant, size }), className)}
      // Exceção deliberada à regra de não usar `style` inline: a cor varia por
      // instância (`tone="mood-3"` vs `tone="destructive"`), então não há
      // classe Tailwind estática que a expresse. O que vai no style é uma
      // custom property, não uma propriedade que o Tailwind saiba gerar — o
      // mecanismo de override via `cn()` continua intacto para todo o resto.
      style={{ ...style, '--badge-color': color } as React.CSSProperties}
      {...rest}
    >
      {withDot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
