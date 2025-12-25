// Tipos base del sistema
export type UserRole = 'admin' | 'supervisor' | 'tecnico'

export type IncidentStatus = 'pendiente' | 'confirmada' | 'rechazada' | 'en_proceso' | 'cerrada'

export type IncidentPriority = 'critica' | 'alta' | 'media' | 'baja'

export type MaintenanceType = 'correctivo' | 'preventivo' | 'predictivo' | 'proactivo'

// Usuario
export interface User {
  id: string
  email: string
  nombre: string
  apellido: string
  rol: UserRole
  activo: boolean
  createdAt: Date
  updatedAt: Date
  photoURL?: string
}

// Tipo de zona
export type ZoneType = 
  | 'produccion' 
  | 'almacen' 
  | 'oficinas' 
  | 'mantenimiento' 
  | 'carga_descarga'
  | 'servicios'
  | 'seguridad'
  | 'maquina' // Zona vinculada a un equipo/máquina
  | 'otro'

// Punto en el mapa (coordenadas normalizadas 0-1)
export interface MapPoint {
  x: number // 0-1 relativo al ancho del mapa
  y: number // 0-1 relativo al alto del mapa
}

// Zona del mapa (polígono dibujado punto a punto)
export interface Zone {
  id: string // ID único generado
  parentId: string | null
  nivel: 1 | 2 | 3
  nombre: string
  codigo: string // Código corto: "A", "B", "PROD-1", etc.
  tipo: ZoneType
  descripcion?: string
  equipmentId?: string // ID del equipo vinculado (solo para tipo 'maquina')
  // Polígono: array de puntos que forman la zona
  polygon: MapPoint[]
  // Bounds calculados del polígono (para búsquedas rápidas)
  bounds?: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
  color?: string
  activa: boolean
  createdAt: Date
  updatedAt: Date
}

// Equipo/Máquina
export interface Equipment {
  id: string
  codigo: string // Código interno del equipo
  nombre: string
  descripcion?: string
  marca?: string
  modelo?: string
  numeroSerie?: string
  zoneId: string
  zonePath: string[] // ["A", "A1"] para "A1"
  position: { x: number; y: number }
  qrCode?: string
  criticidad: 'alta' | 'media' | 'baja'
  estado: 'operativo' | 'en_mantenimiento' | 'fuera_servicio'
  fechaInstalacion?: Date
  photoURL?: string
  createdAt: Date
  updatedAt: Date
}

// Incidencia
export interface Incident {
  id: string
  tipo: MaintenanceType
  titulo: string
  descripcion: string
  equipmentId?: string
  // Ubicación jer Aquí ya actualizado el sistema con el endpoint de la jerarquía
  hierarchyNodeId?: string // ID del nodo jerárquico seleccionado (reemplaza zoneId)
  zoneId?: string // @deprecated Mantener para compatibilidad con datos antiguos
  position?: { x: number; y: number }
  prioridad: IncidentPriority
  status: IncidentStatus
  // Síntomas y detalles
  sintomas?: string[]
  causaRaiz?: string
  // Fotos
  fotos: string[] // URLs de Firebase Storage
  // Asignación
  reportadoPor: string // userId
  asignadoA?: string // userId
  // Validación
  requiresValidation: boolean
  validatedBy?: string
  validatedAt?: Date
  rejectionReason?: string
  // Tiempos
  createdAt: Date
  updatedAt: Date
  confirmedAt?: Date
  closedAt?: Date
  // Resolución
  resolucion?: string
  tiempoRespuestaMinutos?: number
  tiempoResolucionMinutos?: number
  // Repuestos usados
  repuestosUsados?: {
    repuestoId: string
    cantidad: number
  }[]
  // Firma digital
  firmaCierre?: string // Base64 de la firma
}

// Tarea de mantenimiento preventivo
export interface PreventiveTask {
  id: string
  equipmentId: string
  tipo: string // "lubricación", "inspección", "cambio_filtro", etc.
  nombre: string
  descripcion?: string
  frecuenciaDias: number
  checklist: {
    id: string
    tarea: string
    completado: boolean
  }[]
  ultimaEjecucion?: Date
  proximaEjecucion: Date
  asignadoA?: string
  activo: boolean
  createdAt: Date
  updatedAt: Date
}

// Ejecución de tarea preventiva
export interface PreventiveExecution {
  id: string
  taskId: string
  equipmentId: string
  ejecutadoPor: string
  fechaEjecucion: Date
  checklistCompletado: {
    id: string
    tarea: string
    completado: boolean
    observacion?: string
  }[]
  observaciones?: string
  fotos: string[]
  duracionMinutos: number
  repuestosUsados?: {
    repuestoId: string
    cantidad: number
  }[]
}

// Predicción de falla
export interface FailurePrediction {
  id: string
  equipmentId: string
  nivelRiesgo: 'bajo' | 'medio' | 'alto' | 'critico'
  confianza: number // 0-1
  indicadores: string[]
  recomendacion: string
  fechaPrediccion: Date
  modelVersion: string
  atendido: boolean
  atendidoPor?: string
  atendidoAt?: Date
}

// Análisis de causa raíz
export interface RootCauseAnalysis {
  id: string
  incidentId: string
  metodo: 'ishikawa' | '5porques'
  causas: {
    categoria?: string // Para Ishikawa: "Máquina", "Método", "Mano de obra", etc.
    descripcion: string
    nivel?: number // Para 5 porqués: 1-5
  }[]
  causaRaizIdentificada: string
  acciones: {
    id: string
    descripcion: string
    responsable: string
    fechaLimite: Date
    completada: boolean
    fechaCompletada?: Date
  }[]
  efectividad?: number // % reducción de fallas post-implementación
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

// Repuesto/Parte
export interface SparePart {
  id: string
  codigo: string
  nombre: string
  descripcion?: string
  categoria: string
  unidad: string // "piezas", "litros", "metros", etc.
  stockActual: number
  stockMinimo: number
  stockMaximo?: number
  ubicacion?: string // Ubicación en almacén
  proveedor?: string
  costoUnitario?: number
  equiposCompatibles: string[] // IDs de equipos
  photoURL?: string
  createdAt: Date
  updatedAt: Date
}

// Movimiento de inventario
export interface InventoryMovement {
  id: string
  sparePartId: string
  tipo: 'entrada' | 'salida' | 'ajuste'
  cantidad: number
  motivo: string
  incidentId?: string // Si es por uso en correctivo
  preventiveExecutionId?: string // Si es por uso en preventivo
  realizadoPor: string
  createdAt: Date
}

// Código de invitación
export interface InviteCode {
  id: string
  code: string
  rol: UserRole
  usosMaximos: number
  usosActuales: number
  activo: boolean
  createdBy: string
  createdAt: Date
  expiresAt?: Date
}

// Configuración de la aplicación
export interface AppSettings {
  incidents: {
    requireSupervisorValidation: boolean
    allowRejection: boolean
    notifyTechnicianOnResult: boolean
    autoAssign: boolean
  }
  notifications: {
    newIncidentCritical: boolean
    incidentUnassignedMinutes: number
    preventiveTaskOverdue: boolean
    predictiveAlertHigh: boolean
    lowStockAlert: boolean
    pendingRootCauseAnalysis: boolean
  }
  general: {
    companyName: string
    logoURL?: string
    timezone: string
  }
}
