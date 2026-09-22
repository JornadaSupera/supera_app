import { QueryClient } from '@tanstack/react-query';
import { isTransientError } from './appError';

// Singleton do QueryClient. Vive fora de `main.tsx` porque `stores/sessionStore.ts`
// também precisa dele — para descartar o cache a cada troca de identidade (ver
// `handleIdentityChange`) — e uma store não pode importar de `main.tsx`.

/**
 * Repetir só faz sentido quando a causa pode ter mudado no intervalo: rede,
 * servidor indisponível, conflito momentâneo. Permissão negada, registro
 * inexistente e violação de regra respondem igual na segunda vez — insistir
 * apenas atrasa a tela de erro.
 *
 * Quem separa um caso do outro é o código que o `AppError` carrega (ver
 * `lib/appError.ts`). Erro sem código conhecido não é repetido.
 */
function shouldRetryQuery(failureCount: number, error: Error): boolean {
  return failureCount < 1 && isTransientError(error);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetryQuery,
      // Sem isto o padrão é 0 — toda montagem, todo foco de janela, toda
      // reconexão de rede refaz a leitura, mesmo pra dado que não muda no
      // meio da sessão (diário, agenda, orientações). 1 minuto cobre bem a
      // navegação normal entre abas; quem precisa de mais (catálogos como
      // sintomas/tipos de compromisso/assuntos do chat) já sobrescreve para
      // 30 minutos no próprio hook — esse default fica deliberadamente mais
      // curto que os catálogos, não é esquecimento.
      staleTime: 60 * 1000,
      // Mais longo que o padrão do TanStack (5 min): a navegação principal é
      // por abas fixas (Home/Diário/Agenda/Chat/Perfil) — o paciente volta
      // pra mesma tela repetidas vezes na mesma sessão, e cache retido por
      // mais tempo evita recarregar do zero a cada troca de aba.
      gcTime: 15 * 60 * 1000,
      // Decisão deliberada, não o padrão implícito: um app de saúde que o
      // paciente minimiza e reabre se beneficia de revalidar ao voltar pro
      // primeiro plano (novo compromisso, mensagem da equipe). Com o
      // `staleTime` acima, só refaz a busca quando o dado já não é fresco —
      // não a cada foco.
      refetchOnWindowFocus: true,
    },
    // Mutations não são repetidas: quase todas aqui escrevem algo (salvar
    // registro, enviar mensagem, convidar cuidador) e repetir arriscaria
    // duplicar a escrita.
    mutations: { retry: false },
  },
});
