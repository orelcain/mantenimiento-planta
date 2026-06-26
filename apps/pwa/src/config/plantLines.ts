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
  | 'acopio-general'      // Acopio — sin Grader/Shoplogix (captura manual, próx.)
  | 'riles-general'       // Riles — sin Grader/Shoplogix (captura manual, próx.)

/** Planta física (nivel 1 de las pestañas). Cada planta agrupa una o más áreas (PlantLineConfig). */
export type PlantId = 'principal' | 'yal' | 'acopio' | 'riles'

export interface PlantInfo {
  id: PlantId
  label: string
}

/** Plantas de nivel 1 en el orden de las pestañas. */
export const PLANTS: readonly PlantInfo[] = [
  { id: 'principal', label: 'Planta Principal' },
  { id: 'yal',       label: 'Planta Yal' },
  { id: 'acopio',    label: 'Acopio' },
  { id: 'riles',     label: 'Riles' },
] as const

export interface PlantLineConfig {
  id: PlantLineId
  /** Planta física a la que pertenece esta área (nivel 1 de las pestañas). */
  plant: PlantId
  /** Etiqueta del área (nivel 2 de las pestañas, ej. "Eviscerado", "Filete"). */
  areaLabel: string
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
   * Si true, la línea NO tiene Grader/Shoplogix: su único flujo es la
   * Captura Rápida de Intervención (voz→IA→`maintenanceLog`). Acopio / Riles.
   * El wizard oculta el grid Grader (upload/KPI/calendario) y muestra el
   * panel de captura.
   */
  manualCapture?: boolean
  /**
   * Nodo de jerarquía (tipo 'area') al que se asocian las intervenciones de
   * captura manual. Si se define, la captura puede ofrecer un selector de
   * equipos del área; si se omite, las intervenciones quedan a nivel de ÁREA
   * (equipmentId sintético `area:{id}`). Pendiente de linkear para Acopio/Riles.
   */
  areaNodeId?: string
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
    plant: 'principal',
    areaLabel: 'Eviscerado',
    label: 'P. Principal',
    description: 'Eviscerado · 3 Baaders',
    plantSlug: 'chonchi',
    hasGraderData: true,
    shoplogixEnabled: true,
    isClassificationPlant: true,   // Marelec MS4/12 con 12 gates por calibre+calidad
  },
  {
    id: 'yal-eviscerado',
    plant: 'yal',
    areaLabel: 'Eviscerado',
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
    plant: 'principal',
    areaLabel: 'Filete',
    label: 'Filete',
    description: 'P. Principal · Línea 1',
    plantSlug: 'chonchi',
    hasGraderData: false,
    shoplogixEnabled: false,
    comingSoon: true,
  },
  {
    id: 'acopio-general',
    plant: 'acopio',
    areaLabel: 'General',
    label: 'Acopio',
    description: 'Captura rápida de intervenciones',
    plantSlug: 'chonchi',         // placeholder — no se consulta (sin Grader/Shoplogix)
    hasGraderData: false,
    shoplogixEnabled: false,
    manualCapture: true,          // sin Grader/Shoplogix → panel de Captura Rápida
  },
  {
    id: 'riles-general',
    plant: 'riles',
    areaLabel: 'General',
    label: 'Riles',
    description: 'Captura rápida de intervenciones',
    plantSlug: 'chonchi',         // placeholder — no se consulta (sin Grader/Shoplogix)
    hasGraderData: false,
    shoplogixEnabled: false,
    manualCapture: true,          // sin Grader/Shoplogix → panel de Captura Rápida
  },
] as const

export const DEFAULT_PLANT_LINE_ID: PlantLineId = 'chonchi-eviscerado'

export function getPlantLineConfig(id?: PlantLineId | string | null): PlantLineConfig {
  return PLANT_LINES.find((l) => l.id === id) ?? PLANT_LINES[0]!
}

/** Planta (nivel 1) a la que pertenece una línea/área. */
export function getPlantOf(id?: PlantLineId | string | null): PlantId {
  return getPlantLineConfig(id).plant
}

/** Áreas (líneas) de una planta, en el orden declarado en PLANT_LINES. */
export function getAreasOfPlant(plant: PlantId): PlantLineConfig[] {
  return PLANT_LINES.filter((l) => l.plant === plant)
}

/** ¿Todas las áreas de la planta están "próximamente"? (planta deshabilitada). */
export function isPlantComingSoon(plant: PlantId): boolean {
  const areas = getAreasOfPlant(plant)
  return areas.length > 0 && areas.every((a) => a.comingSoon)
}

/** Área por defecto de una planta (la primera no-comingSoon, o la primera). */
export function getDefaultAreaOfPlant(plant: PlantId): PlantLineConfig | undefined {
  const areas = getAreasOfPlant(plant)
  return areas.find((a) => !a.comingSoon) ?? areas[0]
}
