import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const TONES: Record<string, string> = {
  primary: 'var(--color-primary-deep)',
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

// `leading-*` NÃO pode morar no base: o tailwind-merge trata o tamanho das
// variantes como conflitante com `leading-*` (no Tailwind v4 o `text-*` pode
// carregar a entrelinha), e descartaria o `leading-*` silenciosamente. Por
// isso cada tamanho usa um nome da escala de letra (`text-caption`,
// `text-label`), que já traz a entrelinha dele.
const badgeVariants = cva(
  'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full font-semibold',
  {
    variants: {
      variant: {
        // Tinta clara da cor e o texto puxado para a cor do texto do tema: as
        // cores de humor e de situação, sozinhas, não têm contraste para
        // letra pequena sobre fundo claro.
        subtle:
          'bg-[color-mix(in_srgb,var(--badge-color)_14%,var(--color-card))] text-[color-mix(in_srgb,var(--badge-color)_60%,var(--color-foreground))]',
        solid: 'bg-[var(--badge-color)] text-primary-foreground',
      },
      size: {
        // Os tamanhos do guia: a etiqueta do "CardOrientacao" (`text-caption`,
        // 13/18) no `sm` e o rótulo (`text-label`, 14/20) no `md`.
        //
        // ⚠️ Ao consumir: passar `text-*` via `className` substitui esta classe
        // inteira, inclusive a entrelinha, que volta ao padrão. Para mudar o
        // tamanho, passe outro nome da escala (`text-body`), que já traz a
        // entrelinha dele.
        sm: 'px-3 py-0.5 text-caption',
        md: 'px-3 py-1 text-label',
      },
      // Interno (ver `Badge`): os tons da marca usam as cores exatas do guia.
      brand: { true: '', false: '' },
    },
    compoundVariants: [
      // Etiqueta de especialidade do guia: verde-água claro, texto verde escuro.
      { variant: 'subtle', brand: true, className: 'bg-secondary text-primary-deep' },
    ],
    defaultVariants: { variant: 'subtle', size: 'sm', brand: false },
  }
);

/** Tons que, no `subtle`, ganham as cores exatas da etiqueta do guia. */
const BRAND_TONES = new Set(['primary', 'secondary']);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    Omit<VariantProps<typeof badgeVariants>, 'brand'> {
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
      className={cn(badgeVariants({ variant, size, brand: BRAND_TONES.has(tone) }), className)}
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
