/**
 * Configuración de líneas de producción disponibles en el módulo Análisis de Turno.
 *
 * Cada "línea" combina una planta física + tipo de proceso.
 * Determina qué datos Shoplogix cargar (plantSlug) y si hay datos
 * Grader Excel (P0%) disponibles.
 */

import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'

export type PlantLineId =
  | 'chonchi-eviscerado'  // Planta Principal — 3 Baaders 142
  | 'yal-eviscerado'      // Planta Yal — 3 Baaders 142
  | 'chonchi-filete'      // Planta Principal — Línea 1 Filetes (próx.)

export interface PlantLineConfig {
  id: PlantLineId
  /** Etiqueta corta para el tab strip */
  label: string
  /** Descripción para el subtítulo */
  description: string
  /** plantSlug para la ruta Firestore: shoplogix/{plantSlug}/shifts/... */
  plantSlug: PlantSlug
  /** Si true, el calendario carga graderDailySummaries (Excel Grader / P0%) */
  hasGraderData: boolean
  /** Si true, el carrusel carga datos Shoplogix para el timeline */
  shoplogixEnabled: boolean
  /** Si true, el tab se renderiza pero está deshabilitado (proximamente) */
  comingSoon?: boolean
}

export const PLANT_LINES: readonly PlantLineConfig[] = [
  {
    id: 'chonchi-eviscerado',
    label: 'P. Principal',
    description: 'Eviscerado · 3 Baaders',
    plantSlug: 'chonchi',
    hasGraderData: true,
    shoplogixEnabled: true,
  },
  {
    id: 'yal-eviscerado',
    label: 'Planta Yal',
    description: 'Eviscerado · 3 Baaders',
    plantSlug: 'yal',
    hasGraderData: true,   // El Excel de la Grader Yal tiene el mismo formato
    shoplogixEnabled: true,
  },
  {
    id: 'chonchi-filete',
    label: 'Filete',
    description: 'P. Principal · Línea 1',
    plantSlug: 'chonchi',
    hasGraderData: false,
    shoplogixEnabled: false,
    comingSoon: true,
  },
] as const

export const DEFAULT_PLANT_LINE_ID: PlantLineId = 'chonchi-eviscerado'

export function getPlantLineConfig(id?: PlantLineId | string | null): PlantLineConfig {
  return PLANT_LINES.find((l) => l.id === id) ?? PLANT_LINES[0]!
}
