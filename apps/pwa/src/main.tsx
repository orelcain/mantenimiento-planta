import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Limpiar TODOS los Service Workers problemáticos
// Firebase Auth SDK y VitePWA registran SWs que causan errores 404
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      const scriptUrl = registration.active?.scriptURL || registration.installing?.scriptURL || registration.waiting?.scriptURL || ''
      
      // Solo mantener firebase-messaging-sw.js, eliminar TODOS los demás
      // Esto incluye:
      // - sw.js (VitePWA)
      // - service-worker.js (Firebase Auth SDK)
      // - Cualquier otro SW problemático
      if (!scriptUrl.includes('firebase-messaging-sw.js')) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('🧹 Removed problematic SW:', scriptUrl || registration.scope)
          }
        })
      }
    })
  })
}
