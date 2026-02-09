/**
 * Tipos para el sistema de Mapas con Marcadores
 * Permite georreferenciar incidencias y rutas de inspección
 */

/**
 * Ubicación física (lugar) donde se pueden cargar mapas
 * Ejemplos: "Planta Principal", "Recinto Empresa", "Acopio"
 */
export interface MapLocation {
  id: string
  nombre: string
  descripcion?: string
  activo: boolean
  orden: number // Para ordenar en listas
  createdAt: Date
  updatedAt: Date
  createdBy: string
}

/**
 * Versión de un mapa para una ubicación específica
 * Cada ubicación puede tener múltiples versiones (actualizaciones del plano)
 */
export interface MapVersion {
  id: string
  locationId: string
  imageUrl: string
  imagePath: string // Path en Firebase Storage
  version: number // Auto-incrementado por ubicación
  descripcion?: string // "Actualización después de remodelación"
  width: number
  height: number
  uploadedBy: string
  createdAt: Date
}

/**
 * Marcador en un mapa, vinculado a una incidencia o inspección
 */
export interface MapMarker {
  id: string
  mapVersionId: string
  locationId: string
  incidentId?: string // Si es incidencia individual
  inspectionId?: string // Si es parte de una ruta de inspección
  inspectionIndex?: number // Orden en la ruta (1, 2, 3...)
  position: {
    x: number // 0-1 normalizado
    y: number // 0-1 normalizado
  }
  label?: string // Etiqueta corta opcional
  createdAt: Date
  createdBy: string
}

/**
 * Estados posibles de una inspección
 */
export type InspectionStatus = 'en_progreso' | 'finalizado' | 'cancelada'

/**
 * Ruta de inspección - agrupa múltiples incidencias/marcadores
 */
export interface Inspection {
  id: string
  nombre: string
  descripcion?: string
  locationId: string
  locationName: string // Nombre de la ubicación para display
  mapVersionId: string
  status: InspectionStatus
  totalMarkers: number
  totalItems: number // Cantidad de items de inspección
  // Metadata del levantamiento
  motivoInspeccion?: string // "Revisión mensual", "Auditoría", etc.
  responsable?: string // userId del responsable
  inspectorNames?: string // Nombres de quienes realizaron la inspección (texto libre)
  // Campos adicionales para formato de checklist
  horaInicio?: string // Hora de inicio de la inspección (ej: "08:00")
  horaTermino?: string // Hora de término de la inspección (ej: "16:00")
  folio?: string // Número de folio del documento
  createdBy: string
  createdByName?: string
  createdAt: Date
  updatedAt: Date
  completedAt?: Date
}

/**
 * Foto de inspección con descripción opcional
 */
export interface InspectionPhoto {
  url: string
  descripcion?: string
}

/**
 * Item individual dentro de una inspección
 * Cada item puede tener su propia descripción y fotos
 */
export interface InspectionItem {
  id: string
  inspectionId: string
  markerId?: string
  order: number // Número del punto (1, 2, 3...)
  position: { x: number; y: number } // Posición en el mapa
  title: string
  description?: string
  area?: string
  equipo?: string
  fotos: InspectionPhoto[] // Fotos con descripción
  prioridad?: 'critica' | 'alta' | 'media' | 'baja'
  // Campos de checklist
  cumple?: boolean // Cumple (C)
  noCumple?: boolean // No Cumple (N/C)
  observacion?: string // Observaciones del punto
  fechaInspeccion?: Date // Fecha en la que se realizó la inspección del punto
  fechaReparacion?: Date // Fecha de reparación si aplica
  horaInicioItem?: string // Hora de inicio del trabajo en este punto
  horaTerminoItem?: string // Hora de término del trabajo en este punto
  revisoConforme?: string // Nombre o firma de revisión conforme
  // Si se convierte en incidencia formal
  incidentId?: string
  createdAt: Date
  updatedAt: Date
}

/**
 * DTO para crear una ubicación
 */
export interface CreateMapLocationDTO {
  nombre: string
  descripcion?: string
}

/**
 * DTO para subir un mapa
 */
export interface UploadMapDTO {
  locationId: string
  file: File
  descripcion?: string
}

/**
 * DTO para crear un marcador
 */
export interface CreateMarkerDTO {
  mapVersionId: string
  locationId: string
  position: { x: number; y: number }
  incidentId?: string
  inspectionId?: string
  inspectionIndex?: number
  label?: string
}

/**
 * DTO para crear una inspección
 */
export interface CreateInspectionDTO {
  nombre: string
  descripcion?: string
  locationId: string
  locationName: string
  mapVersionId: string
  motivoInspeccion?: string
  inspectorNames?: string
  horaInicio?: string
  horaTermino?: string
  folio?: string
  createdBy: string
  createdByName?: string
}

/**
 * DTO para crear un item de inspección
 */
export interface CreateInspectionItemDTO {
  inspectionId: string
  markerId?: string
  order: number
  position: { x: number; y: number }
  title: string
  description?: string
  area?: string
  equipo?: string
  revisoConforme?: string
  fotos?: File[]
  prioridad?: 'critica' | 'alta' | 'media' | 'baja'
}

/**
 * Resumen de estadísticas de una inspección
 */
export interface InspectionSummary {
  inspection: Inspection
  location: MapLocation
  mapVersion: MapVersion
  items: InspectionItem[]
  markers: MapMarker[]
  stats: {
    total: number
    porPrioridad: Record<string, number>
    conFotos: number
    sinFotos: number
  }
}
