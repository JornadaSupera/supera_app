import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import BrandCover, { BrandCoverPattern } from '../../components/ui/brand-cover';
import Logo from '../../components/ui/logo';

export interface KnowledgeScreenProps {
  onBack: () => void;
  /** O que vai na capa verde: o título da tela (`<h1>`) e o que o acompanha. */
  cover: ReactNode;
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
 * brancos com sombra.
 */
export default function KnowledgeScreen({ onBack, cover, children }: KnowledgeScreenProps) {
  return (
    // Fundo na cor-base do app: os cartões brancos se destacam dele.
    <div className="flex min-h-[100dvh] flex-col bg-background">
      {/* `--color-ring` branco: o contorno de foco do reset global usa esta
          cor, e o verde da marca sobre a barra verde não aparecia (1,6:1).
          `data-sticky-brand-bar`: o foco por Tab para abaixo da barra (index.css). */}
      {/* Altura fixa (60 px mais a faixa do relógio): é dela que a capa abaixo
          desloca a padronagem para continuar o desenho sem emenda. */}
      <header
        data-sticky-brand-bar
        className="sticky top-0 z-20 isolate bleed-x flex h-[calc(3.75rem_+_var(--safe-top))] items-center gap-3 overflow-hidden bg-[var(--color-brand-cover)] px-safe-4 pt-[var(--safe-top)] text-[var(--color-on-brand-cover)] [--color-ring:var(--color-on-brand-cover)]"
      >
        <BrandCoverPattern />
        <button
          type="button"
          onClick={onBack}
          aria-label="Voltar"
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-[var(--color-brand-cover-deep)] text-[var(--color-on-brand-cover)] ring-1 ring-[color-mix(in_srgb,var(--color-on-brand-cover)_22%,transparent)] ring-inset transition-[scale,background-color] duration-200 ease-[ease] active:scale-95 motion-reduce:active:scale-100"
        >
          <ChevronLeft size={20} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <Logo size="sm" tone="inverse" className="w-[112px]" />
      </header>

      <BrandCover
        shape="header"
        className="px-5 pt-2 pb-16 [--brand-pattern-shift:calc(3.75rem_+_var(--safe-top))]"
      >
        {cover}
      </BrandCover>

      {/* `relative`: os cartões passam por cima da capa, que termina embaixo deles. */}
      <main className="relative flex flex-1 flex-col gap-5 px-5 pb-10 -mt-10">{children}</main>
    </div>
  );
}
