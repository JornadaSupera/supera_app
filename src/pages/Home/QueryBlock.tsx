import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import InlineError from '../../components/ui/inline-error';

interface QueryBlockProps<T> {
  query: Pick<UseQueryResult<T, Error>, 'data' | 'isLoading' | 'isError' | 'refetch'>;
  /** Com a forma do bloco: a tela nasce na altura final e não pula quando o dado chega. */
  skeleton: ReactNode;
  errorTitle: string;
  /** Recebe o dado já carregado. O estado vazio, se houver, é de quem renderiza. */
  children: (data: T) => ReactNode;
}

/**
 * Um bloco independente da Home, com Loading, Erro e Conteúdo resolvidos
 * aqui; o Vazio fica com o `children`, que sabe o que "nada" significa para
 * aquele bloco.
 *
 * Existe para a Home não virar tela de erro quando UM bloco falha, e para um
 * bloco que falhou nunca parecer vazio: o paciente que vê "nenhum compromisso"
 * onde a leitura falhou conclui que não tem consulta, e não que ficou sem
 * conexão.
 */
export default function QueryBlock<T>({ query, skeleton, errorTitle, children }: QueryBlockProps<T>) {
  // Dado em mãos vence o erro: uma releitura periódica que falha não pode
  // trocar um compromisso já mostrado por uma mensagem de erro.
  if (query.data !== undefined) return <>{children(query.data)}</>;

  if (query.isLoading) return <>{skeleton}</>;

  // Sem dado e sem carregar é falha — ou consulta parada por falta de rede.
  // "Não sei" nunca vale como "vazio": cai no erro, com o botão de tentar de novo.
  return <InlineError title={errorTitle} onRetry={() => void query.refetch()} />;
}
