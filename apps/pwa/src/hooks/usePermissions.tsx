/**
 * Hook de permisos - Sistema de control de acceso basado en roles
 * 
 * Roles:
 * - admin: Acceso total al sistema
 * - supervisor: Gestión de incidencias, equipos, validación
 * - tecnico: Trabajar incidencias asignadas, ejecutar tareas
 * - usuario: Reportar incidencias solamente (no implementado aún)
 */

import { useAuthStore } from '@/store'
import type { UserRole } from '@/types'

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
  
  // Helper functions
  canEditOwnIncident: (incidentReporterId: string) => boolean
  canWorkOnIncident: (assignedUserId?: string) => boolean
}

export function usePermissions(): Permissions {
  const user = useAuthStore((state) => state.user)
  const rol = user?.rol as UserRole | undefined
  const userId = user?.id
  
  const isAdmin = rol === 'admin'
  const isSupervisor = rol === 'supervisor'
  const isTechnician = rol === 'tecnico'
  const isUser = !rol || rol === 'usuario' as any // Por si agregamos rol 'usuario' en futuro
  
  const permissions: Permissions = {
    // Roles básicos
    isAdmin,
    isSupervisor,
    isTechnician,
    isUser,
    
    // Permisos de incidencias
    canCreateIncident: true, // Todos pueden reportar
    canEditIncident: isAdmin || isSupervisor, // Admin/Supervisor editan cualquiera
    canDeleteIncident: isAdmin,
    canValidateIncident: isAdmin || isSupervisor, // Solo supervisores validan
    canAssignIncident: isAdmin || isSupervisor, // Solo supervisores asignan
    canCloseIncident: isAdmin || isSupervisor || isTechnician, // Técnicos cierran las asignadas
    canRejectIncident: isAdmin || isSupervisor,
    
    // Permisos de equipos
    canCreateEquipment: isAdmin || isSupervisor,
    canEditEquipment: isAdmin || isSupervisor || isTechnician,
    canDeleteEquipment: isAdmin,
    
    // Permisos de zonas
    canCreateZone: isAdmin,
    canEditZone: isAdmin,
    canDeleteZone: isAdmin,
    
    // Permisos de tareas preventivas
    canCreatePreventiveTask: isAdmin || isSupervisor,
    canExecutePreventiveTask: isAdmin || isSupervisor || isTechnician,
    canDeletePreventiveTask: isAdmin,
    
    // Permisos de usuarios
    canManageUsers: isAdmin,
    canChangeUserRole: isAdmin,
    canDeactivateUser: isAdmin,
    
    // Permisos de sistema
    canAccessSettings: isAdmin,
    canManageHierarchy: isAdmin,
    canUploadMaps: isAdmin,
    canCreateInviteCodes: isAdmin,
    
    // Helper functions
    canEditOwnIncident: (incidentReporterId: string) => {
      return userId === incidentReporterId || isAdmin || isSupervisor
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
 * @param permissionKey - Key del permiso a verificar
 * @returns true si tiene el permiso
 */
export function useHasPermission(permissionKey: keyof Omit<Permissions, 'canEditOwnIncident' | 'canWorkOnIncident'>): boolean {
  const permissions = usePermissions()
  return permissions[permissionKey]
}

/**
 * Componente HOC para proteger rutas o elementos según permisos
 */
export function WithPermission({
  permission,
  fallback,
  children,
}: {
  permission: keyof Omit<Permissions, 'canEditOwnIncident' | 'canWorkOnIncident'>
  fallback?: React.ReactNode
  children: React.ReactNode
}) {
  const hasPermission = useHasPermission(permission)
  
  if (!hasPermission) {
    return fallback ? <>{fallback}</> : null
  }
  
  return <>{children}</>
}
