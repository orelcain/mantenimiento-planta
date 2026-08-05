/**
 * Turnos de un período, normalizados — la fuente única de la Matriz y de la
 * Lista de la vista de período del Análisis Grader.
 *
 * POR QUÉ EXISTE
 * --------------
 * El calendario mensual usa el DÍA como contenedor. Un turno que cruza
 * medianoche no cabe en una celda de día, así que `GraderHistoricalCalendar`
 * lo parte en dos fragmentos (`salida` en el día que arranca + `madrugada` en
 * el día siguiente, donde viven los datos). Cuatro `CardKind` existen solo
 * para tapar ese corte.
 *
 * Acá el contenedor es el TURNO. Cada turno es una entrada, anclada al día en
 * que ARRANCA, cruce o no cruce la medianoche. No hay fragmentos.
 *
 * DECISIÓN CLAVE: una entrada = un doc padre REAL de Shoplogix
 * -----------------------------------------------------------
 * `slxMonthResolve.resolveMonthShiftKeys` mapea claves BASE del Grader
 * (`Turno día`) a los padres que las resuelven (`Turno 1` o `Turno 2`). Eso es
 * correcto para poblar un caché por clave, pero hace que DOS claves apunten al
 * MISMO padre — y sumarlas doble-cuenta. `GraderHistoricalCalendar` lo mitiga
 * salteando el alias legacy cuando el numérico ya tiene datos (ver el bloque
 * `if (shiftId === 'Turno día' && …) continue`, un parche que hay que recordar
 * mantener).
 *
 * Acá el problema no se mitiga: no puede ocurrir. Se recorren los PADRES
 * (un doc `${dateKey}_${shiftId}` = un turno, único por definición) y los
 * summaries del Grader se ADJUNTAN al padre que les corresponde. Un padre
 * nunca aparece dos veces, así que nada se suma dos veces.
 *
 * CONVENCIONES QUE NO SE PUEDEN VIOLAR
 * ------------------------------------
 * - Los timestamps de Shoplogix son **wall-clock-as-UTC** (hora de pizarra con
 *   sufijo `.000Z`). Para leer la hora hay que usar `getUTC*`, NUNCA `getHours()`:
 *   con `getHours()` el navegador aplica el offset local y corre el turno.
 * - `lastSyncAt` es UTC REAL. Nunca compararlo con `effectiveStart/End`.
 * - El `dateKey` del doc ES el día en que arranca el turno
 *   (`shiftDateKeyFromStart` en el CF, verificado contra prod 2026-07-07 — ver
 *   `graderShiftDisplay.ts`). No se desplaza nada.
 */

import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'
import type { PlantSlug } from '@/services/shoplogix/shoplogixMachines'
import type { GraderDailySummary } from '@/services/grader/types'
import {
  getShiftMeta,
  isSignificantCycleCount,
  isLowActivityCycleCount,
  isUnscheduledShift,
  type ShiftMeta,
} from '@/services/grader/graderShiftDisplay'
import { resolveShiftWindow } from '@/services/grader/graderShiftWindow'

/** De dónde salió la ventana horaria que se muestra. Se expone para no mentir. */
export type ShiftWindowSource =
  | 'effective'  // primer→último pescado real (lo mejor que hay)
  | 'official'   // horario oficial del whiteboard de Shoplogix
  | 'scheduled'  // ventana programada (crece sync a sync mientras el turno vive)
  | 'grader'     // startAt/endAt del Excel del Grader (turno sin doc Shoplogix)
  | 'none'       // sin ninguna referencia horaria

export interface PeriodShift {
  /** `${dateKey}__${shiftId}` — identidad estable para React keys y selección. */
  key: string
  /** Día en que ARRANCA el turno. Es la columna de la matriz. */
  dateKey: string
  /** Nombre TAL CUAL lo emite Shoplogix. Nunca traducido ni normalizado. */
  shiftId: string
  /** Label/ícono/color. El período sale de la hora REAL de inicio, no del nombre. */
  meta: ShiftMeta

