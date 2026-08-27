import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const SPINNER_SIZES: Record<string, number> = { sm: 14, md: 20, lg: 28 };

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: 'sm' | 'md' | 'lg' | number;
}

// Elemento decorativo puro — não usa `cva` porque não há variantes de
// cor/forma, só um tamanho que pode ser um número arbitrário além de
// sm/md/lg (ver comentário sobre `--spinner-size` abaixo).
export function Spinner({ size = 'md', className, style, ...rest }: SpinnerProps) {
  const px = typeof size === 'number' ? size : (SPINNER_SIZES[size] ?? SPINNER_SIZES.md);

  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cn(
        'inline-block rounded-full border-[2.5px] border-current border-r-transparent opacity-[0.85]',
        // `spin 0.7s linear infinite` explícito porque o `animate-spin`
        // padrão do Tailwind gira em 1s — a curva (`linear`) e o nome do
        // keyframe (`spin`) são os mesmos do tema default, só a duração
        // muda. Esse `@keyframes spin` não é gerado por este arquivo: ele
        // entra no bundle global porque `button.tsx` (`Loader2` do estado
        // `loading`) já usa a classe literal `animate-spin` em outro lugar
        // do app — confirmado no CSS compilado (`dist/assets/index-*.css`,
        // que é a única folha de estilo referenciada por `index.html`, ou
        // seja, carrega em toda página) e na animação ao vivo via
        // `getAnimations()` no navegador. Se essa classe literal um dia
        // sumir do projeto inteiro, o keyframe some junto e este spinner
        // fica parado (não quebra, só não gira) — checar de novo se isso
        // for removido de button.tsx.
        'animate-[spin_0.7s_linear_infinite]',
        // Tamanho via custom property + classe estática: `size` aceita um
        // número arbitrário além de sm/md/lg, e o Tailwind só gera classes
        // para valores literais presentes no código-fonte em build time —
        // um `w-[${px}px]` calculado em runtime é invisível para o
        // compilador. Por isso a dimensão vira `--spinner-size`, e quem
        // aplica de fato é a classe estática abaixo — isso mantém a
        // dimensão sobrescrevível via `cn()`/twMerge, ao contrário de
        // escrever `width`/`height` direto no `style` (exceção legítima ao
        // "nunca style inline": aqui não há como expressar um valor
        // dinâmico por instância de outra forma).
        'w-[var(--spinner-size)] h-[var(--spinner-size)]',
        className
      )}
      style={{ ...style, '--spinner-size': `${px}px` } as React.CSSProperties}
      {...rest}
    />
  );
}

const loadingVariants = cva('flex items-center justify-center gap-3 text-primary', {
  variants: {
    inline: {
      true: 'flex-row gap-2 py-2 px-0',
      false: 'flex-col min-h-[60vh] w-full',
    },
  },
  defaultVariants: { inline: false },
});

export interface LoadingProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof loadingVariants> {
  label?: string;
}

export default function Loading({
  label = 'Carregando…',
  inline = false,
  className,
  ...rest
}: LoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(loadingVariants({ inline }), className)}
      {...rest}
    >
      <Spinner size={inline ? 'sm' : 'lg'} />
      {label && <span className="text-[14px] text-muted-foreground">{label}</span>}
    </div>
  );
}
