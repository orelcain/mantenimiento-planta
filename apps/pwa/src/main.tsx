import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

if ('serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}firebase-messaging-sw.js`
  navigator.serviceWorker.register(swUrl, { scope: import.meta.env.BASE_URL })
    .then(() => {
      console.log('✅ Service worker registered')
    })
    .catch((error) => {
      console.warn('⚠️ Service worker registration failed', error)
    })
}
