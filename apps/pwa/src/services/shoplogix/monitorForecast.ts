/**
 * monitorForecast.ts — cuánto va a cerrar este turno, y con cuánto error.
 *
 * ── Por qué no hay UN método ────────────────────────────────────────────────
 *
 * Backtesting sobre 34 turnos reales (13-ago-2026, leave-one-out): el mejor
 * predictor SE INVIERTE entre líneas. Prediciendo desde el minuto 240:
 *
 *   método          Filete (1 máquina)   Yal (3 máquinas)
 *   ritmo de reloj        11,3%               15,3%
 *   aditivo                8,5%                8,8%   ← gana
 *   proporcional           5,2%   ← gana      12,3%
 *
 * La causa es física, no estadística. En Filete el total lo explica la
 * VELOCIDAD (corr 0,97) y el tiempo andando casi no varía: un turno rápido lo
 * es de punta a punta, así que su curva es proporcional a la de los demás. En
 * Yal manda el TIEMPO ANDANDO (corr 0,98) y las paradas llegan sin avisar: un
 * turno que arrancó volando puede perder dos horas, y suponer proporcionalidad
 * es justo el error. Elegir un método a mano habría degradado una de las dos
 * plantas.
 *
 * Por eso acá no se elige: se MIDE. Cada turno se predice con los otros
 * (leave-one-out), gana el de menor error, y ese error viaja con el pronóstico
 * — un número desnudo se lee como promesa.
 *
 * Se alimenta del `history` que YA viaja en el doc del monitor: cero lecturas
 * extra, cero cambios en el sync.
 */

import { piecesAt, type PacePoint } from './monitorCompare'

export type ForecastMethod = 'proporcional' | 'aditivo' | 'ritmo'

/** Un punto del cono: dónde estaría hoy a esa altura, según los anteriores. */
export interface ConePoint {
  minutes: number
  low: number
  mid: number
  high: number
}

export interface ForecastResult {
  /** Piezas estimadas al cierre. */
  estimate: number
  /** Banda: dónde terminaron los turnos anteriores proyectados desde acá. */
  low: number
  high: number
  /** Error medio del método elegido, medido leave-one-out (%). */
  mapePct: number
  method: ForecastMethod
  /** Turnos comparables usados. */
  samples: number
  /**
   * Qué fracción de su total llevaban esos turnos a esta altura (0-1). Solo
   * cuando el método ganador es el proporcional.
   */
  fraccionTipica: number | null
  /** En una frase, de dónde sale la estimación. */
  explicacion: string | null
  /**
   * De esos turnos, cuántos habrían alcanzado la meta desde esta misma altura.
   * Es el veredicto auditable: con 6 muestras, un "72% de probabilidad" finge
   * una precisión que no existe; "8 de 11" se puede revisar turno por turno.
   */
  hitsTarget: number | null
  /** Piezas que el turno ya lleva. */
  current: number
  /**
   * Hasta qué minuto de turno llega el pronóstico: la mediana de lo que
   * DURARON los turnos comparables.
   *
   * ⚠⚠ No es el horario del turno, y esa diferencia es la que hacía que la
   * pantalla diera dos cierres distintos. El 14-08 a las 12:50 Filete mostraba
   * "cierra en 4.501 pz (90% de la meta)" —proyectado al horario, 15:30— junto
   * a "5.011 pz, la meta entra" —proyectado a la duración típica, 8 h 45—.
   * Los dos correctos; la diferencia es la hora extra que esta línea hace casi
   * todos los días (505 pz el 13-08 después de las 15:30). Se expone para que
   * la UI pueda DECIR hasta cuándo mide cada número en vez de dar dos.
   */
  horizonMin: number
  /**
   * El mismo pronóstico, dibujable: de acá al cierre, dónde habría terminado
   * hoy si se comportara como cada turno anterior. Empieza en el punto actual
   * (el cono nace de la curva, no flota) y termina en el estimado.
   */
  cone: ConePoint[]
}

/** Turno anterior comparable: su curva completa y su total al cierre. */
export interface HistoryShift {
  curve: PacePoint[]
  totalPieces: number
}

/**
 * Por encima de este error el pronóstico no se muestra. Un número con 20% de
 * error a la hora 1 quema la credibilidad del bloque para todo el resto del
 * turno; callarse es la opción honesta.
 */
export const MAX_MAPE_PCT = 15

/** Sin al menos esto no hay con qué medir un error, menos elegir un método. */
const MIN_SAMPLES = 4

