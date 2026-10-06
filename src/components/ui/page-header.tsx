import * as React from 'react';
import { ChevronLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho de página de nível superior (hoje, só na vitrine interna do design
 * system: as telas do app usam `TabHeader`, `StepHeader` ou a capa da marca).
 * Fixo e com borda inferior — esse pacote visual nunca varia entre telas,
 * então não é prop: era `sticky bordered` repetido em todo consumidor.
 */
export default function PageHeader({
  title,
  subtitle,
  onBack,
  actions,
  className,
  ...rest
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        'sticky top-0 z-20 bleed-x flex items-center gap-3 border-b border-border bg-background px-safe-4 pt-[calc(1rem_+_var(--safe-top))] pb-4',
        className
      )}
      {...rest}
    >
      {/* O voltar das outras barras (`TabHeader`): 48 px de toque, a seta de
          24 px em `teal-deep` e o `-ml-3` que alinha a seta com a margem. */}
      {onBack && (
        <button
          type="button"
          className="-ml-3 inline-flex h-12 w-12 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-primary-deep transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ChevronLeft size={24} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      {/* Título de tela do guia na escala do app (`text-hero`, 24/30, em
          negrito, sem espaçamento negativo) e a frase em `text-body-sm`. */}
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-hero font-bold text-foreground">{title}</h1>
        {subtitle && <p className="text-body-sm text-muted-foreground">{subtitle}</p>}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
