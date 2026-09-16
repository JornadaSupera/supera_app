import * as React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  actions?: React.ReactNode;
}

/**
 * Cabeçalho de página de nível superior (Perfil, Recuperar senha...).
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
        'sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background p-4 pt-[calc(1rem_+_var(--safe-top))]',
        className
      )}
      {...rest}
    >
      {onBack && (
        <button
          type="button"
          className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-transparent text-foreground transition-colors duration-150 ease-[ease] hover:bg-muted"
          onClick={onBack}
          aria-label="Voltar"
        >
          <ArrowLeft size={20} strokeWidth={2} aria-hidden="true" />
        </button>
      )}

      <div className="min-w-0 flex-1">
        <h1 className="overflow-hidden text-[24px]/[32px] font-semibold tracking-[-0.6px] text-ellipsis whitespace-nowrap text-foreground">
          {title}
        </h1>
        {subtitle && <p className="text-[14px]/[20px] text-muted-foreground">{subtitle}</p>}
      </div>

      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
