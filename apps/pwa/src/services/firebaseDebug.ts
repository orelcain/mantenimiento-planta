/* eslint-disable no-console -- herramienta de debug intencional: salida cruda a consola del navegador */
/**
 * Herramientas de debugging para Firebase
 */

export function debugFirebaseConfig() {
  const config = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY || '(not set)',
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || '(not set)',
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || '(not set)',
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || '(not set)',
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '(not set)',
    appId: import.meta.env.VITE_FIREBASE_APP_ID || '(not set)',
  }
  
  console.group('🔧 Firebase Configuration Debug')
  console.table(config)
  console.log('Project ID:', config.projectId)
  console.log('Messaging Sender ID:', config.messagingSenderId)
  console.groupEnd()
  
  return config
}

export function debugVAPIDKey() {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || '(not set)'
  
  console.group('🔑 VAPID Key Debug')
  console.log('Key length:', vapidKey.length)
  console.log('Key preview:', vapidKey.substring(0, 20) + '...' + vapidKey.substring(vapidKey.length - 20))
  console.log('Is valid Base64URL:', /^[A-Za-z0-9_-]+$/.test(vapidKey))
  console.groupEnd()
  
  return vapidKey
}

export function debugServiceWorker() {
  console.group('⚙️ Service Worker Debug')
  
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      console.log('Registered SWs:', registrations.length)
      registrations.forEach((reg, idx) => {
        console.log(`SW ${idx}:`, {
          scope: reg.scope,
          active: !!reg.active,
          installing: !!reg.installing,
          waiting: !!reg.waiting,
        })
      })
    })
  } else {
    console.warn('Service Workers not supported')
  }
  
  console.groupEnd()
}

export function debugNotificationAPI() {
  console.group('🔔 Notification API Debug')
  
  if ('Notification' in window) {
    console.log('Permission:', Notification.permission)
  } else {
    console.warn('Notification API not supported')
  }
  
  if ('serviceWorker' in navigator) {
    console.log('ServiceWorker support: ✅')
  } else {
    console.log('ServiceWorker support: ❌')
  }
  
  console.groupEnd()
}
