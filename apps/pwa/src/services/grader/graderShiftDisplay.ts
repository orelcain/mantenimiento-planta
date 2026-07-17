/**
 * Helpers de DISPLAY de turnos.
 *
 * HISTORIA: una versión temprana del CF derivaba el dateKey desde la VENTANA
 * de consulta (08:00→08:00), lo que dejaba al Turno 3 (madrugada) guardado
 * bajo el día anterior, y estos helpers desplazaban su día visual +1 para
 * alinear con Shoplogix UI. El CF se corrigió (`shiftDateKeyFromStart`:
 * dateKey = día calendario donde ARRANCA el turno) y los datos viejos se
 * re-backfillearon.
 *
 * VERIFICADO contra Firestore prod (2026-07-07, ambas plantas, desde el
 * primer doc 2026-04-24 hasta hoy): TODOS los docs `Turno 3` tienen
 * scheduledStart 00:00 del MISMO día de su dateKey. La "era legacy"
 * (dateKey = día-1) NO existe en los datos → ya no se desplaza nada.
 * Seguir desplazando mostraba cada T3 bajo el día equivocado (+1).
 *
 * Los helpers se conservan como puntos de paso (hoy identidad) por si algún
 * día reaparece data con otra convención.
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
  if (!isMidnightShift(shiftId, dateKey)) return dateKey
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
  const d = new Date(`${displayDay}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  const prevDay = d.toISOString().slice(0, 10)
  return isMidnightShift(shiftId, prevDay) ? prevDay : displayDay
}

/**
 * ¿Este (shiftId, dateKey CF) está guardado bajo el día ANTERIOR al que
 * ocurre visualmente?
 *
 * Respuesta actual: NUNCA. Verificado contra Firestore prod (2026-07-07,
 * ambas plantas, todo el histórico existente desde 2026-04-24): el dateKey
 * de TODOS los docs (incluido Turno 3) es el día calendario donde arranca el
 * turno (`shiftDateKeyFromStart` en el CF). El desplazamiento +1 que hacía
 * esta función databa de una convención vieja del CF cuyos docs ya no existen
 * — mantenerlo mostraba cada Turno 3 bajo el día equivocado.
 *
 * Se conserva la firma (con `cfDateKey` opcional) como punto de paso por si
 * reaparece data con otra convención.
 */
