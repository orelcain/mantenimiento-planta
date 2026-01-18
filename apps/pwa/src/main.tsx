import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Registrar Service Worker manualmente (ruta correcta en GitHub Pages)
if ('serviceWorker' in navigator) {
  const baseUrl = import.meta.env.BASE_URL || '/'
  const swUrl = `${baseUrl}sw.js`

  navigator.serviceWorker
    .register(swUrl, { scope: baseUrl })
    .then((registration) => {
      console.log('✅ App Service Worker registered:', {
        url: swUrl,
        scope: registration.scope,
      })
    })
    .catch((error) => {
      console.warn('⚠️ App Service Worker registration failed:', error instanceof Error ? error.message : String(error))
    })
}
