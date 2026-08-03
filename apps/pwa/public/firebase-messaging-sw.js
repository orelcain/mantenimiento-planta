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

// ─── App Shell para el bot Mini App (mant.html) ────────────────────
// Permite que el bot ABRA sin red. Sin esto, el WebView de Telegram falla
// al hacer GET de mant.html y muestra "no internet" antes de ejecutar
// cualquier JS. La precarga ocurre en el evento `install` del SW.
const SHELL_CACHE = 'mant-shell-v3'

// ─── App Shell de la PWA principal ─────────────────────────────────
// Para que la app ABRA sin señal: el técnico consulta el catálogo de
// variadores parado frente a un tablero, donde no siempre hay cobertura.
// APP_SHELL guarda el index.html; APP_ASSETS los chunks JS/CSS.
// Los assets llevan hash en el nombre (index-a1b2c3.js), o sea que son
// inmutables: si cambia el contenido, cambia la URL. Por eso cache-first
// para ellos es seguro, y network-first para el HTML es obligatorio.
const APP_SHELL = 'app-shell-v1'
const APP_ASSETS = 'app-assets-v1'
const HASHED_ASSET_RE = /\/assets\/[^/]+-[A-Za-z0-9_-]{6,}\.(js|css)$/
const SHELL_URLS = [
  './mant.html',
  'https://telegram.org/js/telegram-web-app.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage-compat.js',
  // PDF.js (visor cross-platform) — opcional, si falla bg cache no rompe nada
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
]

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE)
    // addAll falla si UNA URL falla. Cargamos individuales con tolerancia.
    await Promise.allSettled(SHELL_URLS.map(async url => {
      try {
        const resp = await fetch(url, { mode: url.startsWith('http') ? 'cors' : 'same-origin' })
        if (resp.ok) await cache.put(url, resp.clone())
      } catch (e){ console.warn('[sw] shell precache miss', url, e?.message) }
    }))
    // El index.html de la app principal: sin esto la PWA no abre sin red.
    try {
      const appCache = await caches.open(APP_SHELL)
      const resp = await fetch('./index.html', { cache: 'reload' })
      if (resp.ok) await appCache.put('./index.html', resp.clone())
    } catch (e) { console.warn('[sw] app shell precache miss', e?.message) }
    console.log('[sw] shell precached')
  })())
  self.skipWaiting()  // activar nuevo SW sin esperar a que se cierren clientes
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpiar caches viejas del shell (mantener CACHE_NAME para FCM)
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k.startsWith('mant-shell-') && k !== SHELL_CACHE).map(k => caches.delete(k)))
    await Promise.all(keys.filter(k => k.startsWith('app-shell-') && k !== APP_SHELL).map(k => caches.delete(k)))
    await Promise.all(keys.filter(k => k.startsWith('app-assets-') && k !== APP_ASSETS).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

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

// Cache heavy assets + app shell for offline use
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)

  // ── App Shell del bot: mant.html + dependencias críticas ──
  // Estrategia stale-while-revalidate: devuelve cache (instant offline),
  // refresca en background cuando hay red.
  const isMantHtml = url.pathname.endsWith('/mant.html')
  const isShellAsset = (
    url.hostname === 'telegram.org' && url.pathname.includes('telegram-web-app.js')
  ) || (
    url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/10.12.0/')
  ) || (
    url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/pdf.js/')
  )

  if (isMantHtml || isShellAsset){
    event.respondWith((async () => {
      const cache = await caches.open(SHELL_CACHE)
      const cached = await cache.match(request, { ignoreSearch: isMantHtml })
      const networkPromise = fetch(request).then(res => {
        if (res && res.ok) cache.put(request, res.clone())
        return res
      }).catch(() => null)
      // SWR: si tenemos cache, devolverla ya. Si no, esperar la red.
      if (cached){
        event.waitUntil(networkPromise)
        return cached
      }
      const fresh = await networkPromise
      if (fresh) return fresh
      // Sin red ni cache: error 503 explicito
      return new Response('Offline y sin cache', { status: 503, statusText: 'offline-no-cache' })
    })())
    return
  }

  // ── Navegación de la app principal: network-first ──
  // Con red siempre gana la red (el HTML nunca queda viejo). Sin red se
  // devuelve el index.html cacheado y el router resuelve la ruta en el
  // cliente, así cualquier vista ya visitada abre igual.
  if (request.mode === 'navigate' && url.origin === self.location.origin && !url.pathname.endsWith('/mant.html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request)
        if (fresh && fresh.ok) {
          const cache = await caches.open(APP_SHELL)
          cache.put('./index.html', fresh.clone())
        }
        return fresh
      } catch {
        const cache = await caches.open(APP_SHELL)
        const cached = await cache.match('./index.html')
        if (cached) return cached
        return new Response('Sin conexión y sin copia local todavía.', {
          status: 503, statusText: 'offline-no-shell',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      }
    })())
    return
  }

  // ── Chunks JS/CSS con hash: cache-first (inmutables por nombre) ──
  if (url.origin === self.location.origin && HASHED_ASSET_RE.test(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(APP_ASSETS)
      const cached = await cache.match(request)
      if (cached) return cached
      const res = await fetch(request)
      if (res && res.ok) cache.put(request, res.clone())
      return res
    })())
    return
  }

  // ── Heavy assets (modelos, imágenes) ──
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
