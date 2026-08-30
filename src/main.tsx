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

// Liga o app ao Supabase Auth uma única vez no boot. A partir daqui a sessão
// se mantém sozinha (renovação de token, logout vindo do servidor) e os
// componentes só consultam a store.
useSessionStore.getState().initialize()

initPushNotifications()

/**
 * Um recurso que não existe não passa a existir por insistência: repetir a
 * busca só atrasa a tela de "não encontrado" (com a latência simulada de
 * 700ms, três tentativas custam mais de 2 segundos de spinner antes de o
 * usuário ver qualquer coisa).
 *
 * Com o Supabase, o sinal confiável é o código do PostgREST. Os módulos ainda
 * mockados não têm código nenhum, então a checagem por mensagem continua
 * valendo para eles — sai quando o último módulo migrar.
 */
function temCodigo(erro: unknown, codigo: string): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'code' in erro &&
    (erro as { code?: unknown }).code === codigo
  )
}

function deveRepetir(contagemDeFalhas: number, erro: Error): boolean {
  // PGRST116: `.single()` sem linha correspondente. Não existe agora, não vai
  // passar a existir na segunda tentativa.
  if (temCodigo(erro, 'PGRST116')) return false
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
