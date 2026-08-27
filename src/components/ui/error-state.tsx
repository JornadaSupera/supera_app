import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from './button';

type IconComponent = React.ComponentType<{
  size?: number;
  strokeWidth?: number;
  'aria-hidden'?: boolean;
}>;

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: IconComponent;
  title?: string;
  description?: string;
  /** Quando informado, mostra o botão de nova tentativa. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Estado de erro — o quarto dos Estados Obrigatórios (Loading, Vazio, Erro,
 * Conteúdo). Espelha a estrutura do `EmptyState` de propósito: para o
 * paciente, "vazio" e "deu erro" precisam ser visualmente irmãos, mudando só
 * o tom e a ação oferecida.
 *
 * `role="alert"` (o EmptyState não tem) porque um erro precisa ser anunciado
 * ao leitor de tela assim que aparece.
 */
export default function ErrorState({
  icon: Icon = TriangleAlert,
  title = 'Não foi possível carregar',
  description = 'Verifique sua conexão e tente novamente.',
  onRetry,
  retryLabel = 'Tentar novamente',
  className,
  ...rest
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex min-h-[50vh] flex-col items-center justify-center gap-3 px-5 py-8 text-center',
        className
      )}
      {...rest}
    >
      <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] text-destructive">
        <Icon size={28} strokeWidth={1.75} aria-hidden />
      </span>

      <p className="text-[17px] font-semibold text-foreground">{title}</p>

      {description && (
        <p className="max-w-[280px] text-[14px]/[20px] text-muted-foreground">{description}</p>
      )}

      {onRetry && (
        <div className="mt-2">
          <Button size="sm" variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
