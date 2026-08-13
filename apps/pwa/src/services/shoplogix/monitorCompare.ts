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
  /** Turno de Shoplogix. Sirve para distinguir dos turnos del mismo día. */
  shiftId?: string | null
  curve: PacePoint[]
  totalPieces: number
  /** Piezas a la altura del turno en curso. null si ese día no llegó tan lejos. */
  atCurrentMinute: number | null
  esHoy: boolean
}

/** Una parada de convenio, en minutos desde el arranque del turno. */
export interface PlannedBreak {
  fromMin: number
  toMin: number
  reason: string
}

/**
 * Las paradas de convenio de un turno, ubicadas en minutos desde el arranque.
 *
 * Qué causa es "de convenio" NO se decide acá: se toma de `timeBreakdown.planned`,
 * que ya lo resolvió el backend. Duplicar la lista de causas en el cliente
 * garantiza que un día las dos versiones digan cosas distintas.
 *
 * Los tramos se fusionan porque vienen solapados: en el turno del 12-08 de
 * Filete la colación llega como 311→318 y 317→356, que son una sola parada
 * partida por el sensor.
 */
export function plannedBreaks(args: {
  series?: MonitorSeriesPoint[] | null
  stopEvents?: Array<{ r: number; f: string; s: number }> | null
  stopReasons?: string[] | null
  plannedReasons?: string[] | null
}): PlannedBreak[] {
  const t0 = args.series?.[0]?.t ? Date.parse(args.series[0]!.t) : NaN
  if (Number.isNaN(t0) || !args.stopEvents || !args.stopReasons) return []
  const deConvenio = new Set(args.plannedReasons ?? [])
  if (deConvenio.size === 0) return []

  const crudos = args.stopEvents
    .filter((e) => deConvenio.has(args.stopReasons![e.r] ?? ''))
    .map((e) => {
      const desde = Math.round((Date.parse(e.f) - t0) / 60_000)
      return { fromMin: desde, toMin: desde + Math.round(e.s / 60), reason: args.stopReasons![e.r]! }
    })
    .filter((b) => Number.isFinite(b.fromMin) && b.toMin > b.fromMin)
    .sort((a, b) => a.fromMin - b.fromMin)

  const fusionados: PlannedBreak[] = []
  for (const b of crudos) {
    const ultimo = fusionados[fusionados.length - 1]
    if (ultimo && b.fromMin <= ultimo.toMin) {
      ultimo.toMin = Math.max(ultimo.toMin, b.toMin)
    } else {
      fusionados.push({ ...b })
    }
  }
  return fusionados
}

/**
 * Las paradas que hay que suponer de acá al cierre.
 *
 * Las de hoy son hechos; las de los días anteriores, pronóstico. Un turno a
 * mitad de camino todavía no tuvo la colación, y una meta que no la contempla
 * exige un ritmo que nadie va a sostener justo cuando la línea está parada por
 * convenio.
 */
export function mergeBreaks(
  hoy: PlannedBreak[],
  anteriores: PlannedBreak[],
  currentMinute: number,
): PlannedBreak[] {
  const futuras = anteriores.filter((b) => b.fromMin > currentMinute)
  const todas = [...hoy, ...futuras].sort((a, b) => a.fromMin - b.fromMin)
  const out: PlannedBreak[] = []
  for (const b of todas) {
    const ultimo = out[out.length - 1]
    if (ultimo && b.fromMin <= ultimo.toMin) ultimo.toMin = Math.max(ultimo.toMin, b.toMin)
    else out.push({ ...b })
  }
  return out
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
  /** Las paradas de convenio que la curva objetivo respeta. */
  breaks: PlannedBreak[]
}

function etiquetaDia(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return dateKey
  const dia = d.toLocaleDateString('es-CL', { weekday: 'short', timeZone: 'UTC' }).replace('.', '')
  return `${dia} ${d.getUTCDate()}`
}

/** "Turno 2" → "T2"; "Turno Dia" → "día". Tiene que entrar en una fila angosta. */
function etiquetaTurno(shiftId: string | null | undefined): string {
  const t = String(shiftId || '').trim()
  if (!t) return ''
  const m = /^turno\s+(.+)$/i.exec(t)
  const resto = (m?.[1] ?? t).trim()
  if (/^\d+$/.test(resto)) return `T${resto}`
  return resto.toLowerCase()
}

