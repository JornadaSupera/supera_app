import type { ReactNode } from 'react';
import { cva } from 'class-variance-authority';
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
  /**
   * Capa baixa, sem medalhão: para telas de formulário em que o topo não pode
   * empurrar os campos para baixo (ex.: confirmar o cadastro pelo celular).
   */
  compact?: boolean;
  /**
   * Recolhe título e subtítulo, deixando só a faixa com o voltar: a reação da
   * tela ao teclado (`useSoftKeyboard`), para os campos não ficarem sob ele.
   */
  collapsed?: boolean;
  className?: string;
}

// `gap-6`: 24 px entre a linha de cima e o título, como no cabeçalho do guia
// da clínica. A compacta encosta mais (12 px) e fecha mais cedo embaixo; a
// recolhida (teclado aberto) fica só com a faixa do voltar.
const coverVariants = cva(
  'flex shrink-0 flex-col px-6 pt-4 transition-[padding,gap] duration-200 ease-out motion-reduce:transition-none [--brand-pattern-shift:var(--safe-top)]',
  {
    variants: {
      compact: {
        false: 'gap-6 pb-8',
        true: 'gap-3 pb-6',
      },
      collapsed: {
        false: '',
        true: 'gap-0 pb-3',
      },
    },
    defaultVariants: { compact: false, collapsed: false },
  }
);

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
export default function BrandHeader({
  top,
  title,
  subtitle,
  hero,
  compact = false,
  collapsed = false,
  className,
}: BrandHeaderProps) {
  return (
    <>
      {/* Presa no alto: ao rolar o formulário, nenhum campo passa por baixo do
          relógio. A capa logo abaixo continua a padronagem dela. */}
      <BrandStatusBand />
      <BrandCover shape="header" className={cn(coverVariants({ compact, collapsed }), className)}>
        {top}

        {/* Título e frase do cabeçalho do guia da clínica ("CabecalhoMarca"),
            na escala do app, um ponto abaixo do guia: `text-hero` (24/30) em
            negrito e `text-label` (14/20). */}
        {/* Recolher pela linha da grade (`1fr` → `0fr`) anima a altura real do
            bloco, sem medir nada. O título continua no DOM para o leitor de
            tela. */}
        <div
          className={cn(
            'grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none',
            collapsed ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          )}
        >
          <div className="flex min-h-0 items-center justify-between gap-4 overflow-hidden">
            <div className="flex min-w-0 animate-rise flex-col gap-1 motion-reduce:animate-none">
              <h1 className="text-hero font-bold">{title}</h1>
              {subtitle && <p className="text-label">{subtitle}</p>}
            </div>

            {hero && !compact && <div className="shrink-0 max-[359px]:hidden">{hero}</div>}
          </div>
        </div>
      </BrandCover>
    </>
  );
}
