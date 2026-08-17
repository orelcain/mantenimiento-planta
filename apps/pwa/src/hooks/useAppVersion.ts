/**
 * Hook para detectar actualizaciones de la aplicación
 * Verifica periódicamente si hay una nueva versión disponible
 */

import { useState, useEffect } from 'react'
import { APP_VERSION } from '@/constants/version'
import { BUILD_SHA } from '@/constants/buildInfo'
import { logger } from '@/lib/logger'
import { getAssetUrl } from '@/lib/config'

const VERSION_CHECK_INTERVAL = 60000 // 1 minuto
const LAST_VERSION_KEY = 'app_last_version'

/** Retorna true solo si serverVer es MAYOR que currentVer (comparación semver simple) */
function isNewerVersion(serverVer: string, currentVer: string): boolean {
  const parse = (v: string) => v.split('.').map(Number)
  const [sM = 0, sm = 0, sp = 0] = parse(serverVer)
  const [cM = 0, cm = 0, cp = 0] = parse(currentVer)
  if (sM !== cM) return sM > cM
  if (sm !== cm) return sm > cm
  return sp > cp
}

/**
 * ¿Hay que avisar de una versión nueva? Dos señales, no una:
 *
 * 1. **semver mayor** → release marcado a mano.
 * 2. **`buildSha` distinto** → hay OTRO build desplegado aunque nadie haya
 *    tocado el semver.
 *
 * La segunda es la que faltaba. Entre el 23/07 y el 04/08/2026 la versión quedó
 * fija en 3.99.6 con 39 mejoras ya en producción: la condición (1) no se cumplió
 * nunca, así que el aviso jamás salió y la gente siguió con el bundle viejo.
 *
 * `currentSha === 'dev'` (build local sin git) desactiva la señal (2) para no
 * avisar de una "actualización" en cada `pnpm dev`.
 *
 * Pura y exportada a propósito: es la regla que decide si el usuario ve el
 * banner, y se testea sin montar el hook.
 */
export function shouldNotifyUpdate(
  server: { version?: string; buildSha?: string },
  current: { version: string; buildSha: string },
): { update: boolean; reason: 'semver' | 'buildSha' | null } {
  if (server.version && isNewerVersion(server.version, current.version)) {
    return { update: true, reason: 'semver' }
  }
  if (server.buildSha && current.buildSha !== 'dev' && server.buildSha !== current.buildSha) {
    return { update: true, reason: 'buildSha' }
  }
  return { update: false, reason: null }
}

export function useAppVersion() {
  const [hasUpdate, setHasUpdate] = useState(false)
  const [newVersion, setNewVersion] = useState<string | null>(null)
  /* Cuándo se publicó lo nuevo: el banner habla de HORAS, no de semver — el
     número de versión no le dice nada a quien está en planta. */
  const [newBuildTime, setNewBuildTime] = useState<number | null>(null)

  useEffect(() => {
    const checkVersion = async () => {
      try {
        // Usar getAssetUrl para obtener la ruta correcta con BASE_URL
        // Añadir timestamp para evitar caché, usando parámetro 'v'
        const versionUrl = getAssetUrl(`/version.json?v=${Date.now()}`)
        
        // Verificación de URL válida antes del fetch
        if (!versionUrl || versionUrl.includes('undefined')) {
          logger.warn('Invalid version URL')
          return
        }

        const response = await fetch(versionUrl, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          },
        })
        
        if (response.ok) {
          // Verificar contentType para asegurar que es JSON y no HTML (404 page)
          const contentType = response.headers.get('content-type')
          if (!contentType || !contentType.includes('application/json')) {
            // logger.debug('Version check returned non-JSON (likely 404/HTML)', { contentType })
            return
          }

          const data = await response.json()
          const serverVersion = data.version
          const serverSha: string | undefined = data.buildSha

          const { update, reason } = shouldNotifyUpdate(
            { version: serverVersion, buildSha: serverSha },
            { version: APP_VERSION, buildSha: BUILD_SHA },
          )

          if (update) {
            logger.info('New app version detected', {
              current: APP_VERSION,
              currentSha: BUILD_SHA,
              new: serverVersion,
              newSha: serverSha ?? null,
              reason,
            })
            setNewVersion(serverVersion)
            const ts = typeof data.buildTimestamp === 'number'
              ? data.buildTimestamp
              : Date.parse(data.buildDate ?? '')
            setNewBuildTime(Number.isNaN(ts) ? null : ts)
            setHasUpdate(true)
          } else {
            // Mismo build y mismo (o menor) semver → sin banner
            setHasUpdate(false)
            setNewVersion(null)
            setNewBuildTime(null)
          }
        }
      } catch (_error) {
        // Silently fail si no hay conexión o el archivo no existe aún
        // logger.debug('Error checking version')
      }
    }

    // Verificar versión guardada al iniciar
    const lastVersion = localStorage.getItem(LAST_VERSION_KEY)
    if (lastVersion && lastVersion !== APP_VERSION) {
      logger.info('App was updated', { from: lastVersion, to: APP_VERSION })
      
      // Limpiar storage del navegador para forzar recarga de datos
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => caches.delete(name))
        })
      }
      
      // Limpiar session storage pero mantener user auth
      const authData = sessionStorage.getItem('auth-storage')
      sessionStorage.clear()
      if (authData) {
        sessionStorage.setItem('auth-storage', authData)
      }
    }
    
    // Guardar versión actual
    localStorage.setItem(LAST_VERSION_KEY, APP_VERSION)

    // Verificar periódicamente si hay actualizaciones
    checkVersion()
    const interval = setInterval(checkVersion, VERSION_CHECK_INTERVAL)

    return () => clearInterval(interval)
  }, [])

  const reload = async () => {
    // Guardar la nueva versión antes de recargar
    if (newVersion) {
      localStorage.setItem(LAST_VERSION_KEY, newVersion)
    }

    // 1) Intentar activar el Service Worker nuevo (si está esperando)
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        const controllerChanged = new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true })
        })

        for (const reg of registrations) {
          try {
            await reg.update()
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' })
            }
          } catch {
            // ignore
          }
        }

        // Esperar un poco a que el SW tome control (si aplica)
        await Promise.race([controllerChanged, new Promise((r) => setTimeout(r, 2000))])
      } catch {
        // ignore
      }
    }

    // 2) Limpiar caches (Workbox/HTTP caches)
    if ('caches' in window) {
      try {
        const names = await caches.keys()
        await Promise.all(names.map((name) => caches.delete(name)))
      } catch {
        // ignore
      }
    }

    // 3) Fallback fuerte: desregistrar SW EXCEPTO firebase-messaging-sw.js (needed for notifications)
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(
          registrations
            .filter(r => {
              const scriptUrl = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || ''
              return !scriptUrl.includes('firebase-messaging-sw.js')
            })
            .map((r) => r.unregister())
        )
      } catch {
        // ignore
      }
    }

    // 4) Recargar con cache-buster hacia la ruta base.
    // En GitHub Pages, recargar en rutas profundas puede servir 404.html y “pegar” la app.
    const baseUrl = `${window.location.origin}${getAssetUrl('/')}`
    const url = new URL(baseUrl)
    url.searchParams.set('r', String(Date.now()))
    window.location.replace(url.toString())
  }

  return {
    hasUpdate,
    newVersion,
    newBuildTime,
    currentVersion: APP_VERSION,
    reload,
  }
}
