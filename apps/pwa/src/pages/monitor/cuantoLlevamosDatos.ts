/**
 * «¿Cuánto llevamos?» (mockup v4, opción 3 · barra apilada): piezas del grader, de las Baader y de la línea manual
 * desde el inicio del turno. Puro, sin React: lo usa la pestaña Grader en vivo y lo usará el monitor de Eviscerado.
 *
 * - Grader = piezas que leyó el espejo. kg = kg de salida (sin Gate 0).
 * - Baader = las 3 Baader 142 corridas el retraso de tránsito (una pieza tarda ~4 min en llegar al grader).
 * - Manual = grader − Baader LEÍDO: las Baader de los minutos que el espejo no leyó no se restan (no hay grader con
 *   qué compararlas); van aparte como «sin leer».
 */

/** Con menos de esta diferencia, la línea manual se muestra «≈ 0» (ruido de contar en dos lugares). */
export const MANUAL_CERO_PZ = 50

export interface CuentaTurno {
  grader: number
  kg: number
  /** Baader de los minutos que el espejo sí leyó. `null`: sin serie de las Baader. */
  baaderLeido: number | null
  /** Baader de los minutos sin lectura del espejo. */
  baaderSinLeer: number
}

export function cuentaDelTurno(
  s: { pz: readonly number[]; kgSalida: readonly number[]; hastaMin: number },
  baader: readonly number[] | null,
  retrasoMin: number,
  sinLectura: readonly boolean[] = [],
): CuentaTurno {
  const L = Math.max(0, Math.round(retrasoMin))
  let grader = 0
  let kg = 0
  let leido = 0
  let sinLeer = 0
  for (let m = 0; m < s.hastaMin; m++) {
    grader += s.pz[m] ?? 0
    kg += s.kgSalida[m] ?? 0
    if (!baader) continue
    const v = baader[m - L]
    if (v === undefined || !Number.isFinite(v)) continue
    if (sinLectura[m]) sinLeer += v
    else leido += v
  }
  return { grader, kg, baaderLeido: baader ? leido : null, baaderSinLeer: sinLeer }
}

/** Piezas manuales con signo (`null` sin Baader). */
export function manualPz(c: CuentaTurno): number | null {
  return c.baaderLeido === null ? null : c.grader - c.baaderLeido
}

/** «+2.454», «−120» o «≈ 0» (con menos de {@link MANUAL_CERO_PZ} de diferencia). */
export function textoManual(m: number | null): string {
  if (m === null) return '—'
  if (Math.abs(m) < MANUAL_CERO_PZ) return '≈ 0'
  const abs = String(Math.round(Math.abs(m))).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${m > 0 ? '+' : '−'}${abs}`
}

/** Anchos (en %) de la barra apilada: Baader leído · manual (solo si es positiva) · Baader sin leer. */
export function tramosBarra(c: CuentaTurno): { baader: number; manual: number; sinLeer: number } {
  const b = c.baaderLeido ?? 0
  const m = Math.max(0, manualPz(c) ?? 0)
  const tot = b + m + c.baaderSinLeer
  if (tot <= 0) return { baader: 0, manual: 0, sinLeer: 0 }
  return { baader: (b / tot) * 100, manual: (m / tot) * 100, sinLeer: (c.baaderSinLeer / tot) * 100 }
}
