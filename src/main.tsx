import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.jsx'
import { initPushNotifications } from './services/pushNotifications'

if (localStorage.getItem('supera_tema') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark')
}

initPushNotifications()

const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
