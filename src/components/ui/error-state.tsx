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
      {/* Sem pintura, ao contrário do vazio: o guia da clínica não a põe em alertas. */}
      <span className="mb-1 flex h-16 w-16 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <Icon size={28} strokeWidth={2} aria-hidden />
      </span>

      <p className="text-title font-bold text-foreground">{title}</p>

      {description && (
        <p className="max-w-[280px] text-body-sm text-muted-foreground">{description}</p>
      )}

      {onRetry && (
        <div className="mt-2">
          <Button variant="outline" onClick={onRetry}>
            {retryLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
