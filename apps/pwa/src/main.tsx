import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
// Sistema tipográfico IBM Plex (Sans para UI + Mono para datos). Self-hosted (offline-safe).
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-500.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-sans/latin-700.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import '@fontsource/ibm-plex-mono/latin-600.css'
import { logger } from '@/lib/logger'
import { marcarVidrioSolido } from '@/lib/vidrioSolido'

// La CSP del index se endureció el 10-11-2026 (lista explícita de scripts, sin
// 'unsafe-eval'). Si algo legítimo queda bloqueado, que se vea en errorLogs en vez
// de romperse en silencio (el Visor 3D ya se vio blanco una vez por la CSP).
document.addEventListener('securitypolicyviolation', (e) => {
  logger.error(`CSP bloqueó ${e.effectiveDirective}: ${e.blockedURI || '(inline)'}`, undefined, {
    fuente: e.sourceFile,
    linea: e.lineNumber,
    pagina: location.pathname,
  })
})

// Gama baja (≤ 4 GB o ≤ 4 núcleos): el vidrio se ve sólido. Antes de pintar, para no parpadear.
marcarVidrioSolido(document.documentElement)

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
