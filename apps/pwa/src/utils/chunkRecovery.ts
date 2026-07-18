/**
 * Recuperación ante errores de carga de chunks tras un deploy.
 *
 * GitHub Pages sirve index.html con `Cache-Control: max-age=600` y los chunks
 * con hash viejo desaparecen cuando entra un deploy: los usuarios con la app
 * abierta ven "Failed to fetch dynamically imported module" al navegar.
 *
 * Estrategia escalonada (máx 2 intentos automáticos por ventana de 5 min,
 * contador compartido entre lazyWithReload y ErrorBoundary):
 *  - Intento 1: reload simple (el navegador revalida el documento).
 *  - Intento 2: limpiar CacheStorage + desregistrar SWs no esenciales y
 *    navegar a la base con cache-buster (?r=ts) para saltar el index cacheado.
 * Agotados los intentos, el ErrorBoundary muestra su pantalla de error.
 */
import { logger } from '@/lib/logger'
import { getAssetUrl } from '@/lib/config'

const STORAGE_KEY = 'chunk-recovery-attempts'
const MAX_AUTO_ATTEMPTS = 2
const ATTEMPT_WINDOW_MS = 5 * 60 * 1000
const SECOND_ATTEMPT_DELAY_MS = 1500

interface AttemptState {
  count: number
  firstTs: number
}

const EMPTY_STATE: AttemptState = { count: 0, firstTs: 0 }

// Si varios chunks fallan en el mismo render (imports concurrentes), solo el
// primero consume un intento; los demás se cuelgan de la recarga ya iniciada
let recoveryInFlight = false

function readAttempts(): AttemptState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as AttemptState
    if (typeof parsed?.count !== 'number' || typeof parsed?.firstTs !== 'number') {
      return EMPTY_STATE
    }
    // Ventana expirada → contador limpio (un flag viejo no debe bloquear
    // la recuperación de un deploy futuro en la misma pestaña)
    if (Date.now() - parsed.firstTs > ATTEMPT_WINDOW_MS) return EMPTY_STATE
    return parsed
  } catch {
    return EMPTY_STATE
  }
}

/** True si el error corresponde a un chunk que ya no existe en el servidor (deploy nuevo). */
export function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return (
    msg.includes('Failed to fetch dynamically imported module') || // Chrome/Edge
    msg.includes('error loading dynamically imported module') || // Firefox
    msg.includes('Importing a module script failed') || // Safari
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  )
}

/** True si quedan reintentos automáticos disponibles (no consume el contador). */
export function canAutoRecover(): boolean {
  if (recoveryInFlight) return true
  return navigator.onLine !== false && readAttempts().count < MAX_AUTO_ATTEMPTS
}

/** Limpia CacheStorage y desregistra service workers. */
export async function clearCachesAndServiceWorkers(
  { keepMessagingSw = true }: { keepMessagingSw?: boolean } = {}
): Promise<void> {
  if ('caches' in window) {
    try {
      const names = await caches.keys()
      await Promise.all(names.map((name) => caches.delete(name)))
    } catch {
      // ignore
    }
  }
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(
        registrations
          .filter((reg) => {
            if (!keepMessagingSw) return true
            const scriptUrl =
              reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || ''
            // El SW de FCM se re-registra en main.tsx; mantenerlo evita perder push tokens
            return !scriptUrl.includes('firebase-messaging-sw.js')
          })
          .map((reg) => reg.unregister())
      )
    } catch {
      // ignore
    }
  }
}

function buildCacheBustedBaseUrl(): string {
  // A la RUTA BASE, no a la ruta actual: en GitHub Pages recargar rutas
  // profundas puede servir 404.html cacheado y "pegar" la app (ver useAppVersion)
  const url = new URL(`${window.location.origin}${getAssetUrl('/')}`)
  url.searchParams.set('r', String(Date.now()))
  return url.toString()
}

/**
 * Intenta recuperarse de un chunk viejo recargando la página.
 * Devuelve true si inició una recarga (el caller debe quedarse en un estado
 * de "cargando"), false si no corresponde reintentar (offline, sin storage
 * para el anti-bucle, o intentos agotados → mostrar pantalla de error).
 */
export function recoverFromChunkError(): boolean {
  if (recoveryInFlight) return true
  if (navigator.onLine === false) return false

  const state = readAttempts()
  if (state.count >= MAX_AUTO_ATTEMPTS) return false

  const next: AttemptState = {
    count: state.count + 1,
    firstTs: state.count === 0 ? Date.now() : state.firstTs,
  }
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Sin sessionStorage no hay protección anti-bucle → no auto-recargar
    return false
  }
  recoveryInFlight = true

  if (next.count === 1) {
    logger.info('Chunk viejo tras deploy: recargando página (intento 1/2)')
    window.location.reload()
  } else {
    logger.info('Chunk viejo tras deploy: limpiando caches y recargando con cache-buster (intento 2/2)')
    // Espaciar el segundo intento para dar aire al CDN y evitar un ciclo inmediato
    window.setTimeout(() => {
      void clearCachesAndServiceWorkers().finally(() => {
        window.location.replace(buildCacheBustedBaseUrl())
      })
    }, SECOND_ATTEMPT_DELAY_MS)
  }
  return true
}

/**
 * Reset duro para el botón "Borrar datos locales y reiniciar" del ErrorBoundary:
 * borra storages, CacheStorage y TODOS los service workers (el de FCM se
 * re-registra solo en main.tsx), y navega a la base con cache-buster.
 */
export async function hardResetApp(): Promise<void> {
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }
  try {
    localStorage.clear()
  } catch {
    // ignore
  }
  await clearCachesAndServiceWorkers({ keepMessagingSw: false })
  window.location.replace(buildCacheBustedBaseUrl())
}
