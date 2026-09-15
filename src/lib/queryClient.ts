import { QueryClient } from '@tanstack/react-query';

// Singleton do QueryClient. Vive fora de `main.tsx` porque `stores/sessionStore.ts`
// também precisa dele — para descartar o cache a cada troca de identidade (ver
// `handleIdentityChange`) — e uma store não pode importar de `main.tsx`.

/**
 * Um recurso que não existe não passa a existir por insistência: repetir a
 * busca só atrasa a tela de "não encontrado" (com a latência simulada de
 * 700ms, três tentativas custam mais de 2 segundos de spinner antes de o
 * usuário ver qualquer coisa).
 *
 * Esta é, hoje, a ÚNICA categoria de erro que dá pra distinguir aqui: toda
 * função de leitura em `services/mockApi.ts` recebe o erro do PostgREST e
 * relança `new Error('mensagem em português')` — de propósito, é assim que a
 * tela recebe uma mensagem amigável — o que também descarta o `code`
 * original no processo. Sem ele, não há como este `retry` diferenciar RLS,
 * validação ou JWT expirado de uma falha de rede genuinamente transitória;
 * fazer essa distinção exigiria mudar como as 74 funções de leitura lançam
 * erro, fora do escopo deste ajuste. Retry único no que sobra é o meio-termo:
 * cobre a falha de rede pontual sem multiplicar tentativas num erro que vai
 * se repetir de qualquer forma.
 */
function deveRepetir(contagemDeFalhas: number, erro: Error): boolean {
  if (/não encontrad[ao]/i.test(erro.message)) return false;
  return contagemDeFalhas < 1;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: deveRepetir,
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
