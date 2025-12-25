/**
 * Sistema de Jerarquías Anidadas - 8 Niveles
 * 
 * Estructura organizacional para ubicación de incidencias
 * sin dependencia del mapa geográfico.
 * 
 * Niveles:
 * 1. Empresa (raíz)
 * 2. Área
 * 3. Sub-área
 * 4. Sistema
 * 5. Sub-sistema
 * 6. Sección
 * 7. Sub-sección
 * 8. Elemento (detalle contextual)
 */

import { Timestamp } from 'firebase/firestore'

// Enum para niveles jerárquicos
export enum HierarchyLevel {
  EMPRESA = 1,
  AREA = 2,
  SUB_AREA = 3,
  SISTEMA = 4,
  SUB_SISTEMA = 5,
  SECCION = 6,
  SUB_SECCION = 7,
  ELEMENTO = 8,
}

// Nombres descriptivos de cada nivel
export const HIERARCHY_LEVEL_NAMES: Record<HierarchyLevel, string> = {
  [HierarchyLevel.EMPRESA]: 'Empresa',
  [HierarchyLevel.AREA]: 'Área',
  [HierarchyLevel.SUB_AREA]: 'Sub-área',
  [HierarchyLevel.SISTEMA]: 'Sistema',
  [HierarchyLevel.SUB_SISTEMA]: 'Sub-sistema',
  [HierarchyLevel.SECCION]: 'Sección',
  [HierarchyLevel.SUB_SECCION]: 'Sub-sección',
  [HierarchyLevel.ELEMENTO]: 'Elemento',
}

// Estructura base de un nodo jerárquico
export interface HierarchyNode {
  id: string
  nombre: string
  codigo: string // Código único alfanumérico (ej: "PROD-001", "ALM-002")
  nivel: HierarchyLevel
  parentId: string | null // null para nivel 1 (empresa)
  path: string[] // Array de IDs desde raíz hasta este nodo (ej: ["empresa-1", "area-2", "sistema-3"])
  orden: number // Para ordenar hermanos
  activo: boolean
  descripcion?: string
  metadata?: Record<string, any> // Datos adicionales específicos del nivel
  creadoPor: string
  creadoEn: Timestamp
  actualizadoEn: Timestamp
}

// Nodo con hijos (para renderizar árbol)
export interface HierarchyNodeWithChildren extends HierarchyNode {
  children: HierarchyNodeWithChildren[]
}

// Path completo con nombres (para breadcrumbs)
export interface HierarchyPath {
  id: string
  nombre: string
  codigo: string
  nivel: HierarchyLevel
}

// Datos para crear un nuevo nodo
export interface CreateHierarchyNodeInput {
  nombre: string
  codigo: string
  nivel: HierarchyLevel
  parentId: string | null
  descripcion?: string
  metadata?: Record<string, any>
}

// Datos para actualizar un nodo
export interface UpdateHierarchyNodeInput {
  nombre?: string
  codigo?: string
  descripcion?: string
  activo?: boolean
  metadata?: Record<string, any>
}

// Filtros para búsqueda de nodos
export interface HierarchyFilters {
  nivel?: HierarchyLevel
  parentId?: string | null
  activo?: boolean
  search?: string // Buscar por nombre o código
}

// Estadísticas por nivel
export interface HierarchyStats {
  nivel: HierarchyLevel
  total: number
  activos: number
  inactivos: number
}

// Configuración de la empresa (nivel 1)
export const DEFAULT_COMPANY_NODE: Omit<CreateHierarchyNodeInput, 'nivel' | 'parentId'> = {
  nombre: 'Aquachile Antarfood Chonchi',
  codigo: 'AAC-001',
  descripcion: 'Planta principal de procesamiento',
  metadata: {
    ubicacion: 'Chonchi, Chile',
    tipo: 'Planta de Producción',
  },
}

// Validación de niveles
export function isValidHierarchyLevel(nivel: number): nivel is HierarchyLevel {
  return nivel >= HierarchyLevel.EMPRESA && nivel <= HierarchyLevel.ELEMENTO
}

// Validar que un nodo puede tener hijos
export function canHaveChildren(nivel: HierarchyLevel): boolean {
  return nivel < HierarchyLevel.ELEMENTO
}

// Obtener nivel siguiente
export function getNextLevel(nivel: HierarchyLevel): HierarchyLevel | null {
  if (nivel >= HierarchyLevel.ELEMENTO) return null
  return (nivel + 1) as HierarchyLevel
}

// Obtener nivel anterior
export function getPreviousLevel(nivel: HierarchyLevel): HierarchyLevel | null {
  if (nivel <= HierarchyLevel.EMPRESA) return null
  return (nivel - 1) as HierarchyLevel
}

// Formatear path como string legible
export function formatHierarchyPath(paths: HierarchyPath[]): string {
  return paths.map(p => `${HIERARCHY_LEVEL_NAMES[p.nivel]}: ${p.nombre}`).join(' > ')
}

// Formatear path corto (solo nombres)
export function formatShortPath(paths: HierarchyPath[]): string {
  return paths.map(p => p.nombre).join(' / ')
}

// Validar código único (formato: XXX-NNN)
export function isValidHierarchyCode(codigo: string): boolean {
  return /^[A-Z0-9]{2,5}-\d{3,6}$/.test(codigo)
}

// Generar código automático basado en nivel y parent
export function generateHierarchyCode(
  nivel: HierarchyLevel,
  parentCode?: string,
  sequence?: number
): string {
  const prefixes: Record<HierarchyLevel, string> = {
    [HierarchyLevel.EMPRESA]: 'EMP',
    [HierarchyLevel.AREA]: 'ARE',
    [HierarchyLevel.SUB_AREA]: 'SUB',
    [HierarchyLevel.SISTEMA]: 'SIS',
    [HierarchyLevel.SUB_SISTEMA]: 'SSI',
    [HierarchyLevel.SECCION]: 'SEC',
    [HierarchyLevel.SUB_SECCION]: 'SSE',
    [HierarchyLevel.ELEMENTO]: 'ELE',
  }

  const prefix = prefixes[nivel]
  const seq = sequence ?? Math.floor(Math.random() * 1000)
  const paddedSeq = seq.toString().padStart(3, '0')

  if (parentCode && nivel > HierarchyLevel.EMPRESA) {
    return `${parentCode}-${prefix}${paddedSeq}`
  }

  return `${prefix}-${paddedSeq}`
}

// Constantes de validación
export const HIERARCHY_CONSTRAINTS = {
  MIN_NOMBRE_LENGTH: 3,
  MAX_NOMBRE_LENGTH: 100,
  MIN_CODIGO_LENGTH: 5,
  MAX_CODIGO_LENGTH: 20,
  MAX_DESCRIPCION_LENGTH: 500,
  MAX_PATH_DEPTH: 8,
  MIN_REQUIRED_LEVEL_FOR_INCIDENT: HierarchyLevel.SUB_AREA, // Las incidencias requieren mínimo nivel 3
} as const
