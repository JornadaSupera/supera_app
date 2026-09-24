import { Component, type ReactNode } from 'react';
import Button from './ui/button';
import ErrorState from './ui/error-state';
import { isStaleChunkError, reloadOnceAfterStaleChunk } from '../utils/staleChunk';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Última rede da árvore de componentes. Sem ela, um erro em qualquer tela
 * apaga o app inteiro e deixa a tela branca — que não explica nada ao
 * paciente nem oferece saída.
 *
 * O caso mais comum nem é bug: é o app aberto quando entra uma versão nova
 * (ver `utils/staleChunk.ts`). Por isso a tela oferece recarregar, que
 * resolve de verdade esse caso, e um caminho de volta ao início para os
 * demais.
 *
 * Continua sendo classe porque o React não tem equivalente em hook.
 */
export default class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error): void {
    // Versão nova: tenta sozinho uma vez, sem a pessoa precisar entender o
    // que aconteceu. A segunda falha seguida cai na tela abaixo.
    if (isStaleChunkError(error)) reloadOnceAfterStaleChunk();
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const versaoNova = isStaleChunkError(error);

    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-6 py-8">
        <ErrorState
          className="min-h-0"
          title={versaoNova ? 'O app foi atualizado' : 'Algo deu errado'}
          description={
            versaoNova
              ? 'Recarregue para continuar de onde você parou.'
              : 'Recarregue o app para continuar.'
          }
          onRetry={() => window.location.reload()}
          retryLabel="Recarregar"
        />

        <div className="mt-2 w-full max-w-[320px]">
          <Button fullWidth variant="ghost" onClick={() => window.location.assign('/')}>
            Ir para o início
          </Button>
        </div>
      </div>
    );
  }
}
