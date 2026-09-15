import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App'
import { queryClient } from './lib/queryClient'
import { initPushNotifications } from './services/pushNotifications'
import { clearLegacyPlaintextSession, useSessionStore } from './stores/sessionStore'
import { useDevicePreferencesStore } from './stores/devicePreferencesStore'

// Lê a mesma store que `ProfileHub` usa — uma única leitura de `localStorage`
// para o tema, não duas independentes (ver o comentário em
// `devicePreferencesStore.ts`).
if (useDevicePreferencesStore.getState().temaEscuro) {
  document.documentElement.setAttribute('data-theme', 'dark')
}

// Remove o token de sessão que versões anteriores deixavam sem criptografia.
clearLegacyPlaintextSession()

// Liga o app ao Supabase Auth uma única vez no boot. A partir daqui a sessão
// se mantém sozinha (renovação de token, logout vindo do servidor) e os
// componentes só consultam a store.
useSessionStore.getState().initialize()

initPushNotifications()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
