import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import BrandPattern from './brand-pattern';

// `isolate` cria o contexto de empilhamento: a padronagem (`-z-10`) fica acima
// do fundo verde e abaixo do conteúdo, sem que quem usa precise posicionar nada.
const brandCoverVariants = cva(
  'relative isolate overflow-hidden bg-[var(--color-brand-cover)] text-[var(--color-on-brand-cover)]',
  {
    variants: {
      shape: {
        /**
         * Topo da tela, de ponta a ponta, com o canto de baixo arredondado do
         * folheto da Supera (onboarding, Central de Conhecimento).
         */
        header: 'rounded-br-[48px]',
        /** A tela inteira (abertura do app). */
        full: '',
      },
    },
    defaultVariants: { shape: 'header' },
  }
);

export interface BrandCoverProps
  extends HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof brandCoverVariants> {
  /** Tamanho do "S" da padronagem (ver `BrandPattern`). */
  patternScale?: number;
}

/**
 * A capa da marca: o verde da Supera com a padronagem do "S", como a capa do
 * manual impresso. Texto por cima em branco (`--color-on-brand-cover`), que
 * passa em contraste sobre o verde nos dois temas.
 */
export default function BrandCover({
  shape,
  patternScale,
  className,
  children,
  ...rest
}: BrandCoverProps) {
  return (
    <div className={cn(brandCoverVariants({ shape }), className)} {...rest}>
      <BrandPattern
        scale={patternScale}
        className="-z-10 text-[color-mix(in_srgb,var(--color-on-brand-cover)_16%,transparent)]"
      />
      {children}
    </div>
  );
}
