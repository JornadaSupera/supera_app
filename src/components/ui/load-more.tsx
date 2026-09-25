import { cn } from '@/lib/utils';
import Button from './button';
import InlineError from './inline-error';

export interface LoadMoreProps {
  /** Há mais uma página para trazer. Sem ela, nada aparece. */
  hasMore: boolean;
  /** A próxima página está a caminho. */
  isLoading: boolean;
  /** A leitura da próxima página falhou (a lista já carregada continua na tela). */
  hasError: boolean;
  onLoadMore: () => void;
  /** Texto do botão, no plural do que a lista mostra ("Carregar mais registros"). */
  label: string;
  errorTitle: string;
  className?: string;
}

/**
 * Rodapé de uma lista paginada: o botão de trazer mais, ou o erro dessa página.
 *
 * No TanStack Query, um "carregar mais" que falha também marca a consulta como
 * erro — mas o que já foi carregado continua na tela, e só esta página pede
 * nova tentativa. Por isso o erro aqui é um bloco pequeno com "Tentar de novo",
 * e não uma tela de erro que apagaria a lista. Enquanto a nova tentativa corre,
 * o erro continua marcado na consulta; por isso o botão volta, girando, em vez
 * de deixar o aviso parado na tela.
 */
export default function LoadMore({
  hasMore,
  isLoading,
  hasError,
  onLoadMore,
  label,
  errorTitle,
  className,
}: LoadMoreProps) {
  if (!hasMore) return null;

  return (
    <div className={cn('mt-5', className)}>
      {hasError && !isLoading ? (
        <InlineError title={errorTitle} onRetry={onLoadMore} />
      ) : (
        <Button fullWidth variant="outline" loading={isLoading} onClick={onLoadMore}>
          {label}
        </Button>
      )}
    </div>
  );
}
