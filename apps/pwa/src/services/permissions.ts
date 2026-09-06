/**
 * Servicio de Permisos - Gestión en Firestore
 * 
 * Estructura Firestore:
 * - /roles/{rolId} → Permisos por defecto de cada rol
 * - /users/{userId} → Campo permissionsOverride para overrides
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from '@/services/firestoreTracked'
import { db, auth } from './firebase'
import { logger } from '@/lib/logger'
import type {
  PermissionsMap,
  RolePermissions,
  UserPermissionsOverride,
  ResolvedPermissions,
} from '@/types/permissions'
import { mergePermissions, DEFAULT_ROLE_PERMISSIONS } from '@/types/permissions'
import type { User } from '@/types'

// Alias con tipo correcto para evitar errores de undefined
const DEFAULT_PERMS: Record<string, PermissionsMap> = DEFAULT_ROLE_PERMISSIONS as Record<string, PermissionsMap>

/** Safe accessor that always returns a valid PermissionsMap */
function getDefaultPerms(rolId: string): PermissionsMap {
  return DEFAULT_PERMS[rolId] ?? DEFAULT_PERMS['usuario']!
}

// ============================================================================
// PERMISOS POR ROL
// ============================================================================

/**
 * Obtiene los permisos de un rol desde Firestore
 * Si no existe, retorna los defaults
 */
export async function getRolePermissions(rolId: string): Promise<PermissionsMap> {
  try {
    const docRef = doc(db, 'roles', rolId)
    const docSnap = await getDoc(docRef)
    
    if (docSnap.exists()) {
      const data = docSnap.data() as RolePermissions
      logger.info('Permisos de rol cargados desde Firestore', { rolId })
      return data.permisos
    }
    
    // Retornar defaults si no existe en Firestore
    logger.info('Usando permisos default para rol', { rolId })
    return getDefaultPerms(rolId)
  } catch (error) {
    logger.error('Error obteniendo permisos de rol', error instanceof Error ? error : new Error(String(error)))
    return getDefaultPerms(rolId)
  }
}

/**
 * Guarda los permisos de un rol en Firestore
 */
