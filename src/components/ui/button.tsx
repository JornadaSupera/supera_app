import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg border border-transparent font-semibold whitespace-nowrap cursor-pointer transition-[background-color,border-color,opacity,transform] duration-[0.15s,0.15s,0.15s,0.1s] ease-[ease,ease,ease,ease] [&:active:not(:disabled)]:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-sm [&:hover:not(:disabled)]:brightness-[0.94]',
        secondary: 'bg-secondary text-secondary-foreground [&:hover:not(:disabled)]:brightness-[0.97]',
        outline: 'bg-transparent border-border text-foreground [&:hover:not(:disabled)]:bg-muted',
        ghost: 'bg-transparent text-foreground [&:hover:not(:disabled)]:bg-muted',
        destructive: 'bg-destructive text-destructive-foreground [&:hover:not(:disabled)]:brightness-[0.94]',
        'destructive-soft':
          'bg-destructive/10 text-destructive [&:hover:not(:disabled)]:bg-destructive/20',
        // A ação principal das telas de entrada (onboarding e login): corpo com
        // profundidade em vez de um retângulo chapado — um degradê curto do
        // verde da marca para uma sombra dele mesmo, uma luz difusa no canto de
        // cima, um filete de luz no alto (`--color-highlight`) e um brilho da
        // cor embaixo. Ao tocar, encolhe de leve em vez de descer 1 px.
        //
        // O degradê escurece em direção ao texto do tema (`--color-foreground`),
        // não ao preto: no tema claro aprofunda o fundo sob o texto claro, e no
        // escuro clareia o fundo sob o texto escuro — o contraste melhora nos
        // dois.
        brand:
          'relative overflow-hidden border-none bg-[radial-gradient(120%_140%_at_18%_-10%,color-mix(in_srgb,var(--color-highlight)_22%,transparent),transparent_55%),linear-gradient(180deg,var(--color-primary),color-mix(in_srgb,var(--color-primary)_84%,var(--color-foreground)))] tracking-[0.01em] text-primary-foreground shadow-[inset_0_1px_0_0_color-mix(in_srgb,var(--color-highlight)_28%,transparent),0_12px_24px_-12px_color-mix(in_srgb,var(--color-primary)_75%,transparent)] transition-[scale,filter,opacity] duration-150 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)] motion-reduce:transition-none [&:active:not(:disabled)]:translate-y-0 [&:active:not(:disabled)]:scale-[0.97] motion-reduce:[&:active:not(:disabled)]:scale-100 [&:hover:not(:disabled)]:brightness-[0.96]',
      },
      size: {
        sm: 'h-8 px-3 text-[13px]',
        // 44px é o alvo de toque mínimo do projeto — o tamanho padrão do
        // botão precisa cumpri-lo sozinho, sem cada tela remendar com
        // `min-h-[44px]` por fora.
        md: 'h-11 px-4 text-sm',
        lg: 'h-12 px-5 text-base',
        // 56 px: a ação principal de uma tela de entrada merece mais que os
        // 44 px do padrão, sem sair da regra do alvo de toque.
        xl: 'h-14 rounded-xl px-6 text-[16px]',
      },
      fullWidth: { true: 'w-full' },
      pill: { true: 'rounded-full' },
      iconOnly: { true: 'px-0' },
      // Só com `size="sm"` (ver `compoundVariants`): o botão pequeno tem 32 px,
      // abaixo dos 44 px de toque do projeto.
      hitArea: { true: '' },
      // O reflexo corre por dentro do botão e não pode vazar da borda dele.
      sheen: { true: 'relative overflow-hidden' },
    },
    compoundVariants: [
      { iconOnly: true, size: 'sm', class: 'w-8' },
      { iconOnly: true, size: 'md', class: 'w-11' },
      { iconOnly: true, size: 'lg', class: 'w-12' },
      // Faixa invisível acima e abaixo: a área de toque chega a 44 px sem mudar
      // o desenho. São 7 px porque a faixa se mede por dentro da borda de 1 px
      // (30 px + 2 × 7 px = 44 px).
      { hitArea: true, size: 'sm', class: 'relative after:absolute after:inset-x-0 after:-inset-y-[7px]' },
    ],
    defaultVariants: { variant: 'primary', size: 'md' },
  }
);

type IconComponent = React.ComponentType<{ size?: number; strokeWidth?: number; 'aria-hidden'?: boolean }>;

// `ComponentProps<'button'>` traz o `ref`: no React 19 ele chega como prop
// comum e segue para o `<button>` junto com o resto.
export interface ButtonProps
  extends React.ComponentProps<'button'>,
    VariantProps<typeof buttonVariants> {
  fullWidth?: boolean;
  pill?: boolean;
  /**
   * Leva a área de toque do botão pequeno a 44 px sem mudar o desenho. Use em
   * botão sozinho na linha: dois empilhados de perto teriam as áreas
   * sobrepostas.
   */
  hitArea?: boolean;
  /**
   * Um reflexo atravessa o botão UMA vez, meio segundo depois de ele
   * aparecer: o único destaque da tela, sem nada piscando depois. Com
   * movimento reduzido, não aparece.
   */
  sheen?: boolean;
  iconLeft?: IconComponent;
  iconRight?: IconComponent;
  loading?: boolean;
}

const ICON_SIZE_BY_SIZE: Record<string, number> = { sm: 16, md: 18, lg: 20, xl: 22 };

export default function Button({
  children,
  variant,
  size = 'md',
  fullWidth = false,
  pill = false,
  hitArea = false,
  sheen = false,
  iconLeft: IconLeft,
  iconRight: IconRight,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const iconOnly = !children && Boolean(IconLeft || IconRight);
  const iconSize = ICON_SIZE_BY_SIZE[size ?? 'md'];

  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={cn(buttonVariants({ variant, size, fullWidth, pill, iconOnly, hitArea, sheen }), className)}
      {...rest}
    >
      {/* Fora da troca pelo spinner de propósito: montado uma vez, o reflexo
          passa uma vez — um envio que falha não o faz passar de novo. */}
      {sheen && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 animate-sheen bg-linear-to-r from-transparent via-[color-mix(in_srgb,var(--color-highlight)_50%,transparent)] to-transparent motion-reduce:hidden"
        />
      )}
      {loading ? (
        <Loader2 size={iconSize} className="animate-spin" aria-hidden="true" />
      ) : (
        <>
          {IconLeft && (
            <span className="inline-flex shrink-0">
              <IconLeft size={iconSize} strokeWidth={2} aria-hidden />
            </span>
          )}
          {children}
          {IconRight && (
            <span className="inline-flex shrink-0">
              <IconRight size={iconSize} strokeWidth={2} aria-hidden />
            </span>
          )}
        </>
      )}
    </button>
  );
}
