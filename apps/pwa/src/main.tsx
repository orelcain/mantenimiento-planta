import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

// Importar el interceptor de SWs ANTES de cualquier otro import
import './utils/disableServiceWorkers'
import { cleanupServiceWorkers } from './utils/disableServiceWorkers'

// Limpiar SWs no deseados antes de renderizar
cleanupServiceWorkers().then(() => {
  console.log('✅ Service Workers cleanup completed')
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