  start: Date | null
  end: Date | null
  windowSource: ShiftWindowSource
  /**
   * Días entre el `dateKey` de anclaje y el día en que EMPIEZA la ventana real.
   * Normalmente 0. Es 1 cuando el turno estaba programado para arrancar de
   * noche pero la producción real recién empezó pasada la medianoche — caso
   * real `2026-07-31_Turno 1` de Chonchi: dateKey 31-jul, primer pescado
   * 01:34 del 1-ago. Sin esto, la celda del 31 muestra "01:34" como si hubiera
   * pasado el 31.
   */
  startDayOffset: number
  /** Días entre el `dateKey` de anclaje y el día en que TERMINA la ventana. */
  endDayOffset: number
  /**
   * La ventana atraviesa una medianoche mientras transcurre (empieza un día y
   * termina en otro). Distinto de `startDayOffset > 0`, que es el turno entero
   * corrido al día siguiente.
   */
  crossesMidnight: boolean
  /** Día en que TERMINA, si no es el `dateKey`. Null si coincide o no hay ventana. */
  endDateKey: string | null
  durationMin: number | null

  // --- Shoplogix ---
  cycles: number
  /**
   * Cuántos de los `cycles` vinieron del bloque "Unscheduled" y se atribuyeron
   * a este turno por cercanía temporal (ver `graderUnscheduledAttribution`).
   * Se guarda para poder decir "de estos 22.789, 2.296 los hizo el turno antes
   * de su horario" en vez de mezclarlos sin dejar rastro.
   */
  attributedCycles?: number
  /** 0-100. `avgShiftRuntime * 100`, igual que el resto de la app. */
  uptimePct: number | null
  expectedCycles: number
  /** Segundos de uptime sumados de TODAS las máquinas del turno. */
  uptimeSec: number
  /**
   * Agregados por máquina del turno. Se conservan porque el resumen mensual
   * los necesita (uptime y mantención por Baader) y ese cálculo vivía dentro
   * del calendario que esta vista reemplaza.
   */
  machines: ShoplogixShiftParent['machines']

  // --- Grader (Excel) ---
  pieces: number | null
  p0Pieces: number | null
  p0Pct: number | null
  /**
   * Summary del Grader tal cual, cuando existe. Se conserva para que los
   * paneles vecinos (KPI board, resumen mensual) puedan consumirlo sin volver
   * a consultarlo — antes lo emitía el calendario que esta vista reemplaza.
   */
  graderSummary?: GraderDailySummary

  hasSlx: boolean
  hasGrader: boolean
  /** Tiene ciclos, pero por debajo de la operación normal (mantención, test…). */
  lowActivity: boolean
  /** Producción que Shoplogix registró sin turno configurado. Se muestra fiel. */
  unscheduled: boolean
}

/** Suma de ciclos de todas las máquinas del turno. */
function parentCycles(p: ShoplogixShiftParent): number {
  return p.machines.reduce((a, m) => a + m.totalCycles, 0)
}

function parentExpectedCycles(p: ShoplogixShiftParent): number {
  return p.machines.reduce((a, m) => a + m.expectedTotalCycles, 0)
}

/**
 * Uptime del turno, 0-100.
 *
 * `shiftRuntime` llega como ratio 0-1 por máquina; el turno usa el PROMEDIO
 * entre máquinas (no la suma: sumarlo daría >100% con 3 Baaders). Misma
 * fórmula que `buildCacheFromParent` + `avgShiftRuntime * 100` en
 * `GraderHistoricalCalendar`, para que la matriz y el calendario no muestren
 * dos uptimes distintos del mismo turno.
 */
function parentUptimePct(p: ShoplogixShiftParent): number | null {
  if (p.machines.length === 0) return null
  const avg = p.machines.reduce((s, m) => s + m.shiftRuntime, 0) / p.machines.length
  return avg * 100
}

