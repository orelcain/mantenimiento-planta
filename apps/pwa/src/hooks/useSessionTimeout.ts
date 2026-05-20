import { useEffect } from 'react'
import { useAuthStore, INACTIVITY_TIMEOUT_MS } from '@/store/authStore'
import { signOut } from '@/services/auth'
import { logger } from '@/lib/logger'

/**
 * Cierra sesión automáticamente si `lastActivity` excede el timeout.
 *
 * Sin esto, la verificación solo ocurría al rehidratar el store (reload de
 * página). Una pestaña abierta durante días seguía autenticada aunque el
 * timestamp dijera lo contrario.
 *
 * Listeners de actividad:
 *  - `mousedown`, `keydown`, `touchstart`, `scroll` actualizan `lastActivity`.
 *  - Throttle: máximo 1 update por minuto para evitar churn en zustand.
 *  - Visibility change (volver a la pestaña): re-checkear timeout.
 *
 * Verificación periódica: cada 60s comprueba si Date.now() - lastActivity
 * > INACTIVITY_TIMEOUT_MS. Si sí, llama a signOut() de Firebase Auth.
 *
 * Montar una sola vez (en App.tsx). No hace nada si no hay user.
 */
export function useSessionTimeout() {
  const user = useAuthStore((s) => s.user)
  const refreshActivity = useAuthStore((s) => s.refreshActivity)
  const logout = useAuthStore((s) => s.logout)

  useEffect(() => {
    if (!user) return

    // Listeners de actividad (throttled a 1/min).
    let lastRefresh = Date.now()
    const handleActivity = () => {
      const now = Date.now()
      if (now - lastRefresh > 60_000) {
        lastRefresh = now
        refreshActivity()
      }
    }
    const events: Array<keyof WindowEventMap> = ['mousedown', 'keydown', 'touchstart', 'scroll']
    events.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }))

    // Verificación periódica del timeout.
    const checkTimeout = async () => {
      const lastActivity = useAuthStore.getState().lastActivity
      if (lastActivity === null) return
      if (Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS) {
        logger.info('Session expired by inactivity — forcing logout', {
          inactiveMs: Date.now() - lastActivity,
        })
        try { await signOut() } catch { /* ignore */ }
        logout()
      }
    }
    const interval = setInterval(checkTimeout, 60_000)

    // Revisar al volver a la pestaña (puede que se haya dormido).
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void checkTimeout()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, handleActivity))
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [user, refreshActivity, logout])
}
