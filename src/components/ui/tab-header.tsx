import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Títulos de tela do guia da clínica, um ponto abaixo dele: `text-hero` (24/30)
// em negrito, sem espaçamento negativo.
const tabTitleVariants = cva('font-bold text-foreground', {
  variants: {
    size: {
      default: 'text-hero',
      // A aba que também é destino de outra tela ganha um título menor, para
      // caber na mesma linha do voltar e da ação.
      compact: 'text-title',
    },
  },
  defaultVariants: { size: 'default' },
});

export interface TabHeaderProps extends VariantProps<typeof tabTitleVariants> {
  /** Sobretítulo em frase normal: o nome da área (ex.: "Minha agenda"). */
  eyebrow: string;
  title: ReactNode;
  /** Voltar, à esquerda do título — para a aba aberta a partir de outra tela. */
  onBack?: () => void;
  /** Conteúdo à direita do título, na mesma linha (ex.: contador). */
  actions?: ReactNode;
  /** Conteúdo abaixo do título, dentro do cabeçalho fixo: filtros, seletor de visão, resumo. */
  children?: ReactNode;
  /**
   * Ajustes de contexto do cabeçalho. O recuo lateral é de 16 px (`px-safe-4`),
   * a margem das telas no guia; tela que ainda usa 24 px passa `px-safe-6`, que
   * vence por vir depois no CSS (o tailwind-merge não conhece `px-safe-*`).
   */
  className?: string;
}

/**
 * Cabeçalho fixo das telas de aba. Fica colado no topo e desfoca o que passa
 * por baixo, então o paciente sempre sabe em que área está enquanto rola a
 * lista.
 */
export default function TabHeader({
  eyebrow,
  title,
  onBack,
  actions,
  size,
  children,
  className,
}: TabHeaderProps) {
  // O espaço entre o sobretítulo e o título vem do `gap`: o reset global do
  // `index.css` (fora de `@layer`) zera a margem do `p` e do `h1`.
  const heading = (
    <div className="flex flex-col gap-0.5">
      <p className="text-label font-semibold text-muted-foreground">{eyebrow}</p>
      <h1 className={cn(tabTitleVariants({ size }))}>{title}</h1>
    </div>
  );

  return (
    <header
      className={cn(
        'sticky top-0 z-10 bleed-x border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-safe-4 pt-[calc(1.5rem_+_var(--safe-top))] pb-4 backdrop-blur-[8px]',
        className
      )}
    >
      {onBack || actions ? (
        <div className="flex items-center gap-3">
          {/* 48 px de toque e a seta de 24 px em `teal-deep`, como pede o guia. */}
          {onBack && (
            <button
              type="button"
              className="-ml-3 flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
              onClick={onBack}
              aria-label="Voltar"
            >
              <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
            </button>
          )}

          <div className="min-w-0 flex-1">{heading}</div>

          {actions}
        </div>
      ) : (
        heading
      )}

      {children}
    </header>
  );
}
