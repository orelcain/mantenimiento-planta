/**
 * Tipos para el módulo Visor 3D
 */

/** Formatos de modelo 3D soportados */
export type Model3DFormat = 'glb' | 'gltf' | 'obj' | 'fbx'

/** Unidad de medida para cotas */
export type DimensionUnit = 'mm' | 'cm' | 'm'

/** Tipo de medición */
export type MeasurementType = 'distance' | 'area' | 'circumference' | 'volume'

/** Etiquetas de medición para UI */
export const MEASUREMENT_LABELS: Record<MeasurementType, string> = {
  distance: 'Distancia',
  area: 'Área',
  circumference: 'Circunferencia',
  volume: 'Volumen',
}

/** Íconos/sufijos de unidad según tipo */
export function getUnitSuffix(unit: DimensionUnit, type: MeasurementType): string {
  switch (type) {
    case 'distance':
    case 'circumference':
      return unit
    case 'area':
      return `${unit}²`
    case 'volume':
      return `${unit}³`
  }
}

/** Punto 3D */
export interface Point3D {
  x: number
  y: number
  z: number
}

/** Modelo 3D almacenado en Firestore */
export interface Model3D {
  id: string
  name: string
  originalFileName: string
  contentType: string
  format: Model3DFormat
  sizeBytes: number
  storagePath: string
  downloadURL: string
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string
  /** Visibilidad: 'public' para todos los autenticados, 'admin' solo admin */
  visibility: 'public' | 'admin'
}

/** Datos para crear un modelo 3D (sin id ni timestamps) */
export interface CreateModel3DData {
  name: string
  originalFileName: string
  contentType: string
  format: Model3DFormat
  sizeBytes: number
  storagePath: string
  downloadURL: string
  createdBy: string
  visibility?: 'public' | 'admin'
}

/** Cota / dimensión asociada a un modelo 3D */
export interface Dimension3D {
  id: string
  /** Tipo de medición (default: 'distance' para retrocompatibilidad) */
  type: MeasurementType
  /** Todos los puntos de la medición */
  points: Point3D[]
  /** Punto de inicio (retrocompat) */
  p1: Point3D
  /** Punto final (retrocompat) */
  p2: Point3D
  /** Valor principal calculado (longitud, área, circunferencia, o volumen) */
  value: number
  /** Longitud calculada (alias de value para retrocompat) */
  length: number
  /** Unidad de medida */
  unit: DimensionUnit
  /** Etiqueta opcional */
  label: string
  /** Para circunferencias: radio */
  radius?: number
  /** Para circunferencias: diámetro */
  diameter?: number
  createdAt: Date
  createdBy: string
}

/** Datos para crear una cota */
export interface CreateDimensionData {
  type?: MeasurementType
  points?: Point3D[]
  p1: Point3D
  p2: Point3D
  /** Valor principal de la medición */
  value?: number
  length: number
  unit: DimensionUnit
  label?: string
  radius?: number
  diameter?: number
  createdBy: string
}

/** Override de material (color) para una malla del modelo */
export interface MaterialOverride {
  id: string
  /** Identificador estable de la malla (name o mesh-{index}) */
  meshId: string
  /** Color hexadecimal (#rrggbb) */
  color: string
  /** Opacidad 0-1 */
  opacity: number
  createdAt: Date
  createdBy: string
}

/** Datos para crear/actualizar un override */
export interface CreateMaterialOverrideData {
  meshId: string
  color: string
  opacity?: number
  createdBy: string
}

/** Extensiones de archivo permitidas */
export const ALLOWED_EXTENSIONS: Record<Model3DFormat, string[]> = {
  glb: ['.glb'],
  gltf: ['.gltf'],
  obj: ['.obj'],
  fbx: ['.fbx'],
}

/** MIME types aceptados */
export const ALLOWED_MIME_TYPES: string[] = [
  'model/gltf-binary',
  'model/gltf+json',
  'application/octet-stream', // GLB, FBX, OBJ se sirven así
]

/** Tamaño máximo de archivo: 200MB */
export const MAX_MODEL_SIZE_BYTES = 200 * 1024 * 1024

/** Detectar formato desde extensión de archivo */
export function detectFormat(fileName: string): Model3DFormat | null {
  const ext = fileName.toLowerCase().split('.').pop()
  switch (ext) {
    case 'glb': return 'glb'
    case 'gltf': return 'gltf'
    case 'obj': return 'obj'
    case 'fbx': return 'fbx'
    default: return null
  }
}

/** Extensiones soportadas como string para input accept */
export const ACCEPTED_EXTENSIONS = '.glb,.gltf,.obj,.fbx'

/**
 * Annotation (Pin 3D)
 */
export type AnnotationStatus = 'open' | 'resolved'
export type AnnotationPriority = 'low' | 'medium' | 'high'

export interface Annotation3D {
  id: string
  position: Point3D
  number: number
  title: string
  description?: string
  photos?: string[]  // URLs de fotos WebP optimizadas
  status: AnnotationStatus
  priority: AnnotationPriority
  createdAt: Date
  createdBy: string
}

