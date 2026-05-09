/**
 * Helpers de DISPLAY de turnos — convención calendárica vs convención CF.
 *
 * El Cloud Function de Shoplogix sync guarda los shifts en Firestore con la
 * convención del "día laboral" (08:00→08:00). Esto significa que:
 *
 *   - Turno 1 (07:45–14:45) → dateKey = día calendárico ✓ (coincide)
 *   - Turno 2 (14:45–00:00) → dateKey = día calendárico ✓ (coincide)
 *   - Turno 3 (00:00–07:45) → dateKey = día anterior ❌ (NO coincide)
 *
 * Shoplogix UI, en cambio, usa la convención calendárica: el Turno 3 cuyo
 * horario real es 00:00–07:45 del 27 de abril se llama "Turno 3 del 27 abril",
 * pero en nuestro Firestore está guardado como `2026-04-26_Turno 3`.
 *
 * Estos helpers ALINEAN el display con Shoplogix sin tocar el data layer:
 * la URL, la clave Firestore y la lógica de carga conservan la convención CF
 * (dateKey = día anterior para Turno 3). Solo el display visible al usuario
 * (etiquetas, agrupación visual en el calendario) usa la convención calendárica.
 */

/**
 * Convierte un (dateKey, shiftId) almacenado en Firestore al "día visual"
 * en que el turno ocurre realmente según el calendario.
 *
 * - Turno 3 con dateKey=X → display dateKey = X+1 (madrugada del día siguiente CF)
 * - Cualquier otro shift → display dateKey = X (sin cambio)
 *
 * @example
 *   getShiftDisplayDateKey('2026-04-26', 'Turno 3') // → '2026-04-27'
 *   getShiftDisplayDateKey('2026-04-26', 'Turno 2') // → '2026-04-26'
 */
