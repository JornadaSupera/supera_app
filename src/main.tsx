import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { queryClient } from './lib/queryClient'
import { initPushNotifications } from './services/pushNotifications'
import { watchPushSubscription } from './services/deviceRegistration'
import { reloadOnceAfterStaleChunk } from './utils/staleChunk'
import { clearLegacyPlaintextSession, useSessionStore } from './stores/sessionStore'
import { useDevicePreferencesStore } from './stores/devicePreferencesStore'

// Lê a mesma store que `ProfileHub` usa — uma única leitura de `localStorage`
// para o tema, não duas independentes (ver o comentário em
// `devicePreferencesStore.ts`).
if (useDevicePreferencesStore.getState().temaEscuro) {
  document.documentElement.setAttribute('data-theme', 'dark')
}

// O Vite avisa por este evento quando não consegue carregar o arquivo de uma
// tela — o caso típico é o app aberto quando entra uma versão nova.
// Recarregar busca a versão nova; se já tiver recarregado agora há pouco, o
// erro segue para a tela do `AppErrorBoundary` em vez de virar laço.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnceAfterStaleChunk()) event.preventDefault()
})

// Remove o token de sessão que versões anteriores deixavam sem criptografia.
clearLegacyPlaintextSession()

// Liga o app ao Supabase Auth uma única vez no boot. A partir daqui a sessão
// se mantém sozinha (renovação de token, logout vindo do servidor) e os
// componentes só consultam a store.
useSessionStore.getState().initialize()

initPushNotifications()

// O ID de inscrição do OneSignal costuma chegar só depois da permissão de
// notificação. Quando ele nasce ou muda, o aparelho é registrado de novo —
// desde que haja conta ativa na sessão.
watchPushSubscription(() => {
  const { status } = useSessionStore.getState()
  return status === 'autenticado' || status === 'sem-vinculo'
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
