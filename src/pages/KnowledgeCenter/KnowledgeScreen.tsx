import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import BrandCover from '../../components/ui/brand-cover';
import Logo from '../../components/ui/logo';

export interface KnowledgeScreenProps {
  onBack: () => void;
  /** O que vai na capa verde: o título da tela (`<h1>`) e o que o acompanha. */
  cover: ReactNode;
  children: ReactNode;
}

/**
 * Moldura das telas da Central de Conhecimento: a capa do manual da Supera.
 *
 * No alto, uma barra verde fixa com o voltar e o logotipo em branco — ela
 * também cobre a faixa da barra de status do aparelho, para o texto nunca
 * passar por baixo do relógio. Logo abaixo, a capa verde com a padronagem do
 * "S" e o canto arredondado do folheto, que rola com a tela. O conteúdo começa
 * sobre a borda da capa, em cartões brancos com sombra.
 */
export default function KnowledgeScreen({ onBack, cover, children }: KnowledgeScreenProps) {
  return (
    // Fundo com um toque do verde da marca: os cartões brancos se destacam dele.
    <div className="flex min-h-[100dvh] flex-col bg-[color-mix(in_srgb,var(--color-primary)_6%,var(--color-background))]">
      {/* `--color-ring` branco: o contorno de foco do reset global usa esta
          cor, e o verde da marca sobre a barra verde não aparecia (1,6:1).
          `data-sticky-brand-bar`: o foco por Tab para abaixo da barra (index.css). */}
      <header
        data-sticky-brand-bar
        className="sticky top-0 z-20 flex items-center gap-3 bg-[var(--color-brand-cover)] px-4 pt-[calc(0.5rem_+_var(--safe-top))] pb-2 text-[var(--color-on-brand-cover)] [--color-ring:var(--color-on-brand-cover)]"
      >
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

      <BrandCover shape="header" patternScale={0.3} className="px-5 pt-2 pb-16">
        {cover}
      </BrandCover>

      {/* `relative`: os cartões passam por cima da capa, que termina embaixo deles. */}
      <main className="relative flex flex-1 flex-col gap-5 px-5 pb-10 -mt-10">{children}</main>
    </div>
  );
}
