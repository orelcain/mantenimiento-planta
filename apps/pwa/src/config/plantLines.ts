/**
 * Configuración de líneas de producción disponibles en el módulo Análisis de Turno.
 *
 * Cada "línea" combina una planta física + tipo de proceso.
 * Determina qué datos Shoplogix cargar (plantSlug) y si hay datos
 * Grader Excel (P0%) disponibles.
 */

import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { GraderShiftSchedule } from '@/services/grader/types'

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
  /**
   * Horarios de turno por defecto para esta planta.
   * Si se omite, se usa DEFAULT_SHIFT_SCHEDULE (Chonchi: día 07-19, noche 19-07).
   * Se usa como fallback cuando no hay config guardada en Firestore para la planta.
   */
  defaultShiftSchedule?: GraderShiftSchedule[]
  /**
   * Si true (default), la planta clasifica producto en 12 gates por
   * calibre+calidad (Marelec MS4/12 de Chonchi). Si false, es una planta
   * de eviscerado simplificado (Yal) donde las "gates" son solo las que
   * alimentan las Baaders y no hay clasificación por calidad.
   *
   * Cuando false, el TurnoPage oculta:
   *   - ActionPlanPanel (sugerencias IA hardcoded para Chonchi)
   *   - ShiftConfigPanel (config 12 gates)
   *   - GateEvolutionChart + GateChangeImpactCard
   * Y muestra un banner explicando el flujo simplificado.
   */
  isClassificationPlant?: boolean
}

export const PLANT_LINES: readonly PlantLineConfig[] = [
  {
    id: 'chonchi-eviscerado',
    label: 'P. Principal',
    description: 'Eviscerado · 3 Baaders',
    plantSlug: 'chonchi',
    hasGraderData: true,
    shoplogixEnabled: true,
    isClassificationPlant: true,   // Marelec MS4/12 con 12 gates por calibre+calidad
  },
  {
    id: 'yal-eviscerado',
    label: 'Planta Yal',
    description: 'Eviscerado · 3 Baaders',
    plantSlug: 'yal',
    hasGraderData: true,   // El Excel de la Grader Yal tiene el mismo formato
    shoplogixEnabled: true,
    isClassificationPlant: false,  // Yal solo eviscera, no clasifica. Las gates del
                                   // Excel son las que alimentan las 3 Baaders.
    // Yal opera con 3 turnos en Shoplogix (T1/T2/T3) además de los labels del Grader.
    // Horarios confirmados en Shoplogix UI (1 May 2026):
    //   Turno 1:   07:45 – 15:15  (mañana)
    //   Turno 2:   15:15 – 00:00  (tarde, llega a medianoche)
    //   Turno 3:   23:00 – 07:45  (noche, cruza medianoche)
    //   Turno 3*:  variante 23:00 – 06:15 (mismo bound efectivo, segundo "Turno 3")
    // Mantener entries de "Turno día/noche" para compatibilidad con Grader Excel.
    defaultShiftSchedule: [
      { shiftId: 'Turno día',   startHour: 7,  startMinute: 0,  endHour: 14, endMinute: 45 },
      { shiftId: 'Turno noche', startHour: 14, startMinute: 45, endHour: 0,  endMinute: 0  },
      { shiftId: 'Turno 1',     startHour: 7,  startMinute: 45, endHour: 15, endMinute: 15 },
      { shiftId: 'Turno 2',     startHour: 15, startMinute: 15, endHour: 0,  endMinute: 0  },
      { shiftId: 'Turno 3',     startHour: 23, startMinute: 0,  endHour: 7,  endMinute: 45 },
    ],
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
