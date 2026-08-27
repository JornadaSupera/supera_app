import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// O CSS original aplica o tamanho numa classe do wrapper (`.sm`, `.md`,
// `.lg`) e estiliza `wordmark`/`suffix` via seletor descendente
// (`.sm .wordmark`). Tailwind não tem um equivalente direto e idiomático
// para "classe no ancestral estiliza o descendente" — por isso cada `span`
// filho recebe sua própria variante de tamanho diretamente. O resultado
// (font-size/cor/peso computados em cada elemento) é idêntico; só a forma
// de aplicar mudou.
const wordmarkVariants = cva('font-extrabold tracking-[-0.02em] text-primary', {
  variants: {
    size: {
      sm: 'text-[20px]',
      md: 'text-[28px]',
      lg: 'text-[40px]',
    },
  },
  defaultVariants: { size: 'md' },
});

const suffixVariants = cva(
  // `--color-brand-gold` não está mapeado no `@theme inline` de index.css
  // (só as cores semânticas shadcn estão), então não existe utilitário
  // nomeado `text-brand-gold` — a cor vai como valor arbitrário referenciando
  // a custom property diretamente.
  'font-bold uppercase tracking-[0.04em] text-[var(--color-brand-gold)]',
  {
    variants: {
      size: {
        sm: 'text-[8px] pb-[2px]',
        md: 'text-[10px] pb-[3px]',
        lg: 'text-[14px] pb-[5px]',
      },
    },
    defaultVariants: { size: 'md' },
  }
);

export interface LogoProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof wordmarkVariants> {}

export default function Logo({ size, className, ...rest }: LogoProps) {
  return (
    <span
      role="img"
      aria-label="Supera Oncologia"
      className={cn('inline-flex select-none items-end gap-[6px] font-sans leading-none', className)}
      {...rest}
    >
      <span className={wordmarkVariants({ size })}>supera</span>
      <span className={suffixVariants({ size })}>oncologia</span>
    </span>
  );
}

export interface LogoMarkProps extends React.SVGAttributes<SVGSVGElement> {
  size?: number;
}

export function LogoMark({ size = 48, className, ...rest }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={cn(className)}
      role="img"
      aria-label="Jornada Supera"
      {...rest}
    >
      <defs>
        <linearGradient id="logo-mark-bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0BC4AA" />
          <stop offset="100%" stopColor="#08B59C" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="url(#logo-mark-bg)" />
      <path
        d="M32 49.5 C 18.5 41, 13 31, 17.5 24 C 21.5 18, 28.5 18.5, 32 24 C 35.5 18.5, 42.5 18, 46.5 24 C 51 31, 45.5 41, 32 49.5 Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}
