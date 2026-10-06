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
    // O bloco de alerta do guia da clínica: fundo `alert-soft`, sem borda,
    // raio de 20 e o triângulo em `alert`. O espaço entre os textos vem do
    // `gap`: o reset global do `index.css` (fora de `@layer`) zera a margem do `p`.
    <div
      role="alert"
      className={cn('flex items-start gap-3 rounded-2xl bg-destructive-soft p-4', className)}
      {...rest}
    >
      <TriangleAlert size={24} strokeWidth={2} className="shrink-0 text-destructive" aria-hidden="true" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-body font-semibold text-foreground">{title}</p>

        {description && <p className="text-body-sm text-muted-foreground">{description}</p>}

        {/* `self-start`: o botão fica do tamanho do rótulo, e não da coluna. */}
        {onRetry && (
          <Button variant="outline" className="mt-3 self-start" onClick={onRetry}>
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
