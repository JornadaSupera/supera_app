import type { HTMLAttributes } from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import BrandPattern from './brand-pattern';

// `isolate` cria o contexto de empilhamento: a padronagem (`-z-10`) fica acima
// do fundo verde e abaixo do conteúdo, sem que quem usa precise posicionar nada.
//
// iPhone deitado: a raiz recua o recorte lateral (`index.css`), e a capa volta
// até a borda com `bleed-x`. A faixa devolvida é pintada por uma borda lateral
// do próprio verde, da largura do recorte — assim o recuo que cada tela passa
// (`px-6`, `px-5`) continua contando a partir da área segura, e nenhum
// consumidor precisa somar nada. Em retrato as bordas valem 0.
const brandCoverVariants = cva(
  'relative isolate bleed-x overflow-hidden border-l-[length:var(--safe-left)] border-r-[length:var(--safe-right)] border-[var(--color-brand-cover)] bg-[var(--color-brand-cover)] text-[var(--color-on-brand-cover)]',
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
 * A faixa da barra de status no verde da capa, presa no alto: ao rolar, o
 * texto dos cartões nunca passa por baixo do relógio. Sem faixa no aparelho, a
 * altura é zero. Vai logo antes da `BrandCover` nas abas que abrem com a capa
 * (Chat e Perfil).
 */
export function BrandStatusBand() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-30 bleed-x h-[var(--safe-top)] shrink-0 bg-[var(--color-brand-cover)]"
    />
  );
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