/** `YYYY-MM-DD` de un Date leído como wall-clock-as-UTC. */
export function dateKeyOfWallUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** Días enteros de `from` a `to`. Mediodía UTC para que el DST no reste un día. */
export function daysBetweenDateKeys(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`)
  const b = Date.parse(`${to}T12:00:00Z`)
  if (isNaN(a) || isNaN(b)) return 0
  return Math.round((b - a) / 86_400_000)
}

/**
 * Ventana horaria del turno.
 *
 * ANTES prefería `effective` (primer→último pescado) sobre todo lo demás, y eso
 * resultó estar mal: `effective` viene CLIPEADO al rango de la consulta del
 * sync (`clipStateToWindow` en el normalizer), así que hereda su recorte. En el
 * doc real `2026-08-04_Turno 2` daba una ventana de 24 h (08:00 → 08:00) para
 * un turno que Shoplogix declara de 07:15 a 15:00.
 *
 * Ahora la resuelve `resolveShiftWindow`, compartida con el Análisis de Turno:
 * une lo declarado por Shoplogix con lo observado y descarta lo que viene
 * cortado por el borde. Que sea la MISMA función es el punto — la matriz y el
 * detalle del turno no pueden mostrar dos ventanas distintas del mismo turno.
 */
function resolveWindow(
  p: ShoplogixShiftParent | null,
  g: GraderDailySummary | null,
): { start: Date | null; end: Date | null; source: ShiftWindowSource } {
  if (p) {
    const r = resolveShiftWindow({
      declaredStart: p.officialStart,
      declaredEnd: p.officialEnd,
      // Lo observado: `effective` si está, con `scheduled` de respaldo. Los dos
      // arrastran el recorte, y por eso van como "observado" y no como verdad.
      // Solo `effective` cuenta como observación. `scheduled` es el rango que
      // se consultó, no lo que pasó: va de respaldo, detrás de lo declarado.
      observedStart: p.effectiveStart,
      observedEnd: p.effectiveEnd,
      scheduleStart: p.scheduledStart,
      scheduleEnd: p.scheduledEnd,
    })
    if (r.start && r.end) {
      const source: ShiftWindowSource =
        r.origin === 'declarado' ? 'official'
        : r.origin === 'observado' ? (p.effectiveStart ? 'effective' : 'scheduled')
        : 'effective'
      return { start: r.start, end: r.end, source }
    }
  }
  if (g?.startAt && g?.endAt) {
    const s = new Date(g.startAt), e = new Date(g.endAt)
    if (!isNaN(s.getTime()) && !isNaN(e.getTime())) {
      return { start: s, end: e, source: 'grader' }
    }
  }
  return { start: null, end: null, source: 'none' }
}

/**
 * Índice de summaries del Grader por `${dateKey}__${shiftId}`.
 *
 * Un mismo turno puede estar guardado por el Grader bajo el alias legacy
 * (`Turno día`) mientras Shoplogix lo emite como `Turno 2`. Por eso el índice
 * se consulta con el shiftId del padre Y con sus alias.
 */
function indexSummaries(summaries: readonly GraderDailySummary[]): Map<string, GraderDailySummary> {
  const m = new Map<string, GraderDailySummary>()
  for (const s of summaries) {
    if (!s.dateKey || !s.shiftId) continue
    m.set(`${s.dateKey}__${s.shiftId}`, s)
  }
  return m
}

export interface BuildPeriodShiftsInput {
  /** Docs padre de Shoplogix del período. */
  parents: readonly ShoplogixShiftParent[]
  /** Summaries del Grader del período (Excel). */
  summaries: readonly GraderDailySummary[]
  plantSlug: PlantSlug
  /**
   * Alias Grader→Shoplogix. Se inyecta (en vez de importar
   * `getSlxShiftCandidates`) para que esta función quede pura y testeable sin
   * arrastrar el módulo de Firestore.
   */
  getCandidates: (shiftId: string, plantSlug: PlantSlug) => string[]
  /**
   * Si true, los turnos por debajo del umbral de ruido (<50 ciclos) se
   * descartan salvo que tengan datos del Grader. Default true.
   */
  dropNoise?: boolean
}

/**
 * Construye la lista de turnos del período.
 *
 * Recorre los padres de Shoplogix (un padre = un turno) y les adjunta el
 * summary del Grader que corresponda. Los summaries que no matchean ningún
 * padre se agregan como turnos solo-Grader: si se descartaran, un turno con
 * Excel cargado pero sin sync de Shoplogix desaparecería de la vista sin aviso.
 */
export function buildPeriodShifts(input: BuildPeriodShiftsInput): PeriodShift[] {
  const { parents, summaries, plantSlug, getCandidates, dropNoise = true } = input
  const byGraderKey = indexSummaries(summaries)
  const consumed = new Set<string>()
  const out: PeriodShift[] = []

  for (const p of parents) {
    // Alias: el Grader pudo guardarlo con otro nombre que el padre.
    let g: GraderDailySummary | null = byGraderKey.get(`${p.dateKey}__${p.shiftId}`) ?? null
    let gKey = g ? `${p.dateKey}__${p.shiftId}` : null
    if (!g) {
      for (const alias of getCandidates(p.shiftId, plantSlug)) {
        const k = `${p.dateKey}__${alias}`
        const hit = byGraderKey.get(k)
        if (hit && !consumed.has(k)) { g = hit; gKey = k; break }
      }
    }
    if (gKey) consumed.add(gKey)

    const cycles = parentCycles(p)
    const hasGrader = g !== null
    if (dropNoise && !hasGrader && !isSignificantCycleCount(cycles)) continue

    out.push(makeShift(p.dateKey, p.shiftId, p, g, cycles))
  }

  // Turnos que solo existen en el Grader (sin doc Shoplogix).
  for (const s of summaries) {
    const k = `${s.dateKey}__${s.shiftId}`
    if (consumed.has(k) || !s.dateKey || !s.shiftId) continue
    consumed.add(k)
    out.push(makeShift(s.dateKey, s.shiftId, null, s, 0))
  }

  return out.sort(compareChronological)
}

function makeShift(
  dateKey: string,
  shiftId: string,
  p: ShoplogixShiftParent | null,
  g: GraderDailySummary | null,
  cycles: number,
): PeriodShift {
  const { start, end, source } = resolveWindow(p, g)
  const endDateKeyRaw = end ? dateKeyOfWallUTC(end) : null
  const startDateKey = start ? dateKeyOfWallUTC(start) : null
  // Los offsets se miden contra el dateKey de ANCLAJE (la columna), no entre
  // start y end: un turno puede ocurrir entero el día siguiente al suyo.
  const startDayOffset = startDateKey ? daysBetweenDateKeys(dateKey, startDateKey) : 0

  // Un turno que termina EXACTAMENTE a las 00:00 no invadió el día siguiente:
  // se cerró justo al terminar el suyo. Contarlo como cruce es técnicamente
  // cierto y prácticamente falso — en Yal julio 2026, 4 de los 5 "cruces" eran
  // esto (`14:54 → 00:00`), y marcarlos gastaba la señal que necesita el cruce
  // de verdad (el `21:30 → 05:45` de Chonchi). Se le atribuye el día anterior.
  const endsAtSharpMidnight =
    !!end && end.getUTCHours() === 0 && end.getUTCMinutes() === 0 && end.getUTCSeconds() === 0
  const rawEndOffset = endDateKeyRaw ? daysBetweenDateKeys(dateKey, endDateKeyRaw) : 0
  const endDayOffset = endsAtSharpMidnight ? Math.max(0, rawEndOffset - 1) : rawEndOffset

  const crossesMidnight = endDayOffset > startDayOffset
  const endDateKey =
    endDateKeyRaw && !endsAtSharpMidnight && endDateKeyRaw !== dateKey ? endDateKeyRaw : null

  let durationMin: number | null = null
  if (start && end) {
    const ms = end.getTime() - start.getTime()
    durationMin = ms > 0 ? Math.round(ms / 60_000) : null
  }

  const p0Pct = g
    ? (typeof g.pointZeroPct === 'number'
        ? g.pointZeroPct
        : (g.totalPieces ? (g.pointZeroPieces / g.totalPieces) * 100 : null))
    : null

  return {
    key: `${dateKey}__${shiftId}`,
    dateKey,
    shiftId,
    // El período/ícono sale de la hora REAL de inicio: Shoplogix reusa nombres
    // para horarios distintos (caso Yal 2026-07-08, "Turno 1" a las 00:00).
    // Excepción: al bloque "Unscheduled" no se le pasa hora — su ventana es el
    // día entero (00:00→00:00), y derivar el ícono/hint de ahí lo pintaba como
    // "🌙 desde 00:06", un turno de madrugada que no existe. Sin hora conserva
    // su meta propia ("Sin turno asignado", ícono reloj).
    meta: getShiftMeta(shiftId, isUnscheduledShift(shiftId) ? null : (start ?? p?.scheduledStart ?? null)),
    start,
    end,
    windowSource: source,
    startDayOffset,
    endDayOffset,
    crossesMidnight,
    endDateKey,
    durationMin,
    cycles,
    uptimePct: p ? parentUptimePct(p) : null,
    expectedCycles: p ? parentExpectedCycles(p) : 0,
    uptimeSec: p ? p.machines.reduce((a, m) => a + m.uptimeSec, 0) : 0,
    machines: p ? p.machines : [],
    graderSummary: g ?? undefined,
    pieces: g?.totalPieces ?? null,
    p0Pieces: g?.pointZeroPieces ?? null,
    p0Pct,
    hasSlx: p !== null,
    hasGrader: g !== null,
    lowActivity: isLowActivityCycleCount(cycles),
    unscheduled: isUnscheduledShift(shiftId),
  }
}

/** Cronológico: por día, y dentro del día por hora real de inicio. */
function compareChronological(a: PeriodShift, b: PeriodShift): number {
  if (a.dateKey !== b.dateKey) return a.dateKey < b.dateKey ? -1 : 1
  const am = a.start ? a.start.getUTCHours() * 60 + a.start.getUTCMinutes() : 9999
  const bm = b.start ? b.start.getUTCHours() * 60 + b.start.getUTCMinutes() : 9999
  if (am !== bm) return am - bm
  return a.shiftId < b.shiftId ? -1 : a.shiftId > b.shiftId ? 1 : 0
}

/**
 * Filas de la matriz: los shiftId PRESENTES en el período, ordenados por su
 * hora de inicio típica (mediana de las observadas).
 *
 * No es una lista fija por planta a propósito: Shoplogix cambia los turnos
 * (Chonchi dejó de emitir `Turno día/noche` en 2026-05) y emite nombres que
 * ninguna constante prevé (`Turno 1 Lunes`, `Unscheduled`). Una lista fija los
 * haría desaparecer de la vista.
 */
export function periodShiftRows(shifts: readonly PeriodShift[]): string[] {
  const startsById = new Map<string, number[]>()
  for (const s of shifts) {
    if (!s.start) continue
    const mins = s.start.getUTCHours() * 60 + s.start.getUTCMinutes()
    const arr = startsById.get(s.shiftId)
    if (arr) arr.push(mins); else startsById.set(s.shiftId, [mins])
  }

  const ids = [...new Set(shifts.map(s => s.shiftId))]
  const median = (id: string): number => {
    const arr = startsById.get(id)
    if (!arr || arr.length === 0) return 9999
    const sorted = [...arr].sort((x, y) => x - y)
    return sorted[Math.floor(sorted.length / 2)]!
  }

  return ids.sort((a, b) => {
    // `Unscheduled` no es un turno: siempre al final, no compite por horario.
    const au = isUnscheduledShift(a), bu = isUnscheduledShift(b)
    if (au !== bu) return au ? 1 : -1
    const d = median(a) - median(b)
    return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0)
  })
}

/** Todos los `YYYY-MM-DD` de un mes. `month` es 0-indexed. */
export function periodDayKeys(year: number, month: number): string[] {
  const days = new Date(year, month + 1, 0).getDate()
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  return Array.from({ length: days }, (_, i) => `${prefix}-${String(i + 1).padStart(2, '0')}`)
}

/** Índice `${dateKey}__${shiftId}` → turno, para pintar la matriz en O(1). */
export function indexPeriodShifts(shifts: readonly PeriodShift[]): Map<string, PeriodShift> {
  return new Map(shifts.map(s => [s.key, s]))
}

/**
 * Ventana legible, SIEMPRE relativa al día de la columna. Wall-clock-as-UTC.
 *
 *   "09:00 → 17:15"        — empieza y termina en su propio día
 *   "21:30 → 05:45 ⁺¹"     — cruza la medianoche: termina al día siguiente
 *   "⁺¹ 01:34 → 05:11"     — el turno ENTERO ocurrió el día siguiente al suyo
 *
 * El marcador nunca se omite: una celda del 31 que dijera "01:34 → 05:11" a
 * secas estaría afirmando que eso pasó el 31, y no pasó.
 */
export function formatShiftWindow(s: PeriodShift, withDayMarks = true): string {
  if (!s.start || !s.end) return '—'
  const hhmm = (d: Date) =>
    `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
  const base = `${hhmm(s.start)} → ${hhmm(s.end)}`
  if (!withDayMarks) return base

  const mark = (n: number) => (n > 0 ? `⁺${n}` : '')
  if (s.startDayOffset > 0) return `${mark(s.startDayOffset)} ${base}`.trim()
  if (s.endDayOffset > 0) return `${base} ${mark(s.endDayOffset)}`.trim()
  return base
}
