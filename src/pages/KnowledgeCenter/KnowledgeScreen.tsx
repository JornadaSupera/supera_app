import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import BrandCover, { BrandCoverPattern } from '../../components/ui/brand-cover';
import Logo from '../../components/ui/logo';

export interface KnowledgeScreenProps {
  onBack: () => void;
  /**
   * O que vai na capa verde: o título da tela (`<h1>`, o título de capa do
   * guia: `text-hero`, 24/30 em negrito) e o que o acompanha.
   */
  cover: ReactNode;
  /**
   * O fundo da capa (ver `BrandCover`): a padronagem do "S" (padrão) ou a
   * pintura `agua-verde`, que a "Sobre a Supera" usa desde 07/10.
   */
  coverArt?: 'pattern' | 'water';
  children: ReactNode;
}

/**
 * Moldura das telas da Central de Conhecimento e da "Sobre a Supera": a capa
 * do manual da Supera.
 *
 * No alto, uma barra fixa com o voltar e o logotipo em branco — ela também
 * cobre a faixa da barra de status do aparelho, para o texto nunca passar por
 * baixo do relógio. Logo abaixo, a capa verde com o canto arredondado do
 * folheto, que rola com a tela. A barra e a capa levam a mesma padronagem do
 * "S", alinhada: parada, a tela mostra uma capa só, do topo até a curva
 * (pedido de 05/10/2026). O conteúdo começa sobre a borda da capa, em cartões
 * brancos com a sombra única dos cards do guia (`shadow-sm`).
 */
export default function KnowledgeScreen({ onBack, cover, coverArt, children }: KnowledgeScreenProps) {
  return (
    // Fundo na cor-base do app: os cartões brancos se destacam dele.
    // `isolate`: a pintura do pé da tela (presa à tela, `-z-10`) fica acima
    // deste fundo e abaixo do conteúdo.
    <div className="isolate flex min-h-[100dvh] flex-col bg-background">
      {/* `--color-ring` branco: o contorno de foco do reset global usa esta
          cor, e o laranja do foco do guia sobre a barra verde fica em 2,1:1
          no tema claro (abaixo de 3:1). `data-sticky-brand-bar`: o foco por
          Tab para abaixo da barra (index.css). */}
      {/* Uma barra só, baixa e reta (52 px mais a faixa do relógio), que
          continua na capa logo abaixo sem emenda: a capa desloca a padronagem
          por esta altura. O canto arredondado fica só na capa — na barra, ele
          desenhava um segundo cabeçalho por cima dela. */}
      <header
        data-sticky-brand-bar
        className="sticky top-0 z-20 isolate bleed-x flex h-[calc(3.25rem_+_var(--safe-top))] items-center gap-3 overflow-hidden bg-[var(--color-brand-cover)] px-safe-4 pt-[var(--safe-top)] text-[var(--color-on-brand-cover)] [--color-ring:var(--color-on-brand-cover)]"
      >
        <BrandCoverPattern />
        {/* O círculo tem 40 px, para a barra ficar baixa; o `after` leva o toque
            aos 48 px do guia. Seta de 24 px com traço de 2 px. */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="relative inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-brand-cover-deep)] after:absolute after:-inset-1 text-[var(--color-on-brand-cover)] ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset transition-[scale,background-color] duration-200 ease-[ease] active:scale-95 motion-reduce:active:scale-100"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>
        {/* Menor que na Início (26 px de altura): aqui a marca só acompanha o
            voltar, e quem fala é o título da capa. */}
        <Logo size="sm" tone="inverse" className="w-[112px]" />
      </header>

      {/* A margem de 16 px das telas no guia, a mesma da barra de cima: o título
          da capa e os cartões ficam alinhados ao voltar. */}
      <BrandCover
        shape="header"
        art={coverArt}
        className="px-4 pt-1 pb-16 [--brand-pattern-shift:calc(3.25rem_+_var(--safe-top))]"
      >
        {cover}
      </BrandCover>

      {/* `relative`: os cartões passam por cima da capa, que termina embaixo
          deles. Entre um bloco e outro, os 24 px do guia. */}
      <main className="relative flex flex-1 flex-col gap-6 px-4 pb-[calc(2.5rem_+_var(--safe-bottom))] -mt-10">{children}</main>
    </div>
  );
}