const sumaBreaks = (bs: PlannedBreak[]) => bs.reduce((a, b) => a + (b.toMin - b.fromMin), 0)

/**
 * La curva que hay que seguir para llegar a la cuota, con las paradas de
 * convenio dentro.
 *
 * Una recta desde el minuto 0 es una meta imposible de leer: dice que a la hora
 * 6 hay que llevar 3.500 sin contar que la línea estuvo parada 55 minutos por
 * colación. Con las mesetas, la curva se aplana donde la línea NO puede
 * producir y sube al ritmo que de verdad hay que sostener el resto del tiempo —
 * y quedar por debajo pasa a significar algo.
 */
function curvaObjetivo(
  targetPieces: number,
  usefulMin: number,
  breaks: PlannedBreak[],
  finMin: number,
): PacePoint[] {
  const cpm = targetPieces / usefulMin
  const enParada = (m: number) => breaks.some((b) => m > b.fromMin && m <= b.toMin)

  const out: PacePoint[] = [{ minutes: 0, pieces: 0 }]
  let acum = 0
  for (let m = BUCKET_MIN; m <= finMin; m += BUCKET_MIN) {
    // Un tramo cuenta a prorrata: si la parada se come 3 de sus 5 minutos, el
    // tramo aporta 2 minutos de producción, no cero ni cinco.
    let utiles = 0
    for (let k = m - BUCKET_MIN + 1; k <= m; k++) if (!enParada(k)) utiles++
    acum = Math.min(targetPieces, acum + utiles * cpm)
    out.push({ minutes: m, pieces: Math.round(acum) })
  }
  return out
}

/**
 * Compara el turno en curso con los anteriores, minuto a minuto de turno.
 *
 * `optimal` reparte la cuota sobre el tiempo ÚTIL y se aplana durante las
 * paradas de convenio: el reparto lineal sobre el turno completo supone que no
 * hay colación y exige de más desde el arranque, y una recta continua pide
 * producir justo cuando la línea está parada por convenio.
 */
export function buildDayComparison(args: {
  todaySeries: MonitorSeriesPoint[] | null | undefined
  todayDateKey: string
  todayShiftId?: string | null
  previous: Array<{
    dateKey: string
    shiftId?: string | null
    series: MonitorSeriesPoint[] | null | undefined
  }>
  maxDays?: number
  /** Meta del turno y minutos útiles, para dibujar la curva objetivo. */
  targetPieces?: number | null
  usefulMin?: number | null
  /** Paradas de convenio: la curva objetivo se aplana durante ellas. */
  breaks?: PlannedBreak[]
}): CompareResult {
  const hoy = cumulativeFromStart(args.todaySeries)
  if (hoy.length === 0) {
    return {
      days: [], currentMinute: null, optimal: null, optimalAtCurrentMinute: null,
      maxMinutes: 0, breaks: [],
    }
  }

  const currentMinute = hoy[hoy.length - 1]!.minutes

  const days: DayCurve[] = [{
    label: 'Hoy',
    shiftId: args.todayShiftId ?? null,
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
      label: prev.dateKey === args.todayDateKey ? 'hoy' : etiquetaDia(prev.dateKey),
      shiftId: prev.shiftId ?? null,
      dateKey: prev.dateKey,
      curve,
      totalPieces: curve[curve.length - 1]!.pieces,
      atCurrentMinute: piecesAt(curve, currentMinute),
      esHoy: false,
    })
  }

  /*
   * Desambiguar los turnos del MISMO día. Yal corre tres por jornada, así que
   * el comparador mostraba tres filas idénticas "lun 10" y no había forma de
   * saber cuál era cuál. El turno solo se agrega cuando hace falta: en Filete,
   * con un turno por día, la etiqueta queda corta.
   */
  const porFecha = new Map<string, number>()
  for (const d of days) porFecha.set(d.dateKey, (porFecha.get(d.dateKey) ?? 0) + 1)
  for (const d of days) {
    // Se cuenta por FECHA y no por etiqueta: el turno anterior de hoy compite
    // con la fila "Hoy", que se llama distinto pero es el mismo día.
    if ((porFecha.get(d.dateKey) ?? 0) < 2) continue
    const t = etiquetaTurno(d.shiftId)
    if (t) d.label = `${d.label} ${t}`
  }

  const maxMinutes = Math.max(...days.map((d) => d.curve[d.curve.length - 1]!.minutes), currentMinute)

  let optimal: PacePoint[] | null = null
  let optimalAtCurrentMinute: number | null = null
  if (args.targetPieces && args.targetPieces > 0 && args.usefulMin && args.usefulMin > 0) {
    const finMin = Math.max(maxMinutes, args.usefulMin + sumaBreaks(args.breaks ?? []))
    optimal = curvaObjetivo(args.targetPieces, args.usefulMin, args.breaks ?? [], finMin)
    optimalAtCurrentMinute = piecesAt(optimal, currentMinute) ?? args.targetPieces
  }

  return { days, currentMinute, optimal, optimalAtCurrentMinute, maxMinutes, breaks: args.breaks ?? [] }
}

