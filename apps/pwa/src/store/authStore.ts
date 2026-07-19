import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000 // 24 horas — un turno completo + margen

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  lastActivity: number | null
  setUser: (user: User | null) => void
  setLoading: (loading: boolean) => void
  logout: () => void
  refreshActivity: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isLoading: true,
      lastActivity: null,
      setUser: (user) =>
        set({
          user,
          isAuthenticated: !!user,
          isLoading: false,
          lastActivity: user ? Date.now() : null,
        }),
      setLoading: (isLoading) => set({ isLoading }),
      logout: () =>
        set({
          user: null,
          isAuthenticated: false,
          isLoading: false,
          lastActivity: null,
        }),
      refreshActivity: () => set({ lastActivity: Date.now() }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        lastActivity: state.lastActivity,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return
        if (
          state.isAuthenticated &&
          state.lastActivity !== null &&
          Date.now() - state.lastActivity > INACTIVITY_TIMEOUT_MS
        ) {
          // Sesión expirada por inactividad — limpiar antes de que la app cargue.
          // Firebase Auth detectará el mismatch y confirmará el logout via onAuthChange.
          state.user = null
          state.isAuthenticated = false
          state.lastActivity = null
        }
      },
    }
  )
)

/**
 * Watchdog de sesión — cierra dos agujeros del timeout de inactividad:
 *
 *  1. La expiración solo se evaluaba en onRehydrateStorage (al recargar la
 *     app): una pestaña abierta sin recargar = sesión eterna. Ahora se
 *     re-evalúa cada minuto y al volver a la pestaña (visibilitychange).
 *  2. `refreshActivity` no lo llamaba nadie: `lastActivity` quedaba clavado
 *     en el momento del login, así que "24h de inactividad" era en realidad
 *     "24h desde el login" aunque el usuario estuviera usando la app en
 *     pleno turno. Ahora la interacción real (tap/tecla) refresca la marca,
 *     con throttle de 1 min para no spamear el storage.
 *
 * Llamar UNA vez al montar la app. Devuelve cleanup.
 */
export function startSessionWatchdog(): () => void {
  const expireIfInactive = () => {
    const { isAuthenticated, lastActivity, logout } = useAuthStore.getState()
    if (
      isAuthenticated &&
      lastActivity !== null &&
      Date.now() - lastActivity > INACTIVITY_TIMEOUT_MS
    ) {
      // Mismo semántica que el check de onRehydrateStorage: limpiar el estado
      // local; Firebase Auth confirma vía onAuthChange en la próxima carga.
      logout()
    }
  }

  let lastRefresh = 0
  const onActivity = () => {
    const now = Date.now()
    if (now - lastRefresh < 60_000) return // throttle 1/min
    const { isAuthenticated, refreshActivity } = useAuthStore.getState()
    if (isAuthenticated) {
      lastRefresh = now
      refreshActivity()
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'visible') expireIfInactive()
  }

  const intervalId = setInterval(expireIfInactive, 60_000)
  window.addEventListener('pointerdown', onActivity, { passive: true })
  window.addEventListener('keydown', onActivity, { passive: true })
  document.addEventListener('visibilitychange', onVisibility)

  return () => {
    clearInterval(intervalId)
    window.removeEventListener('pointerdown', onActivity)
    window.removeEventListener('keydown', onActivity)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

// Helpers para verificar roles
export function useIsAdmin() {
  const user = useAuthStore((state) => state.user)
  return user?.rol === 'admin'
}

export function useIsSupervisor() {
  const user = useAuthStore((state) => state.user)
  return user?.rol === 'supervisor' || user?.rol === 'admin'
}

export function useIsTechnician() {
  const user = useAuthStore((state) => state.user)
  return user?.rol === 'tecnico'
}

export function useCanValidateIncidents() {
  const user = useAuthStore((state) => state.user)
  return user?.rol === 'supervisor' || user?.rol === 'admin'
}
