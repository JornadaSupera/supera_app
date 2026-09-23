import * as React from 'react';
import { TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import Button from './button';

export interface InlineErrorProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  /** Quando informado, mostra o botão de nova tentativa. */
  onRetry?: () => void;
  retryLabel?: string;
}

/**
 * Erro de UM bloco da tela — o card ou a seção que não carregou.
 *
 * É o irmão pequeno do `ErrorState`, que ocupa a tela inteira. Existe porque
 * uma tela de vários blocos independentes (a Home) não pode virar tela de erro
 * quando só um deles falha: o resto continua útil. E um bloco que falhou não
 * pode parecer vazio — "não carregou" e "não há nada" pedem ações diferentes,
 * e só o primeiro tem botão de tentar de novo.
 *
 * `role="alert"` para o leitor de tela anunciar a falha quando ela aparece.
 */
export default function InlineError({
  title = 'Não foi possível carregar',
  description = 'Verifique sua conexão e tente novamente.',
  onRetry,
  retryLabel = 'Tentar de novo',
  className,
  ...rest
}: InlineErrorProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--color-destructive)_30%,transparent)] bg-[color-mix(in_srgb,var(--color-destructive)_10%,transparent)] p-4',
        className
      )}
      {...rest}
    >
      <TriangleAlert
        size={18}
        strokeWidth={2}
        className="mt-0.5 shrink-0 text-destructive"
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-foreground">{title}</p>

        {description && (
          <p className="mt-0.5 text-[12px]/[1.4] text-muted-foreground">{description}</p>
        )}

        {onRetry && (
          <Button size="md" variant="outline" className="mt-3" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
