import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types'

/**
 * Inactividad antes de forzar re-login.
 * 12h cubre un turno extendido (turnos típicos son 8h). Antes era 24h, pero
 * en un PC compartido del piso de planta esa ventana es suficientemente larga
 * para que alguien entre con la sesión de otro técnico. 12h obliga al primer
 * login del día.
 */
export const INACTIVITY_TIMEOUT_MS = 12 * 60 * 60 * 1000

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
