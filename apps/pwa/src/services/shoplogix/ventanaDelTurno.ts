/**
 * El horario PLANIFICADO del turno y el REAL, cuando no son el mismo.
 *
 * POR QUÉ EXISTE
 * --------------
 * Orel, comparando el monitor con la pantalla de Shoplogix (26-08):
 * «el turno está asumiendo turno de 7:15 a 15:00, pero si el turno inició
 * después y terminó después, pues debes poner el turno real al lado del que
 * estaba planificado, y ya».
 *
 * La cabecera mostraba un solo rango y no decía cuál era. Y los dos se mueven
 * de verdad, no es un detalle: en Chonchi el mismo «Turno 2» fue
 *
 *     24-08   planificado 09:15 → 17:00   ·   real 09:17 → 16:56
 *     26-08   planificado 07:15 → 15:00   ·   real 07:20 → 15:10
 *
 * Con un solo rango en pantalla, quien cruza el monitor con Shoplogix no puede
 * saber si está mirando lo mismo — y ahí es donde se pierde la confianza.
 */

export interface VentanaDelTurno {
  /** Lo que decía el calendario. */
  planificado: { desde: string; hasta: string }
  /** Lo que pasó de verdad, solo si difiere de forma visible. */
  real: { desde: string; hasta: string } | null
}

/** Diferencia mínima para molestarse en mostrar los dos rangos. */
const MIN_DIFERENCIA = 5

const hhmm = (iso: string): string | null => {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

const lejos = (a: string | null | undefined, b: string | null | undefined): boolean => {
  if (!a || !b) return false
  const x = Date.parse(a); const y = Date.parse(b)
  if (Number.isNaN(x) || Number.isNaN(y)) return false
  return Math.abs(x - y) >= MIN_DIFERENCIA * 60_000
}

export function ventanaDelTurno(args: {
  scheduledStart?: string | null
  scheduledEnd?: string | null
  /** Primera pieza. */
  realStart?: string | null
  /** Último tramo con datos. */
  realEnd?: string | null
}): VentanaDelTurno | null {
  const pd = args.scheduledStart ? hhmm(args.scheduledStart) : null
  const ph = args.scheduledEnd ? hhmm(args.scheduledEnd) : null
  if (!pd || !ph) return null

  const rd = args.realStart ? hhmm(args.realStart) : null
  const rh = args.realEnd ? hhmm(args.realEnd) : null
  /*
   * Solo se muestra el real si de verdad se corrió: arrancar dos minutos tarde
   * es lo normal y poner dos rangos casi iguales es ruido. Si se corrió UNO de
   * los dos extremos se muestran los dos, para no dejar medio rango colgando.
   */
  const distinto = lejos(args.scheduledStart, args.realStart)
    || lejos(args.scheduledEnd, args.realEnd)

  return {
    planificado: { desde: pd, hasta: ph },
    real: distinto && rd && rh ? { desde: rd, hasta: rh } : null,
  }
}
