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
  | 'chonchi-empaque'     // Planta Principal — Empaque (captura manual)
  | 'acopio-general'      // Acopio — sin Grader/Shoplogix (captura manual)
  | 'riles-general'       // Riles — sin Grader/Shoplogix (captura manual)
  | 'exteriores-agua-mar' // Exteriores — sistema agua de mar (caseta mar → estanques)

/** Planta física (nivel 1 de las pestañas). Cada planta agrupa una o más áreas (PlantLineConfig). */
export type PlantId = 'principal' | 'yal' | 'acopio' | 'riles' | 'exteriores'

export interface PlantInfo {
  id: PlantId
  label: string
}

/** Plantas de nivel 1 en el orden de las pestañas. */
export const PLANTS: readonly PlantInfo[] = [
  { id: 'principal',  label: 'Planta Principal' },
  { id: 'yal',        label: 'Planta Yal' },
  { id: 'acopio',     label: 'Acopio' },
  { id: 'riles',      label: 'Riles' },
  { id: 'exteriores', label: 'Exteriores' },
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
  /**
   * Cómo se llaman en la UI las máquinas Shoplogix de esta línea.
   * `short` se usa en mobile y `long` en tooltips. Sin esto, los textos quedaban
   * hardcodeados a "Evisceradora Baader 142" / "Ev", que es falso en Filete.
   */
  machineKind?: { short: string; long: string }
  /**
   * Piezas que planta PIDE por turno en esta línea. Es un target de
   * PLANIFICACIÓN (lo define producción), distinto del target de cadencia que
   * reporta el sensor: sirve para medir cumplimiento del turno cuando Shoplogix
   * no manda target oficial — que es el caso de Filete.
   */
  shiftTargetPieces?: number
  /**
   * Etapas del área que NO están instrumentadas en Shoplogix, para ofrecerlas en
   * la captura manual de paros. Sin esto la lista mostraba siempre las etapas
   * del eviscerado (Bombeo, Chiller, Grader…), que en Filete no existen.
   */
  stagesWithoutSensor?: readonly string[]
  /**
   * Nota de alcance del panel de KPIs (qué mide realmente el OEE de esta línea).
   * Honestidad de alcance: el OEE es de las máquinas instrumentadas, no del área.
   */
  kpiScopeNote?: string
}

/** Nombre de máquina por defecto (líneas de eviscerado). */
const DEFAULT_MACHINE_KIND = { short: 'Ev', long: 'Evisceradora Baader 142' } as const

