import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import BrandCover, { BrandStatusBand } from './brand-cover';

export interface BrandHeaderProps {
  /** A linha de cima: o logotipo (login) ou o voltar (telas de fluxo). */
  top: ReactNode;
  /** O `<h1>` da tela. */
  title: string;
  subtitle?: string;
  /** O medalhão ao lado do título. Decorativo. */
  hero?: ReactNode;
  className?: string;
}

/**
 * O alto das telas de entrada (login, recuperação de senha e cadastro): a
 * capa verde do onboarding, mais baixa, com a linha de cima, o título e o
 * subtítulo em branco e o medalhão ao lado. O título sobe ao abrir; com
 * movimento reduzido, aparece parado.
 *
 * Nada aqui se mede pela altura da tela (`dvh`), ao contrário do onboarding:
 * no Android o teclado encolhe a tela, e a capa mudaria de tamanho enquanto a
 * pessoa digita. Abaixo de 360 px de largura o medalhão sai: ali o título
 * quebraria em duas linhas e empurraria o formulário para baixo do rodapé
 * (conferido em 320 × 568).
 */
export default function BrandHeader({ top, title, subtitle, hero, className }: BrandHeaderProps) {
  return (
    <>
      {/* Presa no alto: ao rolar o formulário, nenhum campo passa por baixo do
          relógio. A capa logo abaixo continua a padronagem dela. */}
      <BrandStatusBand />
      {/* `gap-6`: 24 px entre a linha de cima e o título, como no cabeçalho do
          guia da clínica. */}
      <BrandCover
        shape="header"
        className={cn(
          'flex shrink-0 flex-col gap-6 px-6 pt-4 pb-8 [--brand-pattern-shift:var(--safe-top)]',
          className
        )}
      >
        {top}

        {/* Título e frase do cabeçalho do guia da clínica ("CabecalhoMarca"),
            na escala do app, um ponto abaixo do guia: `text-hero` (24/30) em
            negrito e `text-label` (14/20). */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 animate-rise flex-col gap-1 motion-reduce:animate-none">
            <h1 className="text-hero font-bold">{title}</h1>
            {subtitle && <p className="text-label">{subtitle}</p>}
          </div>

          {hero && <div className="shrink-0 max-[359px]:hidden">{hero}</div>}
        </div>
      </BrandCover>
    </>
  );
}
