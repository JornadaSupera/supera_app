import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import BrandCover from './brand-cover';

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
    <BrandCover
      shape="header"
      className={cn(
        'flex shrink-0 flex-col gap-4 px-6 pt-[calc(1rem_+_var(--safe-top))] pb-8',
        className
      )}
    >
      {top}

      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 animate-rise flex-col gap-1 motion-reduce:animate-none">
          <h1 className="text-[22px]/[1.2] font-semibold tracking-[-0.4px]">{title}</h1>
          {subtitle && <p className="text-[14px]/[1.45]">{subtitle}</p>}
        </div>

        {hero && <div className="shrink-0 max-[359px]:hidden">{hero}</div>}
      </div>
    </BrandCover>
  );
}