export function getShiftDisplayDateKey(dateKey: string, shiftId: string): string {
  if (!isMidnightShift(shiftId)) return dateKey
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Inversa de `getShiftDisplayDateKey`: dado el día visual y un shiftId, devuelve
 * el dateKey CF que se debe usar para consultar Firestore.
 *
 * - Día visual Y, shiftId='Turno 3' → CF dateKey = Y-1
 * - Día visual Y, otros shifts       → CF dateKey = Y
 *
 * Útil cuando el usuario selecciona un día visual y queremos cargar los turnos
 * que pertenecen a ese día calendáricamente.
 */
export function getCfDateKeyForDisplayDay(displayDay: string, shiftId: string): string {
  if (!isMidnightShift(shiftId)) return displayDay
  const d = new Date(`${displayDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Detecta si un shiftId corresponde a un turno que cruza la medianoche EMPEZANDO
 * a las 00:00 (es decir, una "madrugada" cuyo dateKey CF apunta al día anterior).
 *
 * Por ahora hardcodeado a "Turno 3" (la convención de Yal en Shoplogix). Si en
 * el futuro otras plantas tienen otros nombres, esto se extiende leyendo la
 * config de plantLines.
 */
export function isMidnightShift(shiftId: string): boolean {
  return shiftId === 'Turno 3'
}

/**
 * Suma N días a un dateKey YYYY-MM-DD. Usa UTC noon para evitar saltos por DST.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Para un shift identificado por (dateKey, shiftId) almacenado en Firestore,
 * devuelve el día visual al que pertenece según la convención calendárica
 * (alineada con Shoplogix UI).
 *
 * Equivalente a `getShiftDisplayDateKey` pero con un nombre que enfatiza la
 * intención semántica (visual-day vs CF-day).
 */
export function visualDayForCfShift(cfDateKey: string, shiftId: string): string {
  return getShiftDisplayDateKey(cfDateKey, shiftId)
}

/**
 * Para un día visual Y, devuelve el par de dateKeys CF que se deben consultar
 * para encontrar todos los shifts que pertenecen visualmente a ese día:
 *
 *   - T1, T2, "Turno día", "Turno noche": dateKey CF = Y
 *   - Turno 3:                            dateKey CF = Y - 1
 *
 * Útil para construir las claves del Map slxByShift (que tiene formato
 * `${dateKeyCF}__${shiftId}`) sabiendo solo el día visual.
 */
export function cfKeysForVisualDay(visualDay: string): {
  ownDay: string       // visualDay
  prevDay: string      // visualDay - 1 (donde están los Turno 3 del día visual)
} {
  return {
    ownDay:  visualDay,
    prevDay: addDaysToDateKey(visualDay, -1),
  }
}

/**
 * Construye la clave Firestore `${dateKeyCF}__${shiftId}` correcta para un
 * shift que se quiere mostrar visualmente bajo el día `visualDay`.
 */
export function slxKeyForVisualShift(visualDay: string, shiftId: string): string {
  const cfDateKey = getCfDateKeyForDisplayDay(visualDay, shiftId)
  return `${cfDateKey}__${shiftId}`
}

// ============================================================================
// CONVENCIÓN UNIFICADA DE DENOMINACIÓN + ICONOS POR SHIFT
// ============================================================================
// Todos los componentes que muestren un turno al usuario deben usar
// `getShiftMeta(shiftId)` para evitar mezclas tipo "Turno día" + "T1" + iconos
// distintos en distintas vistas.
//
// Convención de períodos:
//   - mañana      (06–12) → Sun (amber)
//   - tarde       (12–19) → Sunset (orange)
//   - noche       (19–07) → Moon (indigo)
//   - dia         → Sun (amber) — Excel "Turno día" o T1+T2 sumados
//   - noche-corta → Moon (indigo) — Excel "Turno noche" sin precisar T3
//
// Mapeo de shiftId → período + label + shortLabel:
//   Turno 1     → mañana      | "Turno 1 — Mañana"  | "T1"
//   Turno 2     → tarde       | "Turno 2 — Tarde"   | "T2"
//   Turno 3     → noche       | "Turno 3 — Noche"   | "T3"
//   Turno día   → dia         | "Turno día"         | "Día"
//   Turno noche → noche-corta | "Turno noche"       | "Noche"

export type ShiftPeriod = 'mañana' | 'tarde' | 'noche' | 'dia' | 'noche-corta' | 'desconocido'

export interface ShiftMeta {
  /** Label completo para tooltips/desktop ("Turno 1 — Mañana") */
  label: string
  /** Label corto para badges/mobile ("T1", "Día", "Noche") */
  shortLabel: string
  /** Período conceptual del turno (driver para color e ícono) */
  period: ShiftPeriod
  /** Tailwind class para color de texto del ícono y badges */
  textColorClass: string
  /** Tailwind class para fondo sutil de chips/cards */
  bgColorClass: string
  /** Tailwind class para borde sutil */
  borderColorClass: string
  /** Nombre de icon component de lucide-react (importar el ícono donde se use) */
  iconName: 'Sun' | 'Sunset' | 'Moon' | 'Sunrise' | 'Clock'
  /** Emoji equivalente (solo para tooltips o casos sin import de iconos) */
  emoji: string
  /** Si este turno suma al "día" (T1, T2, Turno día) o a la "noche" (T3, Turno noche) */
  isDayLike: boolean
  /** Descripción horaria típica (Yal) */
  scheduleHint: string
}

const SHIFT_META_TABLE: Record<string, ShiftMeta> = {
  'Turno 1': {
    label: 'Turno 1 — Mañana',
    shortLabel: 'T1',
    period: 'mañana',
    textColorClass: 'text-amber-400',
    bgColorClass: 'bg-amber-500/10',
    borderColorClass: 'border-amber-500/30',
    iconName: 'Sun',
    emoji: '☀',
    isDayLike: true,
    scheduleHint: '07:45–14:45',
  },
  'Turno 2': {
    label: 'Turno 2 — Tarde',
    shortLabel: 'T2',
    period: 'tarde',
    textColorClass: 'text-orange-400',
    bgColorClass: 'bg-orange-500/10',
    borderColorClass: 'border-orange-500/30',
    iconName: 'Sunset',
    emoji: '🌅',
    isDayLike: true,
    scheduleHint: '14:45–00:00',
  },
  'Turno 3': {
    label: 'Turno 3 — Noche',
    shortLabel: 'T3',
    period: 'noche',
    textColorClass: 'text-indigo-400',
    bgColorClass: 'bg-indigo-500/10',
    borderColorClass: 'border-indigo-500/30',
    iconName: 'Moon',
    emoji: '🌙',
    isDayLike: false,
    scheduleHint: '23:00–07:45',
  },
  'Turno día': {
    label: 'Turno día',
    shortLabel: 'Día',
    period: 'dia',
    textColorClass: 'text-amber-400',
    bgColorClass: 'bg-amber-500/10',
    borderColorClass: 'border-amber-500/30',
    iconName: 'Sun',
    emoji: '☀',
    isDayLike: true,
    scheduleHint: '07:45–00:00',
  },
  'Turno noche': {
    label: 'Turno noche',
    shortLabel: 'Noche',
    period: 'noche-corta',
    textColorClass: 'text-indigo-400',
    bgColorClass: 'bg-indigo-500/10',
    borderColorClass: 'border-indigo-500/30',
    iconName: 'Moon',
    emoji: '🌙',
    isDayLike: false,
    scheduleHint: '23:00–07:45',
  },
}

const FALLBACK_META: ShiftMeta = {
  label: 'Turno desconocido',
  shortLabel: '?',
  period: 'desconocido',
  textColorClass: 'text-muted-foreground',
  bgColorClass: 'bg-muted/20',
  borderColorClass: 'border-muted-foreground/30',
  iconName: 'Clock',
  emoji: '⏱',
  isDayLike: false,
  scheduleHint: '',
}

/**
 * Helper canónico para obtener metadata de display de un turno. Cualquier
 * componente que muestre etiqueta o ícono de un turno debe usar esto en
 * lugar de hardcodear strings/iconos. Soporta legacy ("Turno día/noche")
 * y nuevo formato Shoplogix ("Turno 1/2/3").
 */
export function getShiftMeta(shiftId: string): ShiftMeta {
  return SHIFT_META_TABLE[shiftId] ?? FALLBACK_META
}

/** Atajo: solo el label corto ("T1", "Día", "Noche"). */
export function shortShiftLabel(shiftId: string): string {
  return getShiftMeta(shiftId).shortLabel
}

/** Atajo: solo el label completo ("Turno 1 — Mañana"). */
export function fullShiftLabel(shiftId: string): string {
  return getShiftMeta(shiftId).label
}

/** Atajo: si este shift cuenta como "día" para agregaciones D/N. */
export function isShiftDayLike(shiftId: string): boolean {
  return getShiftMeta(shiftId).isDayLike
}
