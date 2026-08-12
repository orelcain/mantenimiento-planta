/**
 * monitorCompare.ts — comparar el turno en curso contra los anteriores.
 *
 * Nace de un error de lectura concreto: "hoy llevamos 3.028 y ayer hizo 3.275".
 * Ayer eran las 15:30 y hoy son las 13:00 — comparar un turno a medio andar
 * contra el TOTAL de otro no dice nada. Acá todo se compara A LA MISMA HORA.
 *
 * Se arma desde `live.series` de cada turno, que ya viaja en el doc del monitor
 * (el de hoy en `live`, los anteriores en `history`). No hace falta guardar nada.
 */

import type { MonitorSeriesPoint } from './monitorHourly'

/** Acumulado de un turno al cierre de cada hora de reloj de planta. */
export interface CumulativeSeries {
  /** Hora de planta 0-23. */
  hour: number
  /** Piezas acumuladas desde el inicio del turno hasta el fin de esa hora. */
  pieces: number
}

/**
 * Acumulado por hora, en wall-clock de planta.
 *
 * ⚠ `getUTCHours` y no `getHours`: los ISO del monitor llevan Z pero son hora
 * de planta. Con el huso del celular, dos turnos del mismo día caerían en horas
 * distintas y la comparación quedaría corrida.
 */
export function cumulativeByHour(series: MonitorSeriesPoint[] | null | undefined): CumulativeSeries[] {
  if (!series || series.length === 0) return []
  const porHora = new Map<number, number>()
  for (const p of series) {
    const ms = Date.parse(p.t)
    if (Number.isNaN(ms)) continue
    const h = new Date(ms).getUTCHours()
    porHora.set(h, (porHora.get(h) ?? 0) + (p.pieces || 0))
  }
  // Orden cronológico REAL: un turno noche va 21, 22, 23, 0, 1… y ordenar por
  // número dejaría la madrugada delante de la tarde.
  const horas = [...porHora.keys()]
  const ordenadas = ordenarCruzandoMedianoche(horas)
  let acum = 0
  return ordenadas.map((hour) => {
    acum += porHora.get(hour) ?? 0
    return { hour, pieces: acum }
  })
}

/**
 * Ordena horas de un turno respetando el cruce de medianoche: si hay un salto
 * grande hacia atrás (23 → 0), la parte baja va DESPUÉS.
 */
function ordenarCruzandoMedianoche(horas: number[]): number[] {
  const asc = [...horas].sort((a, b) => a - b)
  // Sin hueco > 6 h no hay cruce: es un turno de día normal.
  let corte = -1
  for (let i = 1; i < asc.length; i++) {
    if (asc[i]! - asc[i - 1]! > 6) { corte = i; break }
  }
  if (corte < 0) return asc
  return [...asc.slice(corte), ...asc.slice(0, corte)]
}

export interface DayComparison {
  label: string
  dateKey: string
  cumulative: CumulativeSeries[]
  totalPieces: number
  /** Piezas que llevaba ese día a la MISMA hora que el turno en curso. */
  atCurrentHour: number | null
  esHoy: boolean
}

/**
 * Compara el turno en curso con los anteriores, todos al corte de la hora que
 * el turno actual acaba de completar.
 *
 * `maxDays` deja fuera los turnos viejos: con más de 3 la pantalla se vuelve un
 * plato de espaguetis en un celular.
 */
export function buildDayComparison(args: {
  todaySeries: MonitorSeriesPoint[] | null | undefined
  todayDateKey: string
  previous: Array<{ dateKey: string; series: MonitorSeriesPoint[] | null | undefined }>
  maxDays?: number
}): { days: DayComparison[]; currentHour: number | null } {
  const hoy = cumulativeByHour(args.todaySeries)
  if (hoy.length === 0) return { days: [], currentHour: null }

  /*
   * La hora de corte es la ÚLTIMA COMPLETA del turno en curso, no la que está
   * corriendo: comparar una hora a medio llenar contra las horas enteras de los
   * otros días haría ver una caída que no existe, cada hora, en todos los turnos.
   */
  const currentHour = hoy.length > 1 ? hoy[hoy.length - 2]!.hour : hoy[hoy.length - 1]!.hour

  const enHora = (serie: CumulativeSeries[]): number | null => {
    const fila = serie.find((c) => c.hour === currentHour)
    return fila ? fila.pieces : null
  }

  const days: DayComparison[] = [{
    label: 'Hoy',
    dateKey: args.todayDateKey,
    cumulative: hoy,
    totalPieces: hoy[hoy.length - 1]?.pieces ?? 0,
    atCurrentHour: enHora(hoy),
    esHoy: true,
  }]

  for (const prev of args.previous.slice(0, args.maxDays ?? 2)) {
    const cum = cumulativeByHour(prev.series)
    if (cum.length === 0) continue
    days.push({
      label: etiquetaDia(prev.dateKey),
      dateKey: prev.dateKey,
      cumulative: cum,
      totalPieces: cum[cum.length - 1]?.pieces ?? 0,
      atCurrentHour: enHora(cum),
      esHoy: false,
    })
  }
  return { days, currentHour }
}

function etiquetaDia(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  const dia = d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${dia} ${d.getUTCDate()}`
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
