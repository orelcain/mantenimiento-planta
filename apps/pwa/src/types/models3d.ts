/**
 * Tipos para el módulo Visor 3D
 */

/** Formatos de modelo 3D soportados */
export type Model3DFormat = 'glb' | 'gltf' | 'obj' | 'fbx'

/** Unidad de medida para cotas */
export type DimensionUnit = 'mm' | 'cm' | 'm'

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
  /** Punto de inicio */
  p1: Point3D
  /** Punto final */
  p2: Point3D
  /** Longitud calculada */
  length: number
  /** Unidad de medida */
  unit: DimensionUnit
  /** Etiqueta opcional */
  label: string
  createdAt: Date
  createdBy: string
}

/** Datos para crear una cota */
export interface CreateDimensionData {
  p1: Point3D
  p2: Point3D
  length: number
  unit: DimensionUnit
  label?: string
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
