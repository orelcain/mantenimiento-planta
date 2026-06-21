// Tipos base del sistema
export type UserRole = 'admin' | 'supervisor' | 'tecnico' | 'usuario'

export type IncidentStatus = 'pendiente' | 'confirmada' | 'rechazada' | 'en_proceso' | 'resuelta' | 'cerrada'

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
  authProvider?: 'email' | 'google' // Proveedor de autenticación
  permissionsOverride?: import('./permissions').UserPermissionsOverride // Override de permisos
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
  // Vinculación con jerarquía organizacional
  hierarchyNodeId?: string // ID del nodo jerárquico asociado (planta, área, línea, etc.)
  hierarchyPath?: string // "Planta > Área > Línea" (snapshot para display)
  // Vinculación con ubicación de mapa
  mapLocationId?: string // ID del MapLocation donde está esta zona
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
  // Ubicación (nuevo): fuente de verdad es la jerarquía
  hierarchyNodeId?: string // ID del nodo jerárquico asociado
  hierarchyPath?: string // "Planta > Área > ... > Equipo" (snapshot opcional)
  // Control de sincronización (jerarquía -> equipment)
  syncExcluded?: boolean // Si true, el sync no debe crear/actualizar este equipo
  // Eliminación lógica (para evitar recreación por sync)
  deleted?: boolean
  deletedAt?: Date
  // Ubicación (legacy - zonas/mapas)
  zoneId?: string
  zonePath?: string[] // ["A", "A1"] para "A1"
  position?: { x: number; y: number }
  qrCode?: string
  criticidad: 'alta' | 'media' | 'baja'
  estado: 'operativo' | 'en_mantenimiento' | 'fuera_servicio'
  fechaInstalacion?: Date
  photoURL?: string // @deprecated - usar photos[]
  photos?: string[] // URLs de Firebase Storage para fotos de referencia del equipo
  predictiveThresholds?: PredictiveThresholds
  // Ficha técnica NFPA 70B (Centro Técnico Documental) — ver docs/PLAN_CENTRO_TECNICO_DOCUMENTAL.md
  fichaTecnica?: FichaTecnica
  createdAt: Date
  updatedAt: Date
}

// Ficha técnica NFPA 70B: datos de placa eléctrica + RCM (Cap. 9)
export interface FichaTecnica {
  // Placa eléctrica
  potenciaKw?: number
  voltajeV?: number
  corrienteA?: number
  rpm?: number
  factorServicio?: number
  claseAislamiento?: string
  gradoIP?: string
  // RCM / NFPA 70B Cap. 9
  condicion?: 1 | 2 | 3 // 1=🟢 como nuevo · 2=🟡 con desvíos · 3=🔴 acción requerida
  vidaUtilAnios?: number
  frecuenciaInspeccionDias?: number
  proximaInspeccion?: string // ISO date (YYYY-MM-DD)
}

// Historial de mantenimiento NFPA 70B (colección plana `maintenanceLog`)
export interface MaintenanceLogEntry {
  id: string
  equipmentId: string
  hierarchyNodeId?: string
  fecha: Date
  tipo: 'preventivo' | 'correctivo' | 'predictivo' | 'inspeccion' | 'termografia' | 'medicion'
  tecnico?: string
  hallazgo: string
  severidad: 'verde' | 'amarillo' | 'rojo' // = condición 1/2/3 (Cap. 9)
  incidenciaId?: string
  proximaInspeccion?: string // ISO date
  createdAt: Date
}

