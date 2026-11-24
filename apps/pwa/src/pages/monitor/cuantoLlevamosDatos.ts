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

export interface ExtraTurno {
  /** Piezas por hora de la última hora leída (proyectado a 60 min si lleva menos). */
  ritmoHora: number
  /** Piezas por hora promedio del turno hasta ahora. */
  ritmoTurno: number
  /** % de P0 del turno (`null` sin piezas o sin Gate 0). */
  p0Pct: number | null
  p0Pz: number
  /** Piezas al cierre del turno al ritmo de la última hora; `null` si el turno ya cerró o no hay con qué proyectar. */
  alCierre: number | null
  /** Minutos que faltan para el fin del turno (0 si cerró). */
  faltanMin: number
  /** Minutos del turno hasta la última pieza leída. */
  minTurno: number
  /** De esos, minutos con al menos una pieza en el grader. */
  minActivos: number
  /** Minutos que mide «la última hora» (menos de 60 al empezar el turno). */
  minHora: number
}

/** Antes de estos minutos de turno, el ritmo no se proyecta al cierre ni se estima la línea manual (video 23-11). */
export const MIN_PARA_ESTIMAR = 30

/** Ritmo y proyección al cierre con números planos (sirve igual para Eviscerado). `pz` por minuto del turno. */
export function extraDelTurno(pz: readonly number[], hastaMin: number, totalMin: number, enCurso: boolean, g0Pz: number): ExtraTurno {
  const ini = Math.max(0, hastaMin - 60)
  let ult = 0
  let todo = 0
  let activos = 0
  for (let m = 0; m < hastaMin; m++) {
    const v = pz[m] ?? 0
    todo += v
    if (v > 0) activos++
    if (m >= ini) ult += v
  }
  const minUlt = hastaMin - ini
  const ritmoHora = minUlt > 0 ? (ult * 60) / minUlt : 0
  const ritmoTurno = hastaMin > 0 ? (todo * 60) / hastaMin : 0
  const faltanMin = enCurso ? Math.max(0, totalMin - hastaMin) : 0
  return {
    ritmoHora,
    ritmoTurno,
    p0Pct: todo > 0 && g0Pz > 0 ? (g0Pz / todo) * 100 : null,
    p0Pz: g0Pz,
    alCierre: enCurso && faltanMin > 0 && minUlt >= MIN_PARA_ESTIMAR ? todo + (ritmoHora * faltanMin) / 60 : null,
    faltanMin,
    minTurno: hastaMin,
    minActivos: activos,
    minHora: minUlt,
  }
}

export interface HoraGrader {
  /** Número de hora del turno, desde 1. */
  n: number
  /** Minuto del turno en que empieza. */
  desdeMin: number
  /** Minutos leídos de esa hora (60 salvo la última, que puede venir en curso o cortada). */
  minutos: number
  pz: number
  /** Piezas por hora de esa hora (proyectado a 60 min si es parcial). */
  ritmo: number
  /** Minutos con al menos una pieza. */
  activos: number
  parcial: boolean
}

/** Piezas del grader por hora del turno (horas corridas desde el inicio, como las del monitor de la Baader). `pz` por minuto. */
export function horasDelTurno(pz: readonly number[], hastaMin: number): HoraGrader[] {
  const out: HoraGrader[] = []
  for (let d = 0; d < hastaMin; d += 60) {
    const fin = Math.min(hastaMin, d + 60)
    let suma = 0
    let activos = 0
    for (let m = d; m < fin; m++) {
      const v = pz[m] ?? 0
      suma += v
      if (v > 0) activos++
    }
    const minutos = fin - d
    out.push({ n: out.length + 1, desdeMin: d, minutos, pz: suma, ritmo: (suma * 60) / minutos, activos, parcial: minutos < 60 })
  }
  return out
}

/** Mejor y peor hora COMPLETA (una hora a medias no compite). `null` si hay menos de dos completas. */
export function extremosHoras(horas: readonly HoraGrader[]): { mejor: HoraGrader; peor: HoraGrader } | null {
  const c = horas.filter((h) => !h.parcial)
  if (c.length < 2) return null
  let mejor = c[0]!
  let peor = c[0]!
  for (const h of c) {
    if (h.pz > mejor.pz) mejor = h
    if (h.pz < peor.pz) peor = h
  }
  return { mejor, peor }
}