/** El tramo donde hoy perdió más terreno contra el día de referencia. */
export interface GapWindow {
  /** Minutos de turno que abarca el tramo. */
  fromMin: number
  toMin: number
  /** Piezas que hoy quedó abajo SOLO en ese tramo. */
  lostPieces: number
  /** Cuánto de toda la diferencia acumulada se explica acá (0-1). */
  share: number
}

/**
 * Dónde se abrió la brecha: el tramo continuo en que hoy perdió más terreno.
 *
 * Es la pregunta de Orel — *"¿qué pasó que nos atrasó?"*. Ver la curva de hoy por
 * debajo de la de ayer dice QUE se perdió, no DÓNDE: la brecha casi nunca se
 * abre parejo, se abre en un tramo y después se arrastra planchada el resto del
 * turno. Con el tramo en la mano se puede cruzar contra las detenciones y
 * ponerle nombre.
 *
 * Se busca la racha continua de tramos con más pérdida acumulada (Kadane sobre
 * los negativos) y no el peor tramo suelto: una parada de 40 minutos son ocho
 * tramos malos seguidos, y quedarse con uno la haría ver ocho veces más chica.
 */
export function findGapWindow(hoy: PacePoint[], ref: PacePoint[]): GapWindow | null {
  if (hoy.length === 0 || ref.length === 0) return null

  /** Piezas de CADA tramo (no acumuladas), por minuto de turno. */
  const porTramo = (curve: PacePoint[]) => {
    const m = new Map<number, number>()
    let prev = 0
    for (const p of curve) {
      m.set(p.minutes, p.pieces - prev)
      prev = p.pieces
    }
    return m
  }
  const a = porTramo(hoy)
  const b = porTramo(ref)

  let mejorIni: number | null = null
  let mejorFin = 0
  let mejor = 0
  let ini: number | null = null
  let corriendo = 0

  for (const min of [...a.keys()].sort((x, y) => x - y)) {
    // Un tramo que el día de referencia no alcanzó no se puede comparar: contar
    // su ausencia como pérdida inventaría una brecha que no existe.
    if (!b.has(min)) continue
    const delta = (a.get(min) ?? 0) - (b.get(min) ?? 0)
    if (delta < 0) {
      if (ini == null) { ini = min; corriendo = 0 }
      corriendo += delta
      if (corriendo < mejor) { mejor = corriendo; mejorIni = ini; mejorFin = min }
    } else {
      ini = null
      corriendo = 0
    }
  }

  if (mejorIni == null || mejor >= 0) return null

  // La diferencia total, para saber cuánto del atraso explica este tramo.
  const totalHoy = hoy[hoy.length - 1]!.pieces
  const totalRef = piecesAt(ref, hoy[hoy.length - 1]!.minutes)
  const brechaTotal = totalRef == null ? 0 : totalRef - totalHoy

  return {
    fromMin: mejorIni - BUCKET_MIN,
    toMin: mejorFin,
    lostPieces: Math.round(-mejor),
    share: brechaTotal > 0 ? Math.min(1, -mejor / brechaTotal) : 0,
  }
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
