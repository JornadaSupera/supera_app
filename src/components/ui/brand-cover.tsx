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
         * folheto da Supera (Início, Chat, Perfil, Central de Conhecimento e
         * telas de entrada). O tamanho do canto é o token
         * `--brand-cover-corner` (`index.css`).
         */
        header: 'rounded-br-[var(--brand-cover-corner)]',
        /** A tela inteira (abertura do app). */
        full: '',
      },
    },
    defaultVariants: { shape: 'header' },
  }
);

/**
 * Para a capa continuar a padronagem de quem está acima dela (a faixa da barra
 * de status, a barra do voltar), quem usa passa a altura desse bloco em
 * `--brand-pattern-shift` pelo `className` — por exemplo
 * `[--brand-pattern-shift:var(--safe-top)]`. Ver `BrandPattern`.
 */
export type BrandCoverProps = HTMLAttributes<HTMLDivElement> & VariantProps<typeof brandCoverVariants>;

/**
 * A padronagem da capa — linhas brancas na opacidade do arquivo da clínica —
 * para blocos verdes que não são a capa em si (a faixa da barra de status, a
 * barra do voltar). Quem a recebe precisa de `isolate` e `overflow-hidden`.
 */
export function BrandCoverPattern() {
  return <BrandPattern className="-z-10 opacity-[var(--brand-pattern-opacity)]" />;
}

export interface BrandStatusBandProps {
  /** Posição da faixa. Sem nada, presa no alto da tela que rola (`sticky`). */
  className?: string;
}

/**
 * A faixa da barra de status, presa no alto: ao rolar, o texto dos cartões
 * nunca passa por baixo do relógio. Sem faixa no aparelho, a altura é zero.
 * Vai logo antes da `BrandCover` nas abas que abrem com a capa (Início, Chat e
 * Perfil) e no `BrandHeader` das telas de entrada.
 *
 * Leva a padronagem da capa, e não um verde liso (pedido de 05/10/2026: a capa
 * vai até o topo, sem a barra verde). A capa logo abaixo recebe
 * `[--brand-pattern-shift:var(--safe-top)]` e continua o desenho dela.
 */
export function BrandStatusBand({ className = 'sticky top-0 z-30' }: BrandStatusBandProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'isolate bleed-x h-[var(--safe-top)] shrink-0 overflow-hidden bg-[var(--color-brand-cover)] text-[var(--color-on-brand-cover)]',
        className
      )}
    >
      <BrandCoverPattern />
    </div>
  );
}

/**
 * A capa da marca: o verde da Supera com a padronagem do "S", como a capa do
 * manual impresso. Texto por cima em branco (`--color-on-brand-cover`), que
 * passa em contraste sobre o verde nos dois temas.
 */
export default function BrandCover({ shape, className, children, ...rest }: BrandCoverProps) {
  return (
    <div className={cn(brandCoverVariants({ shape }), className)} {...rest}>
      <BrandCoverPattern />
      {children}
    </div>
  );
}
