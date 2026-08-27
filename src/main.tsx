import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { initPushNotifications } from './services/pushNotifications'
import { clearLegacyPlaintextSession, useSessionStore } from './stores/sessionStore'

if (localStorage.getItem('supera_tema') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark')
}

// Remove o token de sessão que versões anteriores deixavam sem criptografia.
clearLegacyPlaintextSession()

// Lê o cofre uma única vez no boot; a partir daqui os componentes consultam a
// store, em vez de cada um abrir o armazenamento por conta própria.
void useSessionStore.getState().carregar()

initPushNotifications()

/**
 * Um recurso que não existe não passa a existir por insistência: repetir a
 * busca só atrasa a tela de "não encontrado" (com a latência simulada de
 * 700ms, três tentativas custam mais de 2 segundos de spinner antes de o
 * usuário ver qualquer coisa).
 *
 * Enquanto a fonte de dados é o `mockApi`, a distinção vem da mensagem — é o
 * único sinal disponível, já que não há status HTTP. Quando o Supabase entrar,
 * trocar por checagem de código/status (`PGRST116` para "no rows"), que é
 * confiável de verdade.
 */
function deveRepetir(contagemDeFalhas: number, erro: Error): boolean {
  if (/não encontrad[ao]/i.test(erro.message)) return false
  return contagemDeFalhas < 1
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: deveRepetir },
    // Mutations não são repetidas: quase todas aqui escrevem algo (salvar
    // registro, enviar mensagem, convidar cuidador) e repetir arriscaria
    // duplicar a escrita.
    mutations: { retry: false },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
