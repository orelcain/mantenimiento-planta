/* eslint-disable react-refresh/only-export-components */
/**
 * Hook de permisos - Sistema de control de acceso dinámico
 * 
 * NUEVO: Los permisos se cargan desde Firestore y pueden ser
 * personalizados por el admin para cada rol o usuario individual.
 * 
 * Mantiene compatibilidad con la API anterior (canCreateIncident, etc.)
 * pero ahora usa el permissionsStore dinámico.
 */

import { useAuthStore, usePermissionsStore } from '@/store'
import type { UserRole } from '@/types'
import type { AppModule, ModuleAction } from '@/types/permissions'

export interface Permissions {
  // Roles básicos
  isAdmin: boolean
  isSupervisor: boolean
  isTechnician: boolean
  isUser: boolean
  
  // Permisos de incidencias
  canCreateIncident: boolean
  canEditIncident: boolean
  canDeleteIncident: boolean
  canValidateIncident: boolean
  canAssignIncident: boolean
  canCloseIncident: boolean
  canRejectIncident: boolean
  
  // Permisos de equipos
  canCreateEquipment: boolean
  canEditEquipment: boolean
  canDeleteEquipment: boolean
  
  // Permisos de zonas
  canCreateZone: boolean
  canEditZone: boolean
  canDeleteZone: boolean
  
  // Permisos de tareas preventivas
  canCreatePreventiveTask: boolean
  canExecutePreventiveTask: boolean
  canDeletePreventiveTask: boolean
  
  // Permisos de usuarios
  canManageUsers: boolean
  canChangeUserRole: boolean
  canDeactivateUser: boolean
  
  // Permisos de sistema
  canAccessSettings: boolean
  canManageHierarchy: boolean
  canUploadMaps: boolean
  canCreateInviteCodes: boolean
  
  // Permisos de módulos (nuevo sistema dinámico)
  canSeeModule: (modulo: AppModule) => boolean
  canDoAction: (modulo: AppModule, accion: ModuleAction) => boolean
  
  // Helper functions
  canEditOwnIncident: (incidentReporterId: string) => boolean
  canWorkOnIncident: (assignedUserId?: string) => boolean
}

export function usePermissions(): Permissions {
  const user = useAuthStore((state) => state.user)
  const { can, canSee } = usePermissionsStore()
  
  const rol = user?.rol as UserRole | undefined
  const userId = user?.id
  
  const isAdmin = rol === 'admin'
  const isSupervisor = rol === 'supervisor'
  const isTechnician = rol === 'tecnico'
  const isUser = rol === 'usuario'
  
  // Mapeo del nuevo sistema dinámico a la API legacy
  const permissions: Permissions = {
    // Roles básicos
    isAdmin,
    isSupervisor,
    isTechnician,
    isUser,
    
    // Permisos de incidencias (usando nuevo sistema)
    canCreateIncident: can('incidencias', 'crear'),
    canEditIncident: can('incidencias', 'editar'),
    canDeleteIncident: can('incidencias', 'eliminar'),
    canValidateIncident: can('incidencias', 'validar'),
    canAssignIncident: can('incidencias', 'asignar'),
    canCloseIncident: can('incidencias', 'cerrar'),
    canRejectIncident: can('incidencias', 'validar'), // Rechazar usa mismo permiso que validar
    
    // Permisos de equipos
    canCreateEquipment: can('equipos', 'crear'),
    canEditEquipment: can('equipos', 'editar'),
    canDeleteEquipment: can('equipos', 'eliminar'),
    
    // Permisos de zonas
    canCreateZone: can('zonas', 'crear'),
    canEditZone: can('zonas', 'editar'),
    canDeleteZone: can('zonas', 'eliminar'),
    
    // Permisos de tareas preventivas
    canCreatePreventiveTask: can('preventivo', 'crear'),
    canExecutePreventiveTask: can('preventivo', 'ejecutar'),
    canDeletePreventiveTask: can('preventivo', 'eliminar'),
    
    // Permisos de usuarios
    canManageUsers: can('usuarios', 'ver'),
    canChangeUserRole: can('usuarios', 'editar'),
    canDeactivateUser: can('usuarios', 'eliminar'),
    
    // Permisos de sistema
    canAccessSettings: canSee('configuracion'),
    canManageHierarchy: can('jerarquia', 'editar'),
    canUploadMaps: can('mapa', 'configurar'),
    canCreateInviteCodes: can('usuarios', 'crear'),
    
    // Nuevo sistema dinámico de módulos
    canSeeModule: (modulo: AppModule) => canSee(modulo),
    canDoAction: (modulo: AppModule, accion: ModuleAction) => can(modulo, accion),
    
    // Helper functions
    canEditOwnIncident: (incidentReporterId: string) => {
      if (can('incidencias', 'editar')) return true
      return userId === incidentReporterId
    },
    
    canWorkOnIncident: (assignedUserId?: string) => {
      if (isAdmin || isSupervisor) return true
      if (isTechnician && assignedUserId === userId) return true
      return false
    },
  }
  
  return permissions
}

/**
 * Hook para verificar si el usuario tiene un permiso específico
 */
export function useHasPermission(permissionKey: keyof Omit<Permissions, 'canEditOwnIncident' | 'canWorkOnIncident' | 'canSeeModule' | 'canDoAction'>): boolean {
  const permissions = usePermissions()
  return permissions[permissionKey]
}

/**
 * Hook para verificar acceso a un módulo específico
 */
export function useCanAccessModule(modulo: AppModule): boolean {
  const { canSee } = usePermissionsStore()
  return canSee(modulo)
}

/**
 * Hook para verificar una acción en un módulo
 */
export function useCanDoModuleAction(modulo: AppModule, accion: ModuleAction): boolean {
  const { can } = usePermissionsStore()
  return can(modulo, accion)
}

/**
 * Componente HOC para proteger rutas o elementos según permisos
 */
export function WithPermission({
  permission,
  fallback,
  children,
}: {
  permission: keyof Omit<Permissions, 'canEditOwnIncident' | 'canWorkOnIncident' | 'canSeeModule' | 'canDoAction'>
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const hasPermission = useHasPermission(permission)
  
  if (!hasPermission) {
    return fallback ? <>{fallback}</> : null
  }
  
  return <>{children}</>
}

/**
 * Componente para proteger según módulo visible
 */
export function WithModuleAccess({
  modulo,
  fallback,
  children,
}: {
  modulo: AppModule
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const canAccess = useCanAccessModule(modulo)
  
  if (!canAccess) {
    return fallback ? <>{fallback}</> : null
  }
  
  return <>{children}</>
}