export function getMachineKind(id?: PlantLineId | string | null): { short: string; long: string } {
  return getPlantLineConfig(id).machineKind ?? DEFAULT_MACHINE_KIND
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
    // FALLBACK de horarios — la VERDAD son los scheduledStart/End de los docs
    // Shoplogix sincronizados (los horarios los define Shoplogix y CAMBIAN).
    // Chonchi dejó de emitir "Turno día/noche": desde 2026-05 emite
    // Turno 1 (21:30–05:45), Turno 2 (09:00–17:15 u 08:00–15:15) y
    // "Turno 1 Lunes" (madrugada del lunes). Se mantienen día/noche como
    // ventanas anchas para clasificar el Excel del Grader.
    defaultShiftSchedule: [
      { shiftId: 'Turno día',     startHour: 7,  startMinute: 0,  endHour: 19, endMinute: 0  },
      { shiftId: 'Turno noche',   startHour: 19, startMinute: 0,  endHour: 7,  endMinute: 0  },
      { shiftId: 'Turno 1',       startHour: 21, startMinute: 30, endHour: 5,  endMinute: 45 },
      { shiftId: 'Turno 1 Lunes', startHour: 0,  startMinute: 0,  endHour: 7,  endMinute: 0  },
      { shiftId: 'Turno 2',       startHour: 9,  startMinute: 0,  endHour: 17, endMinute: 15 },
    ],
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
    // FALLBACK de horarios — la VERDAD son los scheduledStart/End de los docs
    // Shoplogix sincronizados (los horarios los define Shoplogix y CAMBIAN;
    // p.ej. el T2 de Yal ha arrancado 14:45, 15:15 y 16:15 según el día, y el
    // T3 pasó de 23:00–07:45 a 00:00–~07:00; el T1 no se emite desde mayo).
    // Valores = última realidad observada (2026-07). Mantener entries de
    // "Turno día/noche" para compatibilidad con Grader Excel.
    defaultShiftSchedule: [
      { shiftId: 'Turno día',   startHour: 7,  startMinute: 0,  endHour: 14, endMinute: 45 },
      { shiftId: 'Turno noche', startHour: 14, startMinute: 45, endHour: 0,  endMinute: 0  },
      { shiftId: 'Turno 1',     startHour: 7,  startMinute: 45, endHour: 15, endMinute: 15 },
      { shiftId: 'Turno 2',     startHour: 14, startMinute: 45, endHour: 0,  endMinute: 0  },
      { shiftId: 'Turno 3',     startHour: 0,  startMinute: 0,  endHour: 7,  endMinute: 0  },
    ],
  },
  {
    // Filetes (areaid 8181 en Shoplogix) — una sola máquina instrumentada
    // ("Linea 1"). No hay Grader acá: no existe Excel ni P0%, así que la
    // Calidad del OEE no aplica y el KPI board queda en A·P.
    id: 'chonchi-filete',
    plant: 'principal',
    areaLabel: 'Filete',
    label: 'Filete',
    description: 'P. Principal · Línea 1',
    plantSlug: 'filete',           // doc Firestore `shoplogix/filete`
    hasGraderData: false,
    shoplogixEnabled: true,
    isClassificationPlant: false,  // sin clasificación por calibre/calidad
    machineKind: { short: 'B200', long: 'Baader 200 · Línea 1 de Filete' },
    // Planta pide ~5.000 piezas por turno, en 2 turnos (dato de producción,
    // 2026-07-30). Los horarios los define Shoplogix, así que no se fijan acá.
    shiftTargetPieces: 5000,
    // La GEA es la etapa grande sin integración: sus paros solo existen si
    // alguien los registra.
    stagesWithoutSensor: ['GEA', 'Cinta de entrada', 'Cinta de salida', 'Enzunchadora', 'Empaque filete'],
    kpiScopeNote:
      'Alcance: la Baader 200 de Línea 1 (única máquina instrumentada en Shoplogix). La GEA todavía no tiene integración y el Filete no pasa por Grader: la Calidad no aplica.',
    // FALLBACK de horarios — la VERDAD son los scheduledStart/End que emite
    // Shoplogix (scheduleSource='shoplogix'). Se copian los de Chonchi porque
    // Filete corre dentro de la misma jornada de la planta principal; en cuanto
    // haya turnos reales sincronizados, esto deja de usarse.
    defaultShiftSchedule: [
      { shiftId: 'Turno día',     startHour: 7,  startMinute: 0,  endHour: 19, endMinute: 0  },
      { shiftId: 'Turno noche',   startHour: 19, startMinute: 0,  endHour: 7,  endMinute: 0  },
      { shiftId: 'Turno 1',       startHour: 21, startMinute: 30, endHour: 5,  endMinute: 45 },
      { shiftId: 'Turno 1 Lunes', startHour: 0,  startMinute: 0,  endHour: 7,  endMinute: 0  },
      { shiftId: 'Turno 2',       startHour: 9,  startMinute: 0,  endHour: 17, endMinute: 15 },
    ],
  },
  {
    id: 'chonchi-empaque',
    plant: 'principal',
    areaLabel: 'Empaque',
    label: 'Empaque',
    description: 'Captura rápida de intervenciones',
    plantSlug: 'chonchi',         // placeholder — sin Grader/Shoplogix
    hasGraderData: false,
    shoplogixEnabled: false,
    manualCapture: true,
    areaNodeId: 'aq-in-cho-pcho-proc-empq', // nodo 'area' EMPAQUE (11 equipos: empacadora, glaseador…)
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
    areaNodeId: 'aq-in-cho-acop', // nodo 'area' ACOPIO (13 equipos) → selector de equipo
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
    areaNodeId: 'aq-in-cho-exte-pril', // nodo 'area' PLANTA RILES (14 equipos) → selector de equipo
  },
  {
    // Sistema de agua de mar: caseta mar (bombas AM 1/2) → estanque inox → estanque 4 agua salada.
    // Caseta Mar vive en la jerarquía bajo Acopio; acá la exponemos como su propia área de Exteriores.
    id: 'exteriores-agua-mar',
    plant: 'exteriores',
    areaLabel: 'Agua de Mar',
    label: 'Agua de Mar',
    description: 'Caseta mar → estanques agua salada',
    plantSlug: 'chonchi',         // placeholder — sin Grader/Shoplogix
    hasGraderData: false,
    shoplogixEnabled: false,
    manualCapture: true,
    areaNodeId: 'aq-in-cho-acop-caam', // nodo 'area' CASETA AGUA MAR (Bomba Agua Mar 1/2)
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

/**
 * Etiqueta legible del área para títulos: "P. Principal · Eviscerado". Cuando
 * `label` y `areaLabel` coinciden (Filete) no se duplica el nombre.
 */
export function getAreaDisplayLabel(id?: PlantLineId | string | null): string {
  const cfg = getPlantLineConfig(id)
  return cfg.label === cfg.areaLabel ? cfg.areaLabel : `${cfg.label} · ${cfg.areaLabel}`
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
