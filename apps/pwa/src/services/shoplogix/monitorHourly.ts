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
 * ── Las horas parciales son el punto ────────────────────────────────────────
 *
 * Un turno que arranca 21:15 tiene una "primera hora" de 45 minutos. Comparar
 * sus piezas contra las de una hora completa es justamente el error que esta
 * vista viene a evitar, así que cada fila lleva las DOS cosas: las piezas que
 * salieron de verdad y el ritmo equivalente en pz/h. La afirmación "hicimos 800
 * en la primera hora" se contrasta contra el ritmo, no contra el total.
 */

/** Un tramo de la serie del monitor: `t` ISO wall-clock, `pieces` del tramo. */
export interface MonitorSeriesPoint {
  t: string
  pieces: number
}

export interface HourlyRow {
  /** Inicio de la hora de reloj, ISO wall-clock. */
  hourStart: string
  /** Hora de planta 0-23, ya en wall-clock. */
  hour: number
  /**
   * Tramo REAL que cubre la fila, ISO wall-clock. En las horas de los extremos
   * no es la hora entera: si el turno arrancó 07:45, la fila de las 07 va de
   * 07:45 a 08:00. Decir "07h" a secas invitaba a compararla con una hora
   * completa, que es justo lo que hay que evitar.
   */
  from: string
  to: string
  pieces: number
  /** Minutos de esa hora que la serie cubre (60 salvo la primera y la última). */
  minutesCovered: number
  /** Ritmo equivalente: lo que habría dado esa hora completa a ese ritmo. */
  piecesPerHour: number
  /** true si la hora está incompleta — no se compara de igual a igual. */
  partial: boolean
}

/** Tramos de 5 min: es la granularidad con la que sincroniza Shoplogix. */
const BUCKET_MIN = 5

/**
 * Agrupa la serie por hora de reloj de planta.
 *
 * ⚠ Wall-clock: los ISO del monitor llevan Z pero son hora de planta, así que
 * la hora se lee con `getUTCHours()`. Con `getHours()` el desglose se correría
 * al huso del celular de quien mira — y el supervisor y el monitor estarían
 * hablando de horas distintas, que es lo contrario de lo que se busca acá.
 */
export function buildHourlyRows(series: MonitorSeriesPoint[] | null | undefined): HourlyRow[] {
  if (!series || series.length === 0) return []

  const byHour = new Map<number, { pieces: number; buckets: number; firstMs: number; lastMs: number }>()
  for (const p of series) {
    const ms = Date.parse(p.t)
    if (Number.isNaN(ms)) continue
    const d = new Date(ms)
    // Inicio de la hora, en el mismo wall-clock que el resto del monitor.
    const hourMs = Date.UTC(
      d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), 0, 0, 0,
    )
    const acc = byHour.get(hourMs) ?? { pieces: 0, buckets: 0, firstMs: ms, lastMs: ms }
    acc.pieces += p.pieces || 0
    acc.buckets += 1
    acc.firstMs = Math.min(acc.firstMs, ms)
    acc.lastMs = Math.max(acc.lastMs, ms)
    byHour.set(hourMs, acc)
  }

  return [...byHour.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([hourMs, acc]) => {
      const minutesCovered = Math.min(60, acc.buckets * BUCKET_MIN)
      /*
       * El tramo va del primer bucket al FIN del último (+5 min), acotado a la
       * hora: un bucket que empieza 07:55 cubre hasta las 08:00, y sin el `min`
       * la fila de las 07 diría que llega hasta las 08:00 del cierre siguiente.
       */
      const to = Math.min(acc.lastMs + BUCKET_MIN * 60_000, hourMs + 60 * 60_000)
      return {
        hourStart: new Date(hourMs).toISOString(),
        hour: new Date(hourMs).getUTCHours(),
        from: new Date(acc.firstMs).toISOString(),
        to: new Date(to).toISOString(),
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