export async function saveRolePermissions(
  rolId: string,
  permisos: PermissionsMap,
  updatedBy: string
): Promise<void> {
  try {
    const docRef = doc(db, 'roles', rolId)
    const roleData: RolePermissions = {
      id: rolId,
      nombre: getRoleName(rolId),
      descripcion: getRoleDescription(rolId),
      permisos,
      esDefault: ['admin', 'supervisor', 'tecnico', 'usuario'].includes(rolId),
      updatedAt: new Date(),
      updatedBy,
    }
    
    await setDoc(docRef, {
      ...roleData,
      updatedAt: serverTimestamp(),
    })
    
    logger.info('Permisos de rol guardados', { rolId, updatedBy })
  } catch (error) {
    logger.error('Error guardando permisos de rol', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Obtiene todos los roles con sus permisos
 */
export async function getAllRolePermissions(): Promise<RolePermissions[]> {
  try {
    const snapshot = await getDocs(collection(db, 'roles'))
    const roles: RolePermissions[] = []
    
    snapshot.forEach((doc) => {
      roles.push({ id: doc.id, ...doc.data() } as RolePermissions)
    })
    
    // Si no hay roles en Firestore, retornar estructura de defaults
    if (roles.length === 0) {
      return Object.entries(DEFAULT_PERMS).map(([id, permisos]) => ({
        id,
        nombre: getRoleName(id),
        descripcion: getRoleDescription(id),
        permisos,
        esDefault: true,
      }))
    }
    
    return roles
  } catch (error) {
    logger.error('Error obteniendo todos los roles', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

// ============================================================================
// OVERRIDE DE PERMISOS POR USUARIO
// ============================================================================

/**
 * Obtiene el override de permisos de un usuario
 */
export async function getUserPermissionsOverride(userId: string): Promise<UserPermissionsOverride | null> {
  try {
    const userDoc = await getDoc(doc(db, 'users', userId))
    
    if (!userDoc.exists()) {
      return null
    }
    
    const userData = userDoc.data()
    return userData.permissionsOverride || null
  } catch (error) {
    logger.error('Error obteniendo override de permisos', error instanceof Error ? error : new Error(String(error)))
    return null
  }
}

/**
 * Guarda el override de permisos para un usuario
 */
export async function saveUserPermissionsOverride(
  userId: string,
  override: UserPermissionsOverride,
  updatedBy: string
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId)
    
    await updateDoc(userRef, {
      permissionsOverride: {
        ...override,
        updatedAt: serverTimestamp(),
        updatedBy,
      },
      updatedAt: serverTimestamp(),
    })
    
    logger.info('Override de permisos guardado', { userId, updatedBy })
  } catch (error) {
    logger.error('Error guardando override de permisos', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

/**
 * Elimina el override de permisos de un usuario
 */
export async function clearUserPermissionsOverride(
  userId: string,
  updatedBy: string
): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId)
    
    await updateDoc(userRef, {
      permissionsOverride: null,
      updatedAt: serverTimestamp(),
    })
    
    logger.info('Override de permisos eliminado', { userId, updatedBy })
  } catch (error) {
    logger.error('Error eliminando override de permisos', error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

// ============================================================================
// RESOLUCIÓN DE PERMISOS (ROL + OVERRIDE)
// ============================================================================

/**
 * Resuelve los permisos finales de un usuario combinando rol + override
 */
export async function resolveUserPermissions(user: User): Promise<ResolvedPermissions> {
  try {
    // 1. Obtener permisos del rol
    const rolePerms = await getRolePermissions(user.rol)
    
    // 2. Obtener override si existe
    const override = await getUserPermissionsOverride(user.id)
    
    // 3. Combinar permisos
    const finalPerms = override?.activo 
      ? mergePermissions(rolePerms, override.permisos)
      : rolePerms
    
    return {
      userId: user.id,
      rol: user.rol,
      permisos: finalPerms,
      tieneOverride: override?.activo || false,
      cargadoDesde: 'firestore',
    }
  } catch (error) {
    logger.error('Error resolviendo permisos', error instanceof Error ? error : new Error(String(error)))
    
    // Fallback a defaults
    return {
      userId: user.id,
      rol: user.rol,
      permisos: getDefaultPerms(user.rol),
      tieneOverride: false,
      cargadoDesde: 'default',
    }
  }
}

// ============================================================================
// LISTENERS EN TIEMPO REAL
// ============================================================================

/**
 * Escucha cambios en los permisos de un rol
 */
export function subscribeToRolePermissions(
  rolId: string,
  callback: (permisos: PermissionsMap) => void
): Unsubscribe {
  const docRef = doc(db, 'roles', rolId)
  
  return onSnapshot(docRef, (doc) => {
    if (doc.exists()) {
      const data = doc.data() as RolePermissions
      callback(data.permisos)
    } else {
      callback(getDefaultPerms(rolId))
    }
  }, (error) => {
    logger.error('Error en listener de permisos de rol', error)
    callback(getDefaultPerms(rolId))
  })
}

/**
 * Escucha cambios en el usuario (incluyendo override).
 *
 * Si el listener muere con permission-denied, refresca el ID token con
 * `getIdToken(true)` y re-suscribe UNA vez antes de caer a los permisos por
 * defecto. Caso 2026-09-05: la pestaña del login y la TV del monitor del
 * mismo PC perdieron el listener el mismo segundo — token compartido vencido
 * en pestañas dormidas — y quedaban con permisos por defecto hasta recargar.
 * Un segundo rechazo, o cualquier otro error, cae al fallback como antes.
 */
export function subscribeToUserPermissions(
  userId: string,
  userRol: string,
  callback: (resolved: ResolvedPermissions) => void
): Unsubscribe {
  const userRef = doc(db, 'users', userId)
  let unsubscribeActual: Unsubscribe = () => {}
  let cancelado = false
  let reintentado = false

  const caerADefault = () =>
    callback({
      userId,
      rol: userRol,
      permisos: getDefaultPerms(userRol),
      tieneOverride: false,
      cargadoDesde: 'default',
    })

  const suscribir = () => {
    unsubscribeActual = onSnapshot(userRef, async (doc) => {
      if (doc.exists()) {
        const userData = doc.data() as User
        const rolePerms = await getRolePermissions(userRol)
        const override = userData.permissionsOverride

        const finalPerms = override?.activo
          ? mergePermissions(rolePerms, override.permisos)
          : rolePerms

        callback({
          userId,
          rol: userRol,
          permisos: finalPerms,
          tieneOverride: override?.activo || false,
          cargadoDesde: 'firestore',
        })
      }
    }, async (error) => {
      logger.error('Error en listener de permisos de usuario', error)
      const usuario = auth.currentUser
      if (reintentado || cancelado || !esPermissionDenied(error) || !usuario || usuario.uid !== userId) {
        caerADefault()
        return
      }
      reintentado = true
      logger.warn('Listener de permisos rechazado con permission-denied; reintentando con token fresco', { userId })
      try {
        await usuario.getIdToken(true)
      } catch (e) {
        logger.error('No se pudo refrescar el token para re-suscribir permisos', e instanceof Error ? e : new Error(String(e)))
        caerADefault()
        return
      }
      if (cancelado) return
      suscribir()
    })
  }

  suscribir()

  return () => {
    cancelado = true
    unsubscribeActual()
  }
}

function esPermissionDenied(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'permission-denied' || code === 'firestore/permission-denied'
}

// ============================================================================
// INICIALIZACIÓN
// ============================================================================

/**
 * Inicializa los roles por defecto en Firestore si no existen
 */
export async function initializeDefaultRoles(adminUserId: string): Promise<void> {
  const roles = ['admin', 'supervisor', 'tecnico', 'usuario']
  
  for (const rolId of roles) {
    const docRef = doc(db, 'roles', rolId)
    const docSnap = await getDoc(docRef)
    
    if (!docSnap.exists()) {
      await saveRolePermissions(rolId, getDefaultPerms(rolId), adminUserId)
      logger.info('Rol inicializado', { rolId })
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function getRoleName(rolId: string): string {
  const names: Record<string, string> = {
    admin: 'Administrador',
    supervisor: 'Supervisor',
    tecnico: 'Técnico',
    usuario: 'Usuario',
  }
  return names[rolId] || rolId
}

function getRoleDescription(rolId: string): string {
  const descriptions: Record<string, string> = {
    admin: 'Acceso completo al sistema. Gestión de usuarios, configuración y todos los módulos.',
    supervisor: 'Gestión de incidencias, equipos y tareas. Puede validar y asignar trabajo.',
    tecnico: 'Ejecuta tareas asignadas, cierra incidencias y realiza inspecciones.',
    usuario: 'Acceso básico. Puede reportar incidencias y ver información general.',
  }
  return descriptions[rolId] || 'Rol personalizado'
}
