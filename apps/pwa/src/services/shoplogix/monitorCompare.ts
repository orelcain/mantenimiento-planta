/**
 * monitorCompare.ts — comparar el turno en curso contra los anteriores.
 *
 * Nace de un error de lectura concreto: "hoy llevamos 3.028 y ayer hizo 3.275".
 * Ayer eran las 15:30 y hoy son las 13:00 — comparar un turno a medio andar
 * contra el TOTAL de otro no dice nada.
 *
 * ── Por qué se mide desde el INICIO del turno y no por hora de reloj ────────
 *
 * Los turnos no arrancan a la misma hora: 07:45, 07:48, 08:00. Agrupando por
 * hora de reloj, la primera "hora" de un día son 15 minutos y la de otro son 60,
 * y la comparación queda arruinada justo en el tramo que más se mira. Además es
 * como cuenta Shoplogix (confirmado por Orel, 12-08): la hora 1 va del arranque
 * a +60 min, no hasta el próximo cambio de hora.
 *
 * Todo acá se indexa en MINUTOS DESDE EL ARRANQUE, así "h+2" de hoy se compara
 * con "h+2" de ayer aunque uno haya empezado 20 minutos antes.
 *
 * Se arma desde `live.series` de cada turno, que ya viaja en el doc del monitor
 * (el de hoy en `live`, los anteriores en `history`). No hace falta guardar nada.
 */

import type { MonitorSeriesPoint } from './monitorHourly'

/** Tramo de la serie de Shoplogix. */
const BUCKET_MIN = 5

/** Punto de la curva: piezas acumuladas a los `minutes` de arrancado el turno. */
export interface PacePoint {
  minutes: number
  pieces: number
}

/**
 * Curva acumulada indexada en minutos desde el arranque.
 *
 * El arranque es el primer tramo CON DATO de la serie y no `scheduledStart`: el
 * horario programado puede estar 20 minutos antes de la primera pieza, y esos
 * minutos vacíos correrían la curva entera hacia la derecha.
 */
export function cumulativeFromStart(series: MonitorSeriesPoint[] | null | undefined): PacePoint[] {
  if (!series || series.length === 0) return []
  const puntos = series
    .map((p) => ({ ms: Date.parse(p.t), pieces: p.pieces || 0 }))
    .filter((p) => !Number.isNaN(p.ms))
    .sort((a, b) => a.ms - b.ms)
  if (puntos.length === 0) return []

  const t0 = puntos[0]!.ms
  let acum = 0
  return puntos.map((p) => {
    acum += p.pieces
    return { minutes: Math.round((p.ms - t0) / 60_000) + BUCKET_MIN, pieces: acum }
  })
}

/** Piezas acumuladas a los `min` de turno, interpolando entre tramos. */
export function piecesAt(curve: PacePoint[], min: number): number | null {
  if (curve.length === 0) return null
  if (min < curve[0]!.minutes) return 0
  let ultimo: PacePoint | null = null
  for (const p of curve) {
    if (p.minutes > min) break
    ultimo = p
  }
  // Más allá del último dato NO se extrapola: ese turno no llegó hasta ahí.
  if (!ultimo) return 0
  if (min > curve[curve.length - 1]!.minutes) return null
  return ultimo.pieces
}

export interface DayCurve {
  label: string
  dateKey: string
  curve: PacePoint[]
  totalPieces: number
  /** Piezas a la altura del turno en curso. null si ese día no llegó tan lejos. */
  atCurrentMinute: number | null
  esHoy: boolean
}

export interface CompareResult {
  days: DayCurve[]
  /** Minutos de turno transcurridos en el turno en curso. */
  currentMinute: number | null
  /** Curva del ritmo que la cuota exige, si hay meta. */
  optimal: PacePoint[] | null
  optimalAtCurrentMinute: number | null
  /** Alcance del eje, en minutos de turno. */
  maxMinutes: number
}

function etiquetaDia(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  const dia = d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${dia} ${d.getUTCDate()}`
}

/**
 * Compara el turno en curso con los anteriores, minuto a minuto de turno.
 *
 * `optimal` es la recta que la cuota exige repartida sobre el tiempo ÚTIL (sin
 * las paradas de convenio) — el reparto sobre el turno completo supone que no
 * hay colación y exige de más desde el arranque.
 */
export function buildDayComparison(args: {
  todaySeries: MonitorSeriesPoint[] | null | undefined
  todayDateKey: string
  previous: Array<{ dateKey: string; series: MonitorSeriesPoint[] | null | undefined }>
  maxDays?: number
  /** Meta del turno y minutos útiles, para dibujar la recta objetivo. */
  targetPieces?: number | null
  usefulMin?: number | null
}): CompareResult {
  const hoy = cumulativeFromStart(args.todaySeries)
  if (hoy.length === 0) {
    return { days: [], currentMinute: null, optimal: null, optimalAtCurrentMinute: null, maxMinutes: 0 }
  }

  const currentMinute = hoy[hoy.length - 1]!.minutes

  const days: DayCurve[] = [{
    label: 'Hoy',
    dateKey: args.todayDateKey,
    curve: hoy,
    totalPieces: hoy[hoy.length - 1]!.pieces,
    atCurrentMinute: hoy[hoy.length - 1]!.pieces,
    esHoy: true,
  }]

  for (const prev of (args.previous ?? []).slice(0, args.maxDays ?? 2)) {
    const curve = cumulativeFromStart(prev.series)
    if (curve.length === 0) continue
    days.push({
      label: etiquetaDia(prev.dateKey),
      dateKey: prev.dateKey,
      curve,
      totalPieces: curve[curve.length - 1]!.pieces,
      atCurrentMinute: piecesAt(curve, currentMinute),
      esHoy: false,
    })
  }

  const maxMinutes = Math.max(...days.map((d) => d.curve[d.curve.length - 1]!.minutes), currentMinute)

  let optimal: PacePoint[] | null = null
  let optimalAtCurrentMinute: number | null = null
  if (args.targetPieces && args.targetPieces > 0 && args.usefulMin && args.usefulMin > 0) {
    const cpm = args.targetPieces / args.usefulMin
    const finMin = Math.max(maxMinutes, args.usefulMin)
    optimal = []
    for (let m = 0; m <= finMin; m += 15) {
      optimal.push({ minutes: m, pieces: Math.min(args.targetPieces, Math.round(m * cpm)) })
    }
    optimalAtCurrentMinute = Math.min(args.targetPieces, Math.round(currentMinute * cpm))
  }

  return { days, currentMinute, optimal, optimalAtCurrentMinute, maxMinutes }
}

/**
 * El ritmo que la cuota exige EN MARCHA, descontando las paradas de convenio.
 *
 * El reparto lineal de la cuota sobre el turno completo es tramposo: supone que
 * no hay colación. Restando el tiempo planificado se obtiene el número que de
 * verdad hay que sostener — y comparado con el récord de la línea se ve si la
 * cuota es exigente o imposible.
 */
export function optimalPace(args: {
  targetPieces: number
  windowMin: number
  plannedMin: number
}): { usefulMin: number; requiredCpm: number } | null {
  const usefulMin = args.windowMin - args.plannedMin
  if (!args.targetPieces || usefulMin <= 0) return null
  return { usefulMin, requiredCpm: args.targetPieces / usefulMin }
}
