/**
 * Sistema de Permisos Dinámicos
 * 
 * Estructura:
 * - Módulos: Secciones de la app (dashboard, incidencias, equipos, etc.)
 * - Acciones: Operaciones por módulo (ver, crear, editar, eliminar, etc.)
 * - Permisos por rol: Defaults para cada rol
 * - Override por usuario: Permisos personalizados que sobrescriben el rol
 */

// ============================================================================
// MÓDULOS DE LA APLICACIÓN
// ============================================================================

export const APP_MODULES = [
  'dashboard',
  'incidencias',
  'equipos',
  'zonas',
  'preventivo',
  'mapa',
  'jerarquia',
  'repuestos',
  'inspecciones',
  'recorridos',
  'fotoevidencia',
  'iot',
  'sensores',
  'ett',
  'configuracion',
  'usuarios',
  'reportes',
  'analisisGrader',
  'gantt',
  'aria',
] as const

export type AppModule = typeof APP_MODULES[number]

// ============================================================================
// ACCIONES POR MÓDULO
// ============================================================================

export const MODULE_ACTIONS = [
  'ver',           // Acceder al módulo y ver datos
  'crear',         // Crear nuevos registros
  'editar',        // Modificar registros existentes
  'eliminar',      // Eliminar registros
  'validar',       // Validar/aprobar (incidencias, tareas)
  'asignar',       // Asignar a técnicos/usuarios
  'ejecutar',      // Ejecutar tareas (preventivo)
  'cerrar',        // Cerrar/finalizar
  'exportar',      // Exportar a PDF/Word/Excel
  'configurar',    // Configurar ajustes del módulo
] as const

export type ModuleAction = typeof MODULE_ACTIONS[number]

// ============================================================================
// ESTRUCTURA DE PERMISOS
// ============================================================================

/**
 * Permisos de un módulo específico
 */
export interface ModulePermissions {
  visible: boolean                // Si el módulo aparece en el menú
  actions: ModuleAction[]         // Acciones permitidas
}

/**
 * Mapa de permisos por módulo
 */
export type PermissionsMap = {
  [K in AppModule]?: ModulePermissions
}

/**
 * Permisos de un rol almacenados en Firestore
 * /roles/{rolId}
 */
export interface RolePermissions {
  id: string                      // admin | supervisor | tecnico | usuario
  nombre: string                  // Nombre para mostrar
  descripcion: string             // Descripción del rol
  permisos: PermissionsMap        // Permisos por módulo
  esDefault: boolean              // Si es un rol del sistema (no editable)
  updatedAt?: Date
  updatedBy?: string
}

/**
 * Override de permisos por usuario
 * Se guarda en /users/{userId}/permissionsOverride
 */
export interface UserPermissionsOverride {
  activo: boolean                 // Si tiene override activo
  permisos: PermissionsMap        // Permisos que sobrescriben al rol
  notas?: string                  // Notas del admin
  updatedAt?: Date
  updatedBy?: string
}

/**
 * Permisos resueltos (rol + override) para usar en la app
 */
export interface ResolvedPermissions {
  userId: string
  rol: string
  permisos: PermissionsMap
  tieneOverride: boolean
  cargadoDesde: 'firestore' | 'cache' | 'default'
}

// ============================================================================
// CONFIGURACIÓN DE MÓDULOS (para UI de gestión)
// ============================================================================

export interface ModuleConfig {
  id: AppModule
  nombre: string
  descripcion: string
  icono: string
  accionesDisponibles: ModuleAction[]
  requiereAdmin?: boolean         // Solo visible para admins
}

