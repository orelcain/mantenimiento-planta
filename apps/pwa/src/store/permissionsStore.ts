/**
 * Store de Permisos - Zustand
 * 
 * Gestiona el estado de permisos del usuario actual con:
 * - Carga inicial desde Firestore
 * - Listener en tiempo real para cambios
 * - Cache local para funcionamiento offline
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Unsubscribe } from 'firebase/firestore'
import type {
  PermissionsMap,
  AppModule,
  ModuleAction,
} from '@/types/permissions'
import { hasPermission, isModuleVisible, DEFAULT_ROLE_PERMISSIONS } from '@/types/permissions'
import {
  resolveUserPermissions,
  subscribeToUserPermissions,
} from '@/services/permissions'
import { logger } from '@/lib/logger'
import type { User } from '@/types'

// ============================================================================
// TIPOS DEL STORE
// ============================================================================

interface PermissionsState {
  // Estado
  permisos: PermissionsMap
  isLoading: boolean
  isLoaded: boolean
  error: string | null
  tieneOverride: boolean
  userId: string | null
  userRol: string | null
  cargadoDesde: 'firestore' | 'cache' | 'default' | null
  
  // Acciones
  loadPermissions: (user: User) => Promise<void>
  clearPermissions: () => void
  
  // Helpers para verificar permisos
  can: (modulo: AppModule, accion: ModuleAction) => boolean
  canSee: (modulo: AppModule) => boolean
  
  // Internal
  _unsubscribe: Unsubscribe | null
  _setUnsubscribe: (unsub: Unsubscribe | null) => void
}

// ============================================================================
// STORE
// ============================================================================

export const usePermissionsStore = create<PermissionsState>()(
  persist(
    (set, get) => ({
      // Estado inicial
      permisos: {},
      isLoading: false,
      isLoaded: false,
      error: null,
      tieneOverride: false,
      userId: null,
      userRol: null,
      cargadoDesde: null,
      _unsubscribe: null,
      
      // Cargar permisos del usuario
      loadPermissions: async (user: User) => {
        const state = get()
        if (state.isLoading) return

        // Si ya está cargado para este usuario, solo asegurar listener activo
        if (state.userId === user.id && state.isLoaded) {
          // Restablecer listener si no existe (ej: después de page refresh)
          if (!state._unsubscribe) {
            const unsubscribe = subscribeToUserPermissions(
              user.id,
              user.rol,
              (updated) => {
                set({
                  permisos: updated.permisos,
                  tieneOverride: updated.tieneOverride,
                  cargadoDesde: updated.cargadoDesde,
                })
                logger.info('Permisos actualizados en tiempo real', {
                  userId: user.id,
                  tieneOverride: updated.tieneOverride,
                })
              }
            )
            set({ _unsubscribe: unsubscribe })
          }
          return
        }
        
        // Limpiar listener anterior
        if (state._unsubscribe) {
          state._unsubscribe()
        }
        
        set({ isLoading: true, error: null })
        
        try {
          // Cargar permisos iniciales
          const resolved = await resolveUserPermissions(user)
          
          set({
            permisos: resolved.permisos,
            tieneOverride: resolved.tieneOverride,
            userId: user.id,
            userRol: user.rol,
            cargadoDesde: resolved.cargadoDesde,
            isLoading: false,
            isLoaded: true,
          })
          
          logger.info('Permisos cargados', {
            userId: user.id,
            rol: user.rol,
            tieneOverride: resolved.tieneOverride,
            desde: resolved.cargadoDesde,
          })
          
          // Suscribirse a cambios en tiempo real
          const unsubscribe = subscribeToUserPermissions(
            user.id,
            user.rol,
            (updated) => {
              set({
                permisos: updated.permisos,
                tieneOverride: updated.tieneOverride,
                cargadoDesde: updated.cargadoDesde,
              })
              logger.info('Permisos actualizados en tiempo real', {
                userId: user.id,
                tieneOverride: updated.tieneOverride,
              })
            }
          )
          
          set({ _unsubscribe: unsubscribe })
          
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          logger.error('Error cargando permisos', new Error(message))
          
          // Usar permisos por defecto del rol
          const defaultPerms = DEFAULT_ROLE_PERMISSIONS[user.rol] || DEFAULT_ROLE_PERMISSIONS['usuario']
          
          set({
            permisos: defaultPerms,
            tieneOverride: false,
            userId: user.id,
            userRol: user.rol,
            cargadoDesde: 'default',
            isLoading: false,
            isLoaded: true,
            error: message,
          })
        }
      },
      
      // Limpiar permisos (logout)
      clearPermissions: () => {
        const state = get()
        if (state._unsubscribe) {
          state._unsubscribe()
        }
        
        set({
          permisos: {},
          isLoading: false,
          isLoaded: false,
          error: null,
          tieneOverride: false,
          userId: null,
          userRol: null,
          cargadoDesde: null,
          _unsubscribe: null,
        })
        
        logger.info('Permisos limpiados')
      },
      
      // Verificar si puede realizar una acción en un módulo
      can: (modulo: AppModule, accion: ModuleAction): boolean => {
        const { permisos, userRol } = get()
        
        // Admin siempre puede todo — excepto ARIA (requiere habilitación explícita)
        if (userRol === 'admin' && modulo !== 'aria') return true

        const fallback = userRol
          ? (DEFAULT_ROLE_PERMISSIONS[userRol] || DEFAULT_ROLE_PERMISSIONS['usuario'])
          : DEFAULT_ROLE_PERMISSIONS['usuario']
        const effective = permisos[modulo] ? permisos : { ...fallback, ...permisos }

        return hasPermission(effective, modulo, accion)
      },
      
      // Verificar si puede ver un módulo
      canSee: (modulo: AppModule): boolean => {
        const { permisos, userRol } = get()
        
        // Admin siempre puede ver todo — excepto ARIA (requiere habilitación explícita)
        if (userRol === 'admin' && modulo !== 'aria') return true

        const fallback = userRol
          ? (DEFAULT_ROLE_PERMISSIONS[userRol] || DEFAULT_ROLE_PERMISSIONS['usuario'])
          : DEFAULT_ROLE_PERMISSIONS['usuario']
        const effective = permisos[modulo] ? permisos : { ...fallback, ...permisos }

        return isModuleVisible(effective, modulo)
      },
      
      // Internal: setter para unsubscribe
      _setUnsubscribe: (unsub) => set({ _unsubscribe: unsub }),
    }),
    {
      name: 'permissions-storage',
      partialize: (state) => ({
        // Solo persistir datos, no funciones ni listeners
        permisos: state.permisos,
        userId: state.userId,
        userRol: state.userRol,
        tieneOverride: state.tieneOverride,
        isLoaded: state.isLoaded,
      }),
    }
  )
)

// ============================================================================
// HOOKS HELPER
// ============================================================================

/**
 * Hook para verificar un permiso específico
 */
export function useCan(modulo: AppModule, accion: ModuleAction): boolean {
  return usePermissionsStore((state) => state.can(modulo, accion))
}

/**
 * Hook para verificar si puede ver un módulo
 */
export function useCanSee(modulo: AppModule): boolean {
  return usePermissionsStore((state) => state.canSee(modulo))
}

/**
 * Hook para obtener todos los módulos visibles
 */
export function useVisibleModules(): AppModule[] {
  const permisos = usePermissionsStore((state) => state.permisos)
  const userRol = usePermissionsStore((state) => state.userRol)
  
  if (userRol === 'admin') {
    // Admin ve todos los módulos
    return Object.keys(permisos) as AppModule[]
  }
  
  return (Object.entries(permisos) as [AppModule, { visible: boolean }][])
    .filter(([, p]) => p?.visible)
    .map(([modulo]) => modulo)
}

/**
 * Hook para verificar si el usuario tiene override activo
 */
export function useHasPermissionsOverride(): boolean {
  return usePermissionsStore((state) => state.tieneOverride)
}
