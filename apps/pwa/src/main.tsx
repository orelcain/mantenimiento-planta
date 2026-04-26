import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'
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