export const MODULES_CONFIG: ModuleConfig[] = [
  {
    id: 'dashboard',
    nombre: 'Dashboard',
    descripcion: 'Panel principal con estadísticas',
    icono: 'LayoutDashboard',
    accionesDisponibles: ['ver', 'exportar'],
  },
  {
    id: 'incidencias',
    nombre: 'Incidencias',
    descripcion: 'Gestión de reportes de fallas',
    icono: 'AlertTriangle',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'validar', 'asignar', 'cerrar', 'exportar'],
  },
  {
    id: 'equipos',
    nombre: 'Equipos',
    descripcion: 'Catálogo de máquinas y equipos',
    icono: 'Wrench',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  },
  {
    id: 'zonas',
    nombre: 'Zonas',
    descripcion: 'Áreas y sectores de planta',
    icono: 'MapPin',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar'],
  },
  {
    id: 'preventivo',
    nombre: 'Preventivo',
    descripcion: 'Tareas de mantenimiento programado',
    icono: 'CalendarClock',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'ejecutar', 'asignar', 'exportar'],
  },
  {
    id: 'mapa',
    nombre: 'Mapa',
    descripcion: 'Vista geográfica de activos',
    icono: 'Map',
    accionesDisponibles: ['ver', 'configurar'],
  },
  {
    id: 'jerarquia',
    nombre: 'Jerarquía',
    descripcion: 'Estructura organizacional de activos',
    icono: 'FolderTree',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar'],
  },
  {
    id: 'repuestos',
    nombre: 'Repuestos',
    descripcion: 'Inventario de repuestos y materiales',
    icono: 'Package',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  },
  {
    id: 'inspecciones',
    nombre: 'Inspecciones',
    descripcion: 'Rondas de inspección',
    icono: 'RefreshCw',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'ejecutar'],
  },
  {
    id: 'recorridos',
    nombre: 'Recorridos',
    descripcion: 'Rutas de inspección programadas',
    icono: 'Route',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'ejecutar'],
  },
  {
    id: 'fotoevidencia',
    nombre: 'Foto Evidencia',
    descripcion: 'Registro fotográfico de activos',
    icono: 'Camera',
    accionesDisponibles: ['ver', 'crear', 'eliminar', 'exportar'],
  },
  {
    id: 'iot',
    nombre: 'IoT',
    descripcion: 'Dispositivos y sensores conectados',
    icono: 'Cpu',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'configurar'],
  },
  {
    id: 'sensores',
    nombre: 'Sensores',
    descripcion: 'Monitoreo de sensores en tiempo real',
    icono: 'Activity',
    accionesDisponibles: ['ver', 'configurar', 'exportar'],
  },
  {
    id: 'ett',
    nombre: 'ETT',
    descripcion: 'Especificaciones Técnicas de Trabajo',
    icono: 'FileText',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'exportar'],
  },
  {
    id: 'configuracion',
    nombre: 'Configuración',
    descripcion: 'Ajustes del sistema',
    icono: 'Settings',
    accionesDisponibles: ['ver', 'configurar'],
    requiereAdmin: true,
  },
  {
    id: 'usuarios',
    nombre: 'Usuarios',
    descripcion: 'Gestión de usuarios y roles',
    icono: 'Users',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'configurar'],
    requiereAdmin: true,
  },
  {
    id: 'reportes',
    nombre: 'Reportes',
    descripcion: 'Informes y análisis',
    icono: 'BarChart',
    accionesDisponibles: ['ver', 'exportar'],
  },
  {
    id: 'analisisGrader',
    nombre: 'Análisis Grader',
    descripcion: 'Análisis de datos de clasificadora de salmones',
    icono: 'BarChart3',
    accionesDisponibles: ['ver', 'crear', 'editar', 'exportar', 'configurar'],
  },
  {
    id: 'gantt',
    nombre: 'Planificador Gantt',
    descripcion: 'Planificación integrada de mantenimiento y temporada baja',
    icono: 'CalendarClock',
    accionesDisponibles: ['ver', 'crear', 'editar', 'eliminar', 'asignar', 'exportar'],
  },
  {
    id: 'aria',
    nombre: 'ARIA Asistente',
    descripcion: 'Asistente de IA para reportes, consultas e incidencias',
    icono: 'Bot',
    accionesDisponibles: ['ver', 'configurar'],
  },
]

// ============================================================================
// PERMISOS DEFAULT POR ROL
// ============================================================================

/**
 * Permisos completos para admin
 */
const ADMIN_PERMISSIONS: PermissionsMap = Object.fromEntries(
  MODULES_CONFIG.map(m => [
    m.id,
    { visible: true, actions: m.accionesDisponibles }
  ])
) as PermissionsMap

// ARIA: admin tiene acceso completo (ver + configurar pensamiento profundo)
ADMIN_PERMISSIONS.aria = { visible: true, actions: ['ver', 'configurar'] }

/**
 * Permisos para supervisor
 */
const SUPERVISOR_PERMISSIONS: PermissionsMap = {
  dashboard: { visible: true, actions: ['ver', 'exportar'] },
  incidencias: { visible: true, actions: ['ver', 'crear', 'editar', 'validar', 'asignar', 'cerrar', 'exportar'] },
  equipos: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar'] },
  zonas: { visible: true, actions: ['ver', 'crear', 'editar'] },
  preventivo: { visible: true, actions: ['ver', 'crear', 'editar', 'ejecutar', 'asignar', 'exportar'] },
  mapa: { visible: true, actions: ['ver'] },
  jerarquia: { visible: true, actions: ['ver', 'editar'] },
  repuestos: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar'] },
  inspecciones: { visible: true, actions: ['ver', 'crear', 'editar', 'ejecutar'] },
  recorridos: { visible: true, actions: ['ver', 'crear', 'editar', 'ejecutar'] },
  fotoevidencia: { visible: true, actions: ['ver', 'crear', 'exportar'] },
  iot: { visible: true, actions: ['ver', 'configurar'] },
  sensores: { visible: true, actions: ['ver', 'exportar'] },
  ett: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar'] },
  configuracion: { visible: false, actions: [] },
  usuarios: { visible: false, actions: [] },
  reportes: { visible: true, actions: ['ver', 'exportar'] },
  analisisGrader: { visible: true, actions: ['ver', 'crear', 'editar', 'exportar', 'configurar'] },
  gantt: { visible: true, actions: ['ver', 'crear', 'editar', 'eliminar', 'asignar', 'exportar'] },
  aria: { visible: false, actions: [] },
}

