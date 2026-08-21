import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initPushNotifications } from './services/pushNotifications'

if (localStorage.getItem('supera_tema') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark')
}

initPushNotifications()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
