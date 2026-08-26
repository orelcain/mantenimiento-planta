/**
 * La peor hora del turno y qué se la comió.
 *
 * POR QUÉ EXISTE
 * --------------
 * «Hora por hora» del monitor de Eviscerado, turno del 25-08 de noche:
 *
 *     h4  00:25–01:25   1.781 pz
 *     h5  01:25–02:25     379 pz     ← 82% menos que sus vecinas
 *     h6  02:25–03:25   2.048 pz
 *
 * El desplome estaba ahí, en el listado, sin ninguna marca: había que leer
 * ocho números y restarlos de cabeza para verlo. Y el porqué —una detención de
 * 59,5 min desde las 01:34— vive cuatro bloques más abajo, en otra sección.
 *
 * El dato de las paradas con su hora YA se publica y ya se agrupa; lo que
 * faltaba era cruzarlo con la hora que se hundió. Sin ese cruce, la pantalla
 * muestra la pérdida pero no la explica, que es justo lo que se le pide.
 */

/** Lo mínimo que se necesita de una fila de «Hora por hora». */
export interface HoraDelTurno {
  index: number
  from: string
  to: string
  pieces: number
  /** Si la hora está incompleta no compite: tiene menos piezas por durar menos. */
  partial?: boolean
}

/** Lo mínimo que se necesita de una parada ya agrupada. */
export interface ParadaConHora {
  reason: string
  hora: string
  hasta: string
  min: number
}

export interface HoraFloja {
  index: number
  pieces: number
  /** Cuánto por debajo de la mediana de las demás horas, en %. */
  caidaPct: number
  /** La parada que más minutos se comió DENTRO de esa hora, si la hay. */
  culpable: { reason: string; min: number; hora: string } | null
}

/** Caída mínima para molestarse en señalarla. Debajo es variación normal. */
const CAIDA_MIN_PCT = 35
/** Con menos de tres horas no hay mediana que sostenga una comparación. */
const HORAS_MIN = 3

/**
 * @param horas filas de «Hora por hora», en orden.
 * @param paradas todas las paradas del turno con su hora de planta.
 */
export function horaMasFloja(
  horas: readonly HoraDelTurno[] | null | undefined,
  paradas: readonly ParadaConHora[] | null | undefined,
): HoraFloja | null {
  const completas = (horas ?? []).filter((h) => !h.partial)
  if (completas.length < HORAS_MIN) return null

  const peor = completas.reduce((a, b) => (b.pieces < a.pieces ? b : a))
  const otras = completas.filter((h) => h.index !== peor.index).map((h) => h.pieces).sort((a, b) => a - b)
  if (otras.length === 0) return null
  const mitad = Math.floor(otras.length / 2)
  const tipico = otras.length % 2 ? otras[mitad]! : (otras[mitad - 1]! + otras[mitad]!) / 2
  if (tipico <= 0) return null

  const caidaPct = ((tipico - peor.pieces) / tipico) * 100
  if (caidaPct < CAIDA_MIN_PCT) return null

  return { index: peor.index, pieces: peor.pieces, caidaPct, culpable: culpableDe(peor, paradas) }
}

/**
 * La parada que más minutos se llevó dentro de esa hora. Se cuenta el
 * SOLAPAMIENTO, no la parada entera: una detención de 59 min que arranca a las
 * 01:34 le saca 51 minutos a la hora 01:25–02:25, no 59.
 */
function culpableDe(
  hora: HoraDelTurno,
  paradas: readonly ParadaConHora[] | null | undefined,
): HoraFloja['culpable'] {
  const ini = Date.parse(hora.from)
  const fin = Date.parse(hora.to)
  if (Number.isNaN(ini) || Number.isNaN(fin)) return null

  let mejor: HoraFloja['culpable'] = null
  for (const p of paradas ?? []) {
    const a = horaDePlantaAMs(p.hora, ini)
    const b = horaDePlantaAMs(p.hasta, ini)
    if (a == null || b == null) continue
    const solape = (Math.min(b, fin) - Math.max(a, ini)) / 60_000
    if (solape <= 0) continue
    if (!mejor || solape > mejor.min) mejor = { reason: p.reason, min: solape, hora: p.hora }
  }
  // Una parada de dos minutos no explica una hora hundida: mejor no señalar
  // nada que señalar al que pasaba por ahí.
  return mejor && mejor.min >= 5 ? mejor : null
}

/**
 * "01:34:18" → ms, ubicado en el día de `refMs`.
 *
 * ⚠ Las paradas traen hora de PLANTA suelta, sin fecha. En un turno de noche la
 * hora puede caer al día siguiente que su `from`, así que si el resultado queda
 * más de 12 h antes de la referencia se corre un día: sin esto, la detención de
 * las 01:34 de un turno que arrancó 21:25 se ubicaba ocho horas ANTES del
 * arranque y no solapaba con ninguna hora.
 */
function horaDePlantaAMs(hhmmss: string, refMs: number): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec((hhmmss || '').trim())
  if (!m) return null
  const ref = new Date(refMs)
  const d = new Date(refMs)
  d.setUTCHours(Number(m[1]), Number(m[2]), Number(m[3] ?? 0), 0)
  let ms = d.getTime()
  if (ms - ref.getTime() < -12 * 3_600_000) ms += 24 * 3_600_000
  if (ms - ref.getTime() > 12 * 3_600_000) ms -= 24 * 3_600_000
  return ms
}