const mediana = (a: number[]): number => {
  const s = [...a].sort((x, y) => x - y)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Minutos que duró el turno = último punto de su curva. */
const duracion = (t: HistoryShift) => (t.curve.length ? t.curve[t.curve.length - 1]!.minutes : 0)

/**
 * Los tres predictores. Reciben lo que el turno lleva a `min` y el historial,
 * y devuelven el total estimado al cierre.
 */
const PREDICTORES: Record<ForecastMethod, (p: number, min: number, h: HistoryShift[]) => number | null> = {
  /* "Qué fracción del total ya llevaban los otros a esta altura." */
  proporcional: (p, min, h) => {
    const ratios = h
      .map((t) => (t.totalPieces > 0 ? (piecesAt(t.curve, min) ?? 0) / t.totalPieces : null))
      .filter((r): r is number => r != null && r > 0.05)
    if (ratios.length === 0) return null
    return p / mediana(ratios)
  },
  /* "Cuántas piezas sumaron los otros desde esta altura." */
  aditivo: (p, min, h) => {
    const deltas = h.map((t) => Math.max(0, t.totalPieces - (piecesAt(t.curve, min) ?? 0)))
    if (deltas.length === 0) return null
    return p + mediana(deltas)
  },
  /* El método viejo: extrapolar el ritmo de reloj hasta el cierre típico. */
  ritmo: (p, min, h) => {
    const dur = mediana(h.map(duracion))
    if (min <= 0) return null
    return p + (p / min) * Math.max(0, dur - min)
  },
}

/**
 * Historial utilizable: fuera los turnos truncados o en curso.
 *
 * ⚠ Hallazgo del propio análisis: incluir un turno a medio andar como si fuera
 * uno cerrado disparó el error de 7% a 90% — su "total" es un parcial, y
 * envenena tanto los ratios como los deltas.
 */
function comparables(history: HistoryShift[], min: number): HistoryShift[] {
  const utiles = history.filter((t) => t.curve.length >= 3 && t.totalPieces > 0)
  if (utiles.length === 0) return []
  const durTipica = mediana(utiles.map(duracion))
  return utiles.filter((t) => {
    // Tiene que haber llegado más allá del punto que se está prediciendo…
    if (duracion(t) < min + 30) return false
    // …y durar lo bastante para ser un turno completo.
    return duracion(t) >= durTipica * 0.6
  })
}

/**
 * Dónde estaría HOY a la altura `m` si se comportara como el turno `t`.
 *
 * Es la pieza que comparten el número y el dibujo: el estimado final es esta
 * misma proyección evaluada al cierre. Si divergieran, el cono terminaría en
 * un punto distinto del número grande — el clásico "dos verdades en pantalla".
 */
function proyectar(
  t: HistoryShift, m: number, current: number, min: number, method: ForecastMethod,
): number | null {
  const parcial = piecesAt(t.curve, min) ?? 0
  // Más allá del final de ese turno vale su total: no se extrapola a ciegas.
  const enM = m >= duracion(t) ? t.totalPieces : (piecesAt(t.curve, m) ?? t.totalPieces)
  if (method === 'proporcional') {
    return parcial > 0 ? current * (enM / parcial) : null
  }
  if (method === 'aditivo') {
    return current + Math.max(0, enM - parcial)
  }
  if (min <= 0) return null
  return current + (current / min) * Math.max(0, Math.min(m, duracion(t)) - min)
}

/** Error medio (MAPE) de un método, prediciendo cada turno con los demás. */
function errorDe(metodo: ForecastMethod, hist: HistoryShift[], min: number): number | null {
  const errores: number[] = []
  for (let i = 0; i < hist.length; i++) {
    const test = hist[i]!
    const entrenamiento = hist.filter((_, j) => j !== i)
    if (entrenamiento.length < 2) continue
    const parcial = piecesAt(test.curve, min) ?? 0
    if (parcial <= 0) continue
    const est = PREDICTORES[metodo](parcial, min, entrenamiento)
    if (est == null || !Number.isFinite(est)) continue
    errores.push((Math.abs(est - test.totalPieces) / test.totalPieces) * 100)
  }
  return errores.length >= 2 ? mediana(errores) : null
}

/**
 * Qué fracción de su total llevaban los turnos comparables a esta misma altura.
 *
 * Es lo que explica el pronóstico del método `proporcional` — el que suele
 * ganar de madrugada. Sin este dato, la pantalla mostraba dos cierres muy
 * distintos y le echaba la culpa al horario: el 26-08 a las 00:34 decía "al
 * ritmo de ahora, hasta las 05:00, 8.496 pz" y justo debajo "si se estira como
 * los últimos turnos (≈05:25), 18.212 pz". Veinticinco minutos no explican
 * 9.716 piezas: la diferencia es que los turnos anteriores, a esta altura,
 * llevaban menos de la mitad de lo que terminaron haciendo.
 *
 * Devuelve null si no hay con qué; se muestra solo cuando el método ganador es
 * el proporcional, que es de donde sale.
 */
export function fraccionTipicaAEstaAltura(
  history: HistoryShift[],
  currentMinute: number,
): number | null {
  const ratios = history
    .map((t) => (t.totalPieces > 0 ? (piecesAt(t.curve, currentMinute) ?? 0) / t.totalPieces : null))
    .filter((r): r is number => r != null && r > 0.05)
  if (ratios.length === 0) return null
  return mediana(ratios)
}

/**
 * De dónde sale el número, en una frase que se pueda discutir.
 *
 * Cada método mira otra cosa, y sin decirlo el pronóstico parece contradecir a
 * la proyección lineal: "hasta las 05:00, 8.496 pz" arriba y "18.212 pz" abajo,
 * con el rótulo culpando a 25 minutos de más.
 */
export function explicacionDelMetodo(
  metodo: ForecastMethod,
  history: HistoryShift[],
  currentMinute: number,
): string | null {
  if (metodo === 'proporcional') {
    const frac = fraccionTipicaAEstaAltura(history, currentMinute)
    if (frac == null) return null
    return `a esta altura llevaban el ${Math.round(frac * 100)}% de su total`
  }
  if (metodo === 'aditivo') {
    const deltas = history.map((t) => Math.max(0, t.totalPieces - (piecesAt(t.curve, currentMinute) ?? 0)))
    if (deltas.length === 0) return null
    return `desde esta altura sumaron ${Math.round(mediana(deltas)).toLocaleString('es-CL')} pz más`
  }
  // Decir que es ritmo de RELOJ no basta: lo que hace que este número sea el
  // más alto de la pantalla es que no descuenta las colaciones, y de madrugada
  // el convenio se lleva casi tres horas del turno.
  return 'manteniendo el ritmo de reloj, sin descontar colaciones, hasta el cierre típico'
}

/**
 * El pronóstico del cierre, con el método que mejor funciona EN ESTA LÍNEA.
 *
 * Devuelve null cuando no hay con qué: sin historial suficiente, sin piezas
 * todavía, o con el turno cerrado (ahí el total ya no es un pronóstico).
 */
export function buildForecast(args: {
  todayCurve: PacePoint[] | null | undefined
  /** Minutos de turno transcurridos. */
  currentMinute: number | null | undefined
  history: HistoryShift[]
  targetPieces?: number | null
  shiftClosed?: boolean
}): ForecastResult | null {
  const { todayCurve, currentMinute, shiftClosed } = args
  if (shiftClosed) return null
  if (!todayCurve || todayCurve.length === 0 || !currentMinute || currentMinute <= 0) return null

  const current = piecesAt(todayCurve, currentMinute) ?? 0
  if (current <= 0) return null

  const hist = comparables(args.history, currentMinute)
  if (hist.length < MIN_SAMPLES) return null

  // Se mide cada método y gana el de menor error. Nada cableado: si la línea
  // cambia de comportamiento, el ganador cambia solo en el próximo turno.
  let mejor: { method: ForecastMethod; mape: number } | null = null
  for (const m of Object.keys(PREDICTORES) as ForecastMethod[]) {
    const mape = errorDe(m, hist, currentMinute)
    if (mape == null) continue
    if (!mejor || mape < mejor.mape) mejor = { method: m, mape }
  }
  if (!mejor) return null

  const estimate = PREDICTORES[mejor.method](current, currentMinute, hist)
  if (estimate == null || !Number.isFinite(estimate)) return null

  /*
   * La banda no sale de la fórmula sino de los turnos uno por uno: dónde
   * habría terminado hoy si se comportara como cada uno de ellos. Así se
   * angosta sola a medida que avanza el turno, sin ningún parámetro.
   */
  const metodo = mejor.method
  const finales = hist
    .map((t) => proyectar(t, duracion(t), current, currentMinute, metodo))
    .filter((v): v is number => v != null && Number.isFinite(v))
    .sort((a, b) => a - b)

  const meta = args.targetPieces && args.targetPieces > 0 ? args.targetPieces : null

  /*
   * El cono: el mismo pronóstico hecho dibujo. Cada 15 minutos de acá al
   * cierre típico, dónde caería hoy según cada turno anterior. Nace en el
   * punto actual —los tres métodos dan exactamente `current` en `currentMinute`—
   * así que la banda sale de la curva y no flota por encima.
   */
  const finCono = Math.round(mediana(hist.map(duracion)))
  const alturas: number[] = []
  for (let m = currentMinute; m < finCono; m += 15) alturas.push(m)
  // El cierre SIEMPRE entra, caiga o no en el paso de 15: sin él el cono se
  // corta antes de tiempo y su punta no coincide con el número grande.
  if (finCono > currentMinute) alturas.push(finCono)

  const cone: ConePoint[] = []
  for (const m of alturas) {
    const vs = hist
      .map((t) => proyectar(t, m, current, currentMinute, metodo))
      .filter((v): v is number => v != null && Number.isFinite(v))
      .sort((a, b) => a - b)
    if (vs.length === 0) continue
    cone.push({
      minutes: m,
      low: Math.round(vs[0]!),
      mid: Math.round(mediana(vs)),
      high: Math.round(vs[vs.length - 1]!),
    })
  }

  return {
    estimate: Math.round(estimate),
    low: Math.round(finales[0] ?? estimate),
    high: Math.round(finales[finales.length - 1] ?? estimate),
    mapePct: Math.round(mejor.mape * 10) / 10,
    method: metodo,
    samples: hist.length,
    fraccionTipica: metodo === 'proporcional' ? fraccionTipicaAEstaAltura(hist, currentMinute) : null,
    explicacion: explicacionDelMetodo(metodo, hist, currentMinute),
    hitsTarget: meta != null ? finales.filter((v) => v >= meta).length : null,
    current,
    horizonMin: finCono,
    cone,
  }
}