export function isMidnightShift(_shiftId: string, _cfDateKey?: string): boolean {
  return false
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
    scheduleHint: '00:00–07:00',
  },
  // Variante que Shoplogix emite en chonchi los lunes (madrugada 00:00→~07:00).
  // El nombre y horario los define Shoplogix — no asumir que la lista es fija.
  'Turno 1 Lunes': {
    label: 'Turno 1 Lunes — Madrugada',
    shortLabel: 'T1L',
    period: 'noche',
    textColorClass: 'text-indigo-400',
    bgColorClass: 'bg-indigo-500/10',
    borderColorClass: 'border-indigo-500/30',
    iconName: 'Sunrise',
    emoji: '🌄',
    isDayLike: false,
    scheduleHint: '00:00–07:00 (lunes)',
  },
  // Producción que Shoplogix registró SIN turno asignado (turno no configurado
  // en Shoplogix para esa ventana — caso real: pesca nocturna del domingo
  // 2026-07-05 en Yal, 11.6k ciclos). Se muestra FIEL, nunca disfrazado de
  // un turno con nombre (decisión PR #157).
  'Unscheduled': {
    label: 'Sin turno asignado',
    shortLabel: 'S/T',
    period: 'desconocido',
    textColorClass: 'text-slate-300',
    bgColorClass: 'bg-slate-500/10',
    borderColorClass: 'border-slate-500/30',
    iconName: 'Clock',
    emoji: '⏱',
    isDayLike: false,
    scheduleHint: 'ventana sin turno configurado',
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
/**
 * Deriva el período conceptual desde la hora de INICIO real del turno.
 * Convención documentada arriba: mañana 06–12 · tarde 12–19 · noche/madrugada
 * el resto (19–06). La madrugada (00–06) cuenta como "noche".
 */
function periodFromStartHour(hour: number): 'mañana' | 'tarde' | 'noche' {
  if (hour >= 6 && hour < 12) return 'mañana'
  if (hour >= 12 && hour < 19) return 'tarde'
  return 'noche'
}

/** Campos VISUALES por período (ícono/color/emoji) — misma paleta que SHIFT_META_TABLE. */
const VISUAL_BY_PERIOD: Record<'mañana' | 'tarde' | 'noche',
  Pick<ShiftMeta, 'period' | 'textColorClass' | 'bgColorClass' | 'borderColorClass' | 'iconName' | 'emoji' | 'isDayLike'>> = {
  'mañana': { period: 'mañana', textColorClass: 'text-amber-400',  bgColorClass: 'bg-amber-500/10',  borderColorClass: 'border-amber-500/30',  iconName: 'Sun',    emoji: '☀',  isDayLike: true  },
  'tarde':  { period: 'tarde',  textColorClass: 'text-orange-400', bgColorClass: 'bg-orange-500/10', borderColorClass: 'border-orange-500/30', iconName: 'Sunset', emoji: '🌅', isDayLike: true  },
  'noche':  { period: 'noche',  textColorClass: 'text-indigo-400', bgColorClass: 'bg-indigo-500/10', borderColorClass: 'border-indigo-500/30', iconName: 'Moon',   emoji: '🌙', isDayLike: false },
}

/**
 * Metadata de display de un turno.
 *
 * @param shiftId — nombre que emite Shoplogix ("Turno 1/2/3", "Turno día/noche",
 *   "Turno 1 Lunes", "Unscheduled"). Determina label/shortLabel (fieles a Shoplogix).
 * @param scheduledStart — horario REAL de inicio del turno (wall-clock-as-UTC).
 *   Cuando se pasa y es válido, el PERÍODO/ícono/color/emoji se derivan de la HORA
 *   real, no del nombre. Necesario porque Shoplogix REUSA nombres para horarios
 *   distintos (caso real Yal 2026-07-08: la madrugada 00:00–06:45 vino como
 *   "Turno 1" — sin este fix la app la pintaba "mañana ☀ 07:45–14:45", mintiendo).
 *   El label sigue diciendo "Turno 1" (fiel a Shoplogix) pero con 🌙 noche.
 *   Si se omite o es inválido → cae a la tabla por nombre (comportamiento previo).
 */
export function getShiftMeta(shiftId: string, scheduledStart?: string | Date | null): ShiftMeta {
  const base = SHIFT_META_TABLE[shiftId] ?? FALLBACK_META
  if (scheduledStart == null) return base
  const d = scheduledStart instanceof Date ? scheduledStart : new Date(scheduledStart)
  if (isNaN(d.getTime())) return base
  // Hora en UTC porque los scheduledStart se guardan wall-clock-as-UTC (hora de
  // pizarra con sufijo .000Z — ver graderShiftStatus.ts). NO usar getHours() local.
  const hour = d.getUTCHours()
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    ...base,
    ...VISUAL_BY_PERIOD[periodFromStartHour(hour)],
    // scheduleHint honesto: hora real de inicio (el rango del nombre mentía).
    scheduleHint: `desde ${pad(hour)}:${pad(d.getUTCMinutes())}`,
  }
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

// ============================================================================
// UMBRAL DE RUIDO PARA TURNOS SHOPLOGIX
// ============================================================================
// Un turno productivo real procesa cientos a decenas de miles de ciclos
// Baader. Cualquier turno con menos de SLX_NOISE_THRESHOLD ciclos es ruido:
// estados Unscheduled mal taggeados, paros con algún ciclo aislado, datos
// residuales pre-startup, etc.
//
// IMPORTANTE: cualquier UI que muestre datos SLX al usuario (chips,
// badges, cards, panels mensuales) DEBE filtrar con esta constante para
// evitar mostrar "D 4" o "Mejor turno · 5 cic" como si fueran datos reales.
//
// Alineado con UNSCHEDULED_MIN_CYCLES en shoplogixShift.service.ts.

export const SLX_NOISE_THRESHOLD = 50

/**
 * Umbral de "baja actividad". Turnos con ciclos entre SLX_NOISE_THRESHOLD y
 * este valor son significativos (no ruido) pero no representan operación
 * normal — pueden ser mantenimiento, limpieza, test o sensor reportando
 * en vacío. La UI los muestra con styling distinto (badge ámbar) para que
 * el operador NO los confunda con un turno productivo normal, sin filtrar
 * la data (los ciclos existen y deben ser visibles).
 *
 * Un turno Yal/Chonchi productivo normal tiene miles a decenas de miles de
 * ciclos por 8h. 500 deja amplio margen para captar turnos parcialmente
 * cortos sin marcarlos como bajos.
 */
export const SLX_LOW_ACTIVITY_THRESHOLD = 500

/**
 * `true` si un total de ciclos representa un turno productivo significativo
 * (no ruido). Usar este helper en lugar de comparar contra `> 0` para que
 * sea inevitable aplicar el umbral correcto en cualquier nueva UI.
 */
export function isSignificantCycleCount(totalCycles: number | null | undefined): boolean {
  if (totalCycles == null || !Number.isFinite(totalCycles)) return false
  return totalCycles >= SLX_NOISE_THRESHOLD
}

/**
 * `true` si el turno tiene ciclos pero por debajo del umbral de operación
 * normal. Distinto a "ruido" (que se filtra) — esta data se MUESTRA con
 * advertencia visual para que el operador la revise.
 */
export function isLowActivityCycleCount(totalCycles: number | null | undefined): boolean {
  if (totalCycles == null || !Number.isFinite(totalCycles)) return false
  return totalCycles >= SLX_NOISE_THRESHOLD && totalCycles < SLX_LOW_ACTIVITY_THRESHOLD
}

/**
 * `true` si un SlxShiftCache tiene producción significativa.
 * Acepta cualquier objeto con `.totalCycles` (cache real o virtual).
 */
export function isSignificantSlxShift(
  cache: { totalCycles?: number } | null | undefined,
): boolean {
  return isSignificantCycleCount(cache?.totalCycles)
}

/**
 * `true` si el shiftId representa el bloque "sin turno configurado" de
 * Shoplogix (no es un turno real: no tiene horario que la planta haya
 * declarado, así que nunca debe competir en rankings/promedios de turno ni
 * contarse como turno de día o de noche). Centraliza el string literal
 * 'Unscheduled', repetido antes en ~7 puntos de la UI sin un solo helper.
 */
export function isUnscheduledShift(shiftId: string | null | undefined): boolean {
  return shiftId === 'Unscheduled'
}
