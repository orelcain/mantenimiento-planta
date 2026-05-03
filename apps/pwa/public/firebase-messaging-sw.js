// Firebase Cloud Messaging Service Worker
// Este archivo debe estar en la raíz public/ para que Firebase pueda accederlo
//
// Firebase SDK self-hosted (vendor/firebase/10.7.1/) para:
//   1. Eliminar dependencia de 3rd-party script (gstatic.com)
//   2. Integridad: el SDK no puede cambiar bajo nuestros pies
//   3. Offline: funciona sin acceso a CDN externo
// Descargado desde https://www.gstatic.com/firebasejs/10.7.1/ (2026-04-09)
// Para actualizar: re-descargar los archivos y bumpear el path de version.

// Path relativo al scope del service worker (raíz del deploy).
// En GitHub Pages: /mantenimiento-planta/vendor/...
// En desarrollo: /vendor/...
// Usamos ruta relativa al propio SW para que funcione en ambos contextos.
importScripts('./vendor/firebase/10.7.1/firebase-app-compat.js')
importScripts('./vendor/firebase/10.7.1/firebase-messaging-compat.js')

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

// Manejar mensajes en background.
// El backend envía data-only (sin payload.notification) para evitar la
// auto-display del SDK FCM que sumada a este handler producía duplicados.
// Título y body vienen en payload.data.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload)

  const d = payload.data || {}
  const notificationTitle = d.title || payload.notification?.title || 'Nueva notificación'

  // Tag único por (machineId, milestone) o (incidentId) → iOS reemplaza la
  // anterior con el mismo tag en lugar de apilarla, evitando que un mismo
  // hito aparezca dos veces en la lock screen.
  const tag = d.incidentId
    || (d.machineId ? `${d.plant || ''}_${d.shiftDoc || ''}_${d.machineId}_${d.title || ''}` : null)
    || 'general'

  const notificationOptions = {
    body: d.body || payload.notification?.body || '',
    icon: './icons/icon-192.svg',
    badge: './icons/icon-192.svg',
    tag,
    data: d,
    requireInteraction: true,
  }

  return self.registration.showNotification(notificationTitle, notificationOptions)
})

// Manejar clics en notificaciones — navega a la URL profunda en lugar de
// solo enfocar el home. El backend manda `data.url` ya construida (relativa
// al scope), ej: `analisis-grader/turno/2026-05-03__Turno%202?linea=yal-eviscerado`.
self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event)

  event.notification.close()

  const target = event.notification.data?.url || ''
  const urlToOpen = target.startsWith('http')
    ? target
    : `${baseUrl}${String(target).replace(/^\/+/, '')}`

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // Si ya hay una ventana abierta de la app, navegar y enfocar.
      for (const client of clientList) {
        if (client.url.includes(baseUrl.replace(/\/$/, '')) && 'focus' in client) {
          if ('navigate' in client) {
            try { await client.navigate(urlToOpen) } catch (_) { /* fallback a focus */ }
          }
          return client.focus()
        }
      }
      // Sin ventana abierta — abrir una nueva en la URL específica.
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
