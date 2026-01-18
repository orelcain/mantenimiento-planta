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

  // Limpiar registros antiguos que apunten a rutas inexistentes
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    const expectedScope = `${window.location.origin}${baseUrl}`

    registrations.forEach((registration) => {
      const scope = registration.scope
      const scriptUrl = registration.active?.scriptURL || ''

      const isWrongScope = !scope.startsWith(expectedScope)
      const isWrongScript = scriptUrl && !scriptUrl.includes('/mantenimiento-planta/')

      if (isWrongScope || isWrongScript) {
        registration.unregister().then((unregistered) => {
          if (unregistered) {
            console.log('🧹 Unregistered outdated SW:', { scope, scriptUrl })
          }
        })
      }
    })
  })

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
