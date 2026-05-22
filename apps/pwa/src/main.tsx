import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
// IBM Plex Mono — lecturas técnicas/datos (instrumento/PLC). Self-hosted (offline-safe).
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import { logger } from '@/lib/logger'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js`
  navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL })
    .then(() => {
      logger.info('Service worker registered')
    })
    .catch(() => {
      logger.warn('Service worker registration failed')
    })
}
