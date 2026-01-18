/**
 * Herramientas de debugging para Firebase
 */

export function debugFirebaseConfig() {
  const config = {
    apiKey: "AIzaSyBsJSh6x3ZGEyuXsM18dSWsJKyU7--KJss",
    authDomain: "mantenimiento-planta-771a3.firebaseapp.com",
    projectId: "mantenimiento-planta-771a3",
    storageBucket: "mantenimiento-planta-771a3.firebasestorage.app",
    messagingSenderId: "1019421112530",
    appId: "1:1019421112530:web:9afd9962e0b53152f8d50b",
  }
  
  console.group('🔧 Firebase Configuration Debug')
  console.table(config)
  console.log('Project ID:', config.projectId)
  console.log('Messaging Sender ID:', config.messagingSenderId)
  console.groupEnd()
  
  return config
}

export function debugVAPIDKey() {
  const vapidKey = 'BNjR3wX8X_W-VxqQ9yF8ZdvKq5xG8dR4qY7wJ6K3dX5pQ8vF9rT3wN2xJ7yK5dR6vL8qT9wF3xN4yH7rJ2kP5dV'
  
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
