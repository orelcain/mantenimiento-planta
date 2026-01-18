import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Limpiar TODOS los Service Workers antiguos al cargar la app
// Esto evita errores 404 de SWs obsoletos generados por VitePWA
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      const scriptUrl = registration.active?.scriptURL || ''
      
      // Solo mantener firebase-messaging-sw.js, eliminar todos los demás
      if (!scriptUrl.includes('firebase-messaging-sw.js')) {
        registration.unregister().then((success) => {
          if (success) {
            console.log('🧹 Removed old SW:', scriptUrl || registration.scope)
          }
        })
      }
    })
  })
}