/**
 * Permisos para técnico
 */
const TECNICO_PERMISSIONS: PermissionsMap = {
  dashboard: { visible: true, actions: ['ver'] },
  incidencias: { visible: true, actions: ['ver', 'crear', 'cerrar'] },
  equipos: { visible: true, actions: ['ver'] },
  zonas: { visible: true, actions: ['ver'] },
  preventivo: { visible: true, actions: ['ver', 'ejecutar'] },
  mapa: { visible: true, actions: ['ver'] },
  jerarquia: { visible: true, actions: ['ver'] },
  repuestos: { visible: true, actions: ['ver'] },
  inspecciones: { visible: true, actions: ['ver', 'ejecutar'] },
  recorridos: { visible: true, actions: ['ver', 'ejecutar'] },
  fotoevidencia: { visible: true, actions: ['ver', 'crear'] },
  iot: { visible: true, actions: ['ver'] },
  sensores: { visible: true, actions: ['ver'] },
  ett: { visible: true, actions: ['ver'] },
  configuracion: { visible: false, actions: [] },
  usuarios: { visible: false, actions: [] },
  reportes: { visible: true, actions: ['ver'] },
  analisisGrader: { visible: true, actions: ['ver'] },
  gantt: { visible: true, actions: ['ver', 'editar', 'asignar'] },
  aria: { visible: false, actions: [] },
}

/**
 * Permisos para usuario básico (solo reportar)
 */
const USUARIO_PERMISSIONS: PermissionsMap = {
  dashboard: { visible: true, actions: ['ver'] },
  incidencias: { visible: true, actions: ['ver', 'crear'] },
  equipos: { visible: true, actions: ['ver'] },
  zonas: { visible: true, actions: ['ver'] },
  preventivo: { visible: false, actions: [] },
  mapa: { visible: true, actions: ['ver'] },
  jerarquia: { visible: false, actions: [] },
  repuestos: { visible: false, actions: [] },
  inspecciones: { visible: false, actions: [] },
  recorridos: { visible: false, actions: [] },
  fotoevidencia: { visible: true, actions: ['ver', 'crear'] },
  iot: { visible: false, actions: [] },
  sensores: { visible: false, actions: [] },
  ett: { visible: false, actions: [] },
  configuracion: { visible: false, actions: [] },
  usuarios: { visible: false, actions: [] },
  reportes: { visible: false, actions: [] },
  analisisGrader: { visible: false, actions: [] },
  gantt: { visible: false, actions: [] },
  aria: { visible: false, actions: [] },
}

export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionsMap> = {
  admin: ADMIN_PERMISSIONS,
  supervisor: SUPERVISOR_PERMISSIONS,
  tecnico: TECNICO_PERMISSIONS,
  usuario: USUARIO_PERMISSIONS,
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Obtiene las acciones disponibles para un módulo
 */
export function getModuleConfig(moduleId: AppModule): ModuleConfig | undefined {
  return MODULES_CONFIG.find(m => m.id === moduleId)
}

/**
 * Verifica si un permiso específico está habilitado
 */
export function hasPermission(
  permisos: PermissionsMap,
  modulo: AppModule,
  accion: ModuleAction
): boolean {
  const modulePerms = permisos[modulo]
  if (!modulePerms) return false
  if (!modulePerms.visible) return false
  return modulePerms.actions.includes(accion)
}

/**
 * Verifica si un módulo es visible
 */
export function isModuleVisible(
  permisos: PermissionsMap,
  modulo: AppModule
): boolean {
  return permisos[modulo]?.visible ?? false
}

/**
 * Combina permisos de rol con override de usuario
 */
export function mergePermissions(
  rolePerms: PermissionsMap,
  overridePerms?: PermissionsMap
): PermissionsMap {
  if (!overridePerms) return rolePerms
  
  const merged: PermissionsMap = { ...rolePerms }
  
  for (const [modulo, perms] of Object.entries(overridePerms)) {
    if (perms) {
      merged[modulo as AppModule] = perms
    }
  }
  
  return merged
}

/**
 * Labels para mostrar en UI
 */
export const ACTION_LABELS: Record<ModuleAction, string> = {
  ver: 'Ver',
  crear: 'Crear',
  editar: 'Editar',
  eliminar: 'Eliminar',
  validar: 'Validar',
  asignar: 'Asignar',
  ejecutar: 'Ejecutar',
  cerrar: 'Cerrar',
  exportar: 'Exportar',
  configurar: 'Configurar',
}
