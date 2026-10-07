import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

/**
 * O botão secundário do guia da clínica: só o contorno de 2 px e o texto no
 * verde escuro, sem preenchimento. `secondary` e `outline` são o mesmo botão.
 */
const SECONDARY_BUTTON =
  'border-primary-deep bg-transparent text-primary-deep [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]';

// Os botões do guia da clínica ("Botao"): altura mínima de 48 px, cantos de
// 14 px, texto `text-body` (16 px) em seminegrito e 24 px de cada lado.
// Primário no verde da marca com texto escuro (nunca branco), secundário só
// com o contorno no verde escuro, destaque em laranja com texto escuro. Uma
// ação principal por tela.
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg border-2 border-transparent font-semibold whitespace-nowrap cursor-pointer transition-[background-color,border-color,opacity,transform] duration-[0.15s,0.15s,0.15s,0.1s] ease-[ease,ease,ease,ease] [&:active:not(:disabled)]:translate-y-px disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground [&:hover:not(:disabled)]:brightness-[0.94]',
        secondary: SECONDARY_BUTTON,
        outline: SECONDARY_BUTTON,
        // Ação de texto (ex.: "Atualizar depois"): como um link, no verde escuro.
        ghost: 'bg-transparent text-primary-deep [&:hover:not(:disabled)]:bg-muted',
        // O destaque laranja do guia: chamadas especiais, nunca ação destrutiva.
        accent: 'bg-orange text-on-orange [&:hover:not(:disabled)]:brightness-[0.95]',
        // A ação discreta de topo e de cartão (pedido de 07/10: "Novo registro",
        // "Falar com a equipe"): o verde da marca bem claro por trás e o texto
        // no verde escuro, como o "Obter" da App Store nas cores da Supera.
        soft: 'bg-[color-mix(in_srgb,var(--color-primary)_14%,transparent)] text-primary-deep [&:hover:not(:disabled)]:bg-[color-mix(in_srgb,var(--color-primary)_22%,transparent)]',
        destructive: 'bg-destructive text-destructive-foreground [&:hover:not(:disabled)]:brightness-[0.94]',
        'destructive-soft':
          'bg-destructive-soft text-destructive-deep [&:hover:not(:disabled)]:brightness-[0.97]',
        // A ação principal das telas de entrada (onboarding e login): o verde
        // da marca chapado, com o texto escuro, como o primário. Ao tocar,
        // encolhe de leve em vez de descer 1 px. O foco é o anel global do app
        // (`:focus-visible`, em `index.css`).
        brand:
          'relative overflow-hidden bg-primary text-primary-foreground transition-[scale,filter,opacity] duration-150 ease-[ease] motion-reduce:transition-none [&:active:not(:disabled)]:translate-y-0 [&:active:not(:disabled)]:scale-[0.97] motion-reduce:[&:active:not(:disabled)]:scale-100 [&:hover:not(:disabled)]:brightness-[0.96]',
      },
      size: {
        // O botão de linha (ao lado de um texto): texto menor, mas a mesma
        // altura de 48 px — o guia não aceita botão menor que isso.
        sm: 'h-12 px-4 text-label',
        // O botão do guia: 48 px, a menor área de toque do app.
        md: 'h-12 px-6 text-body',
        lg: 'h-[52px] px-6 text-body',
        // 56 px: a ação principal de uma tela de entrada.
        xl: 'h-14 px-6 text-body',
        // A cápsula pequena das ações discretas: 36 px à vista, e o `after`
        // estende o toque a 44 px, o mínimo de toque do app.
        compact:
          "relative h-9 gap-1.5 px-3.5 text-label after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']",
      },
      fullWidth: { true: 'w-full' },
      pill: { true: 'rounded-full' },
      iconOnly: { true: 'px-0' },
    },
    compoundVariants: [
      { iconOnly: true, size: 'sm', class: 'w-12' },
      { iconOnly: true, size: 'md', class: 'w-12' },
      { iconOnly: true, size: 'lg', class: 'w-[52px]' },
      { iconOnly: true, size: 'xl', class: 'w-14' },
      { iconOnly: true, size: 'compact', class: 'w-9' },
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
  iconLeft?: IconComponent;
  iconRight?: IconComponent;
  loading?: boolean;
}

/**
 * Ícone de traço ao lado do texto `text-body` (16 px): 24 px, o mínimo do
 * guia. O `sm`, de texto `text-label` (14 px), fica com 20; a cápsula
 * `compact`, com 18.
 */
const ICON_SIZE_BY_SIZE: Record<string, number> = { sm: 20, md: 24, lg: 24, xl: 24, compact: 18 };

export default function Button({
  children,
  variant,
  size = 'md',
  fullWidth = false,
  pill = false,
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
      className={cn(buttonVariants({ variant, size, fullWidth, pill, iconOnly }), className)}
      {...rest}
    >
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