// Umbrales predictivos configurables
export interface PredictiveThresholds {
  tempWarnLow: number
  tempWarnHigh: number
  tempCritLow: number
  tempCritHigh: number
  humWarnLow: number
  humWarnHigh: number
  humCritLow: number
  humCritHigh: number
  tempSlopeWarn: number
  tempSlopeCrit: number
  humSlopeWarn: number
  humSlopeCrit: number
  offlineMs: number
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
  // Ubicación en mapa físico
  mapLocationId?: string   // ID de la ubicación del mapa (ej: "planta-principal")
  mapVersionId?: string    // ID de la versión del mapa usada
  mapPosition?: { x: number; y: number } // Posición normalizada (0-1) en el mapa
  // Síntomas y detalles
  sintomas?: string[]
  causaRaiz?: string
  // Fotos
  fotos: string[] // URLs de Firebase Storage
  // Asignación
  reportadoPor: string // userId
  creadoPor: string // userId (alias de reportadoPor para claridad)
  creadoPorNombre?: string // Nombre del usuario que creó la incidencia
  asignadoA?: string // userId
  asignadoANombre?: string // Nombre del usuario asignado
  // Validación
  requiresValidation: boolean
  validatedBy?: string
  validatedAt?: Date
  rejectionReason?: string
  // Tiempos
  createdAt: Date
  updatedAt: Date
  confirmedAt?: Date
  resolvedAt?: Date
  resolvedBy?: string // userId de quien resolvió
  resolvedByName?: string // Nombre de quien resolvió
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

// ===== TIPOS IOT Y SENSORES =====

export type SensorType = 
  | 'vibration'      // Vibración (mm/s)
  | 'temperature'    // Temperatura (°C)
  | 'current'        // Corriente eléctrica (A)
  | 'pressure'       // Presión (bar/psi)
  | 'flow'           // Flujo (L/min)
  | 'humidity'       // Humedad (%)
  | 'rpm'            // Revoluciones por minuto
  | 'power'          // Potencia (kW)
  | 'sound'          // Sonido (dB)

export type DeviceType = 'esp32' | 'logo8' | 'plc' | 'sensor_module'

export interface SensorReading {
  timestamp: Date
  value: number
  unit: string
}

export interface IoTDevice {
  id: string
  equipmentId: string
  deviceType: DeviceType
  name: string
  ipAddress?: string
  macAddress?: string
  sensors: {
    type: SensorType
    name: string
    unit: string
    minValue: number
    maxValue: number
    warningThreshold: number
    criticalThreshold: number
  }[]
  status: 'online' | 'offline' | 'error'
  lastReading: Date
  createdAt: Date
}

export interface SensorData {
  id: string
  deviceId: string
  equipmentId: string
  sensorType: SensorType
  readings: SensorReading[]
  currentValue: number
  isAnomaly: boolean
  alertLevel?: 'warning' | 'critical'
  createdAt: Date
}

export interface IoTAlert {
  id: string
  deviceId: string
  equipmentId: string
  sensorType: SensorType
  alertLevel: 'warning' | 'critical'
  message: string
  currentValue: number
  threshold: number
  autoIncidentCreated: boolean
  incidentId?: string
  acknowledgedBy?: string
  acknowledgedAt?: Date
  createdAt: Date
}

// ===== TIPOS IA Y ANÁLISIS =====

export interface AIAnalysis {
  incidentId?: string
  equipmentId?: string
  analysisType: 'symptom_suggestion' | 'pattern_detection' | 'root_cause' | 'prediction'
  input: any
  output: any
  confidence: number
  model: string
  tokens: number
  createdAt: Date
}

export interface PatternDetection {
  id: string
  equipmentIds: string[]
  patternType: 'recurring_failure' | 'degradation' | 'correlation'
  description: string
  frequency: number
  lastOccurrence: Date
  recommendation: string
  estimatedCost: number
  estimatedSavings: number
  createdBy: 'ai' | 'manual'
  createdAt: Date
}

// ===== EVIDENCIAS FOTOGRÁFICAS (ANTES/DESPUÉS) =====

export type PhotoEvidenceStatus = 'pendiente' | 'en_proceso' | 'corregida' | 'verificada'

// Foto individual (antes o después)
export interface PhotoItem {
  id: string
  url: string
  descripcion?: string
  timestamp: Date
}

export interface PhotoPairMeta {
  // Opcional: título específico del par (si no se define, se usa el título de la evidencia)
  titulo?: string
  // Ubicación específica del par (texto libre / manual)
  ubicacion?: string
  // Opcional: ubicación seleccionada desde jerarquía (se guarda también como string resuelto)
  ubicacionNodeId?: string
  ubicacionPath?: string
  descripcion?: string
  equipo?: string
  ot?: string
  criticidad?: 'baja' | 'media' | 'alta' | 'critica'
  tipoFalla?: string
  anotadaAntes?: boolean
  anotadaDespues?: boolean
}

export interface PhotoPairPhotos {
  before: PhotoItem[]
  after: PhotoItem[]
}

// Grupo de fotos antes/después
export interface PhotoEvidence {
  id: string
  titulo: string
  descripcion?: string
  // Ubicación en jerarquía (opcional)
  hierarchyNodeId?: string
  hierarchyPath?: string // "Planta > Área > Línea > Equipo"
  // Fotos
  // Legacy: 1 foto por par (primer elemento). Se mantiene por compatibilidad.
  fotosBefore: PhotoItem[]
  fotosAfter: PhotoItem[]
  // Nuevo: múltiples fotos por par (alineado por índice de par)
  pairPhotos?: PhotoPairPhotos[]
  // Metadatos por par (se alinea por índice con fotosBefore/fotosAfter)
  pairMeta?: PhotoPairMeta[]
  // Estado
  status: PhotoEvidenceStatus
  // Metadatos
  reportadoPor: string
  corregidoPor?: string
  verificadoPor?: string
  // Fechas
  createdAt: Date
  updatedAt: Date
  corregidaAt?: Date
  verificadaAt?: Date
  // Tags/categorías para búsqueda
  tags?: string[]
}

// Para exportación a PDF
export interface PhotoComparison {
  evidenceId: string
  titulo: string
  ubicacion?: string
  before: PhotoItem
  after: PhotoItem
  descripcion?: string
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
  iot: {
    enabled: boolean
    autoCreateIncidents: boolean
    dataRetentionDays: number
  }
  ai: {
    enabled: boolean
    provider: 'groq' | 'gemini'
    model: string
  }
}

// ETT - Especificaciones Técnicas del Trabajo
// Modelo alineado al formato corporativo AquaChile (refactor abril 2026)
export type {
  // Documento completo
  ETT,
  ETTEstado,
  // Cabecera editable
  ETTCabecera,
  // Bloques de contenido
  ETTBloque,
  ETTBloqueParrafo,
  ETTBloqueLista,
  ETTBloqueTabla,
  ETTBloqueSubtitulo,
  ETTListItem,
  ETTTablaFila,
  // Adjuntos
  ETTImagen,
  // Plantillas
  ETTPlantilla,
  ETTPlantillaId,
  ETTPlantillaDefaults,
  // IA
  ETTContextoIA,
  ETTCompletadoIA,
} from './ett'

export type GanttTaskStatus = 'planificada' | 'en_progreso' | 'bloqueada' | 'completada'
export type GanttDependencyType = 'FS' | 'SS' | 'FF' | 'SF'

export interface GanttTaskDependency {
  predecessorId: string
  type: GanttDependencyType
  lagHours?: number
}

export interface GanttTask {
  id: string
  titulo: string
  descripcion?: string
  projectId?: string
  projectName?: string
  hierarchyNodeId?: string
  hierarchyPath?: string
  equipmentId?: string
  equipmentNombre?: string
  responsibleUserId?: string
  responsibleName?: string
  status: GanttTaskStatus
  prioridad: IncidentPriority
  startDate: Date
  endDate: Date
  baselineStartDate?: Date
  baselineEndDate?: Date
  progress: number
  estimatedHours: number
  dependencies: GanttTaskDependency[]
  sparePartIds?: string[]
  predictiveRiskLevel?: FailurePrediction['nivelRiesgo']
  aiSuggestedProgress?: number
  predictiveSourceId?: string
  commentsCount?: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface GanttProject {
  id: string
  name: string
  description?: string
  active: boolean
  createdBy: string
  createdByName?: string
  createdAt: Date
  updatedAt: Date
}

export interface GanttTaskComment {
  id: string
  taskId: string
  content: string
  reportedProgress?: number
  reportedDurationHours?: number
  aiSuggestedProgress?: number
  photos?: string[]
  createdBy: string
  createdByName?: string
  createdAt: Date
}

export interface GanttScheduleMetrics {
  totalTasks: number
  completedTasks: number
  delayedTasks: number
  criticalTasks: number
  averageProgress: number
  estimatedDurationHours: number
}

export interface GanttCPMTask {
  taskId: string
  earliestStart: number
  earliestFinish: number
  latestStart: number
  latestFinish: number
  slack: number
  isCritical: boolean
}

export interface GanttCPMResult {
  tasks: GanttCPMTask[]
  criticalPath: string[]
  projectDurationHours: number
}

export interface GanttDelaySimulationInput {
  taskId: string
  extraHours: number
}

export interface GanttDelaySimulationResult {
  baseDurationHours: number
  simulatedDurationHours: number
  impactHours: number
  impactedTaskIds: string[]
}
