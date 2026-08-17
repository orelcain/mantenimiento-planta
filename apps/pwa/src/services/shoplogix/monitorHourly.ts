/**
 * monitorHourly.ts — el turno hora por hora, para el monitor público.
 *
 * Nace de un caso concreto (Orel, 12-08): un supervisor dijo que "en la primera
 * hora hicieron 800 piezas". Sin el desglose no había con qué contrastarlo — el
 * monitor mostraba el total y la cadencia promedio, que no responden esa
 * pregunta.
 *
 * Se calcula en el cliente desde `live.series`, que ya viaja en el doc espejo:
 * tramos de 5 min cubriendo hasta 16 h. No hace falta tocar el backend ni
 * guardar nada nuevo.
 *
 * ── Horas CORRIDAS desde el arranque, no horas de reloj ─────────────────────
 *
 * La hora 1 va del arranque a +60 min: si el turno partió 07:45, va de 07:45 a
 * 08:45 (Orel, 12-08 — es además como cuenta Shoplogix). Agrupando por hora de
 * reloj, "la primera hora" de un turno que arranca 07:45 son 15 minutos, y
 * contrastar contra ella la frase "en la primera hora hicieron 800" da un
 * resultado sin sentido. Solo la ÚLTIMA fila puede ser parcial, porque el turno
 * sigue en curso; por eso cada fila lleva las dos cosas: las piezas que salieron
 * y el ritmo equivalente en pz/h.
 */

/** Un tramo de la serie del monitor: `t` ISO wall-clock, `pieces` del tramo. */
import { desdePrimeraPieza } from './monitorActividad'

export interface MonitorSeriesPoint {
  t: string
  pieces: number
}

export interface HourlyRow {
  /** Inicio de la hora corrida, ISO wall-clock. Sirve de key. */
  hourStart: string
  /** Nº de hora del turno, 1-based: 1 = de arranque a +60 min. */
  index: number
  /**
   * Tramo REAL que cubre la fila, ISO wall-clock: 07:45–08:45, 08:45–09:45…
   * Se muestra el tramo y no "hora 1" a secas para que se pueda cruzar con lo
   * que dijo el supervisor, que habla en hora de reloj.
   */
  from: string
  to: string
  pieces: number
  /** Minutos de esa hora que la serie cubre (60 salvo, quizá, la última). */
  minutesCovered: number
  /** Ritmo equivalente: lo que habría dado esa hora completa a ese ritmo. */
  piecesPerHour: number
  /** true si la hora está incompleta — no se compara de igual a igual. */
  partial: boolean
}

/** Tramos de 5 min: es la granularidad con la que sincroniza Shoplogix. */
const BUCKET_MIN = 5

/**
 * Agrupa la serie en horas CORRIDAS desde el primer tramo con dato.
 *
 * El arranque es la primera PIEZA y no `scheduledStart` ni el primer tramo
 * sincronizado: el horario programado puede estar 20 minutos antes de que salga
 * la primera, y esos minutos vacíos correrían todas las filas.
 *
 * ⚠ Esto lo prometía el comentario y no lo hacía el código: se tomaba el primer
 * tramo con dato. Con un turno sin definir en Shoplogix (Filete de noche: serie
 * desde 09:45, primera pieza 21:45) salían doce filas h1..h12 con 0 pz antes de
 * la primera con producción.
 *
 * ⚠ Wall-clock: los ISO del monitor llevan Z pero son hora de planta, así que
 * el reloj se lee con `getUTC*`. Con `getHours()` los tramos se correrían al
 * huso del celular de quien mira — y el supervisor y el monitor estarían
 * hablando de horas distintas, que es lo contrario de lo que se busca acá.
 */
export function buildHourlyRows(series: MonitorSeriesPoint[] | null | undefined): HourlyRow[] {
  if (!series || series.length === 0) return []

  const puntos = desdePrimeraPieza(series)
    .map((p) => ({ ms: Date.parse(p.t), pieces: p.pieces || 0 }))
    .filter((p) => !Number.isNaN(p.ms))
    .sort((a, b) => a.ms - b.ms)
  if (puntos.length === 0) return []

  const t0 = puntos[0]!.ms
  const porHora = new Map<number, { pieces: number; buckets: number }>()
  for (const p of puntos) {
    const idx = Math.floor((p.ms - t0) / (60 * 60_000))
    const acc = porHora.get(idx) ?? { pieces: 0, buckets: 0 }
    acc.pieces += p.pieces
    acc.buckets += 1
    porHora.set(idx, acc)
  }

  return [...porHora.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, acc]) => {
      const desde = t0 + idx * 60 * 60_000
      const minutesCovered = Math.min(60, acc.buckets * BUCKET_MIN)
      return {
        hourStart: new Date(desde).toISOString(),
        index: idx + 1,
        from: new Date(desde).toISOString(),
        to: new Date(desde + minutesCovered * 60_000).toISOString(),
        pieces: acc.pieces,
        minutesCovered,
        piecesPerHour: minutesCovered > 0 ? Math.round((acc.pieces / minutesCovered) * 60) : 0,
        partial: minutesCovered < 60,
      }
    })
}

/** La hora con más piezas — para escalar las barras y destacar el pico. */
export function peakPieces(rows: HourlyRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.pieces), 0)
}
