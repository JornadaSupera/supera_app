import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { initPushNotifications } from './services/pushNotifications'
import { clearLegacyPlaintextSession } from './services/session'

if (localStorage.getItem('supera_tema') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark')
}

// Remove o token de sessão que versões anteriores deixavam sem criptografia.
clearLegacyPlaintextSession()

initPushNotifications()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
