// Firebase Cloud Messaging Service Worker
// Este archivo debe estar en la raíz public/ para que Firebase pueda accederlo

importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js')

// Configuración de Firebase (debe coincidir con firebase.ts)
const firebaseConfig = {
  apiKey: "AIzaSyBsJSh6x3ZGEyuXsM18dSWsJKyU7--KJss",
  authDomain: "mantenimiento-planta-771a3.firebaseapp.com",
  projectId: "mantenimiento-planta-771a3",
  storageBucket: "mantenimiento-planta-771a3.firebasestorage.app",
  messagingSenderId: "1019421112530",
  appId: "1:1019421112530:web:9afd9962e0b53152f8d50b",
}

// Inicializar Firebase en el service worker
firebase.initializeApp(firebaseConfig)

// Obtener instancia de messaging
const messaging = firebase.messaging()

// Detectar BASE_URL dinámicamente
function getBaseUrl() {
  // Si estamos en GitHub Pages: https://orelcain.github.io/mantenimiento-planta/
  if (self.location.href.includes('github.io')) {
    return '/mantenimiento-planta/'
  }
  // Si estamos en localhost o desarrollo
  return '/'
}

const baseUrl = getBaseUrl()

// Cache for heavy assets (models, images)
const CACHE_NAME = 'assets-cache-v1'
const HEAVY_ASSET_RE = /\.(glb|gltf|bin|jpg|jpeg|png|webp|svg)$/i

// Manejar mensajes en background
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload)
  
  const notificationTitle = payload.notification?.title || 'Nueva notificación'
  
  // Usar rutas relativas simples para evitar 404
  const notificationOptions = {
    body: payload.notification?.body || '',
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    tag: payload.data?.incidentId || 'general',
    data: payload.data,
    requireInteraction: true,
  }

  return self.registration.showNotification(notificationTitle, notificationOptions)
})

// Manejar clics en notificaciones
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event)
  
  event.notification.close()
  
  // Navegar a la app
  const urlToOpen = event.notification.data?.url || `${baseUrl}`
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Si ya hay una ventana abierta, enfocala
      for (const client of clientList) {
        if (client.url.includes(baseUrl.replace(/\/$/, '')) && 'focus' in client) {
          return client.focus()
        }
      }
      // Si no, abre una nueva ventana
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen)
      }
    })
  )
})

// Cache heavy assets for offline use
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // Only cache same-origin and storage assets
  const isSameOrigin = url.origin === self.location.origin
  const isStorage = url.hostname.includes('firebasestorage')
  if (!isSameOrigin && !isStorage) return

  if (!HEAVY_ASSET_RE.test(url.pathname)) return

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request)
      if (cached) {
        // Update in background
        event.waitUntil(
          fetch(request).then((res) => {
            if (res && res.ok) cache.put(request, res.clone())
          }).catch(() => undefined)
        )
        return cached
      }
      const response = await fetch(request)
      if (response && response.ok) {
        cache.put(request, response.clone())
      }
      return response
    })
  )
})

console.log('[firebase-messaging-sw.js] Service Worker loaded successfully')
