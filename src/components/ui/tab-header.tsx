import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const tabTitleVariants = cva('mt-0.5 font-semibold text-foreground', {
  variants: {
    size: {
      default: 'text-[24px] tracking-[-0.6px]',
      // A aba que também é destino de outra tela ganha um título menor, para
      // caber na mesma linha do voltar e da ação.
      compact: 'text-[20px] tracking-[-0.5px]',
    },
  },
  defaultVariants: { size: 'default' },
});

export interface TabHeaderProps extends VariantProps<typeof tabTitleVariants> {
  /** Sobretítulo em caixa-alta: o nome da área (ex.: "MINHA AGENDA"). */
  eyebrow: string;
  title: ReactNode;
  /** Voltar, à esquerda do título — para a aba aberta a partir de outra tela. */
  onBack?: () => void;
  /** Conteúdo à direita do título, na mesma linha (ex.: contador). */
  actions?: ReactNode;
  /** Conteúdo abaixo do título, dentro do cabeçalho fixo: filtros, seletor de visão, resumo. */
  children?: ReactNode;
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
}: TabHeaderProps) {
  const heading = (
    <>
      <p className="text-[12px] font-medium tracking-[0.05em] text-muted-foreground uppercase">
        {eyebrow}
      </p>
      <h1 className={cn(tabTitleVariants({ size }))}>{title}</h1>
    </>
  );

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-[color-mix(in_srgb,var(--color-background)_95%,transparent)] px-6 pt-[calc(1.5rem_+_var(--safe-top))] pb-4 backdrop-blur-[8px]">
      {onBack || actions ? (
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
              onClick={onBack}
              aria-label="Voltar"
            >
              <ChevronLeft size={20} strokeWidth={2} />
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
