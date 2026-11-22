/**
 * Series de la pestaña Grader en vivo (etapa E-A), lógica pura sobre arreglos por minuto
 * (`SerieGrader` de `espejoMinutos.ts` y la serie por minuto de las Baader de Shoplogix).
 *
 * Convención: wall-clock-as-UTC en todo (la hora de planta es la del ISO); nada usa la
 * zona del navegador.
 */
import { horaDelEje, sumarCalibres, tramos15, type MinutosGrader } from './alertasGrader'

/**
 * Retraso Baader → grader cuando el turno en curso no alcanza para medirlo. Medido el 21-11 con la correlación
 * de las curvas por minuto (Pieza pieza cargado por Excel contra la serie de Shoplogix): 18-11 turno 1 r 0,88 y
 * 19-11 turno 2 r 0,85, los dos con el máximo en 3 min.
 */
export const RETRASO_REFERENCIA_MIN = 3
export const RETRASO_REFERENCIA_FUENTE = 'referencia de los turnos del 18 y 19-11'

/** Límites de la medición del retraso. */
export const RETRASO_MAX_MIN = 15
export const RETRASO_MIN_MINUTOS = 120
export const RETRASO_MIN_R = 0.5

/** Serie por minuto de Shoplogix tal como la publica el monitor (`serieMinuto`). */
export interface SerieMinutoBaader {
  desde: string
  maquinas: Array<{ cycles: number[] }>
}

/**
 * Piezas por minuto de las Baader sumadas, en el eje del grader (minuto 0 = `t0Ms`). Solo minutos cerrados. Los
 * minutos ANTES de que empiece la serie van en `NaN` (sin cobertura), no en 0: un cero inventaría línea manual y
 * ensuciaría la correlación del retraso.
 */
export function baaderEnEje(s: SerieMinutoBaader | null | undefined, t0Ms: number): number[] | null {
  if (!s || s.maquinas.length === 0) return null
  const d = Date.parse(s.desde.endsWith('Z') ? s.desde : `${s.desde}Z`)
  if (Number.isNaN(d)) return null
  const t0 = Math.floor(t0Ms / 60_000) * 60_000
  const off = Math.round((d - t0) / 60_000)
  const largo = Math.max(...s.maquinas.map((m) => m.cycles.length))
  const n = off + largo
  if (n <= 0) return []
  const out = new Array<number>(n).fill(0)
  for (let k = 0; k < Math.min(off, n); k++) out[k] = NaN
  for (const m of s.maquinas) {
    for (let i = 0; i < m.cycles.length; i++) {
      const k = off + i
      if (k >= 0) out[k] = (out[k] ?? 0) + (m.cycles[i] ?? 0)
    }
  }
  return out
}

function pearson(a: number[], b: number[]): number | null {
  const n = a.length
  if (n < 2) return null
  let ma = 0
  let mb = 0
  for (let i = 0; i < n; i++) { ma += a[i]!; mb += b[i]! }
  ma /= n
  mb /= n
  let s = 0
  let sa = 0
  let sb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i]! - ma
    const y = b[i]! - mb
    s += x * y
    sa += x * x
    sb += y * y
  }
  if (sa === 0 || sb === 0) return null
  return s / Math.sqrt(sa * sb)
}

export interface Retraso {
  min: number
  /** Correlación en ese retraso; `null` cuando es la referencia. */
  r: number | null
  medido: boolean
}

/**
 * Mide el retraso con la correlación cruzada de las dos curvas por minuto (0 a 15 min). Solo usa minutos con
 * dato de los dos lados; pide ≥ 120 minutos y r ≥ 0,5. Si no alcanza, devuelve `null` (la pantalla usa la
 * referencia y lo dice).
 */
export function medirRetraso(baader: number[] | null, grader: number[], hastaMin: number, sinLectura: readonly boolean[] = []): Retraso | null {
  if (!baader) return null
  let mejor: Retraso | null = null
  for (let L = 0; L <= RETRASO_MAX_MIN; L++) {
    const a: number[] = []
    const b: number[] = []
    for (let m = L; m < Math.min(hastaMin, grader.length); m++) {
      const k = m - L
      if (k >= baader.length) break
      const v = baader[k] ?? 0
      if (!Number.isFinite(v) || sinLectura[m]) continue // sin cobertura de Shoplogix o minuto que el espejo no leyó
      a.push(v)
      b.push(grader[m] ?? 0)
    }
    if (a.length < RETRASO_MIN_MINUTOS) continue
    const r = pearson(a, b)
    if (r !== null && (!mejor || r > (mejor.r ?? -1))) mejor = { min: L, r, medido: true }
  }
  return mejor && (mejor.r ?? 0) >= RETRASO_MIN_R ? mejor : null
}

export function retrasoOReferencia(baader: number[] | null, grader: number[], hastaMin: number, sinLectura: readonly boolean[] = []): Retraso {
  return medirRetraso(baader, grader, hastaMin, sinLectura) ?? { min: RETRASO_REFERENCIA_MIN, r: null, medido: false }
}

export interface TramoP0 {
  desde: number
  hasta: number
  rotulo: string
  total: number
  g0: number
  pct: number | null
  completo: boolean
  /** Menos piezas que la masa mínima: el % es ruido. */
  pocaMasa: boolean
}

/** P0 % por tramo de 15 min del reloj, hasta la última pieza leída. */
export function p0Por15(s: MinutosGrader & { t0Ms: number; hastaMin: number }, minPiezas: number): TramoP0[] {
  return tramos15(s.t0Ms, s.hastaMin).map((t) => {
    let total = 0
    let g0 = 0
    for (let m = t.desde; m < t.hasta; m++) { total += s.pz[m] ?? 0; g0 += s.g0[m] ?? 0 }
    return {
      ...t,
      rotulo: `${horaDelEje(s.t0Ms, t.desde)}–${horaDelEje(s.t0Ms, t.hasta)}`,
      total,
      g0,
      pct: total > 0 ? (g0 / total) * 100 : null,
      pocaMasa: total < minPiezas,
    }
  })
}

export interface HoraManual {
  /** «HH:00». */
  hora: string
  grader: number
  baader: number
  /** Grader − Baader: positivo = piezas que entraron al grader sin pasar por las Baader. `null` = sin lectura. */
  diferencia: number | null
  /** El espejo no leyó parte de la hora (`minutosSinLectura`): la resta saldría negativa y falsa. */
  sinLectura: boolean
}

/**
 * Línea manual por hora de reloj COMPLETA: piezas del grader de la hora menos las de las Baader de la misma hora
 * corrida por el retraso. La hora en curso no entra (saldría negativa), ni una hora sin la serie de las Baader
 * completa para ese tramo. Una hora que toca un minuto sin lectura del espejo sale marcada, sin diferencia.
 */
export function lineaManualPorHora(
  s: { t0Ms: number; pz: number[]; hastaMin: number },
  baader: number[] | null,
  retrasoMin: number,
  sinLectura: readonly boolean[] = [],
): HoraManual[] {
  if (!baader) return []
  const L = Math.max(0, Math.round(retrasoMin))
  const out: HoraManual[] = []
  const minDia = Math.floor(s.t0Ms / 60_000)
  const resto = ((minDia % 60) + 60) % 60
  // Primer borde de hora en o después del minuto 0; la primera hora parcial (turno que empieza 07:15) no se cuenta.
  for (let a = resto === 0 ? 0 : 60 - resto; a + 60 <= s.hastaMin; a += 60) {
    if (a - L < 0 || a + 60 - L > baader.length) continue
    let g = 0
    let b = 0
    let cubierta = true
    let leida = true
    for (let m = a; m < a + 60; m++) {
      if (sinLectura[m]) leida = false
      const v = baader[m - L] ?? 0
      if (!Number.isFinite(v)) { cubierta = false; break }
      g += s.pz[m] ?? 0
      b += v
    }
    if (!cubierta) continue // la serie de las Baader no cubre esa hora entera
    out.push({ hora: horaDelEje(s.t0Ms, a), grader: g, baader: b, diferencia: leida ? g - b : null, sinLectura: !leida })
  }
  return out
}

export interface Salida {
  /** Minutos que cubre (60, o menos si el turno lleva menos de una hora). */
  minutos: number
  piezas: number
  kg: number
  /** Proyectado a 60 min. */
  piezasH: number
  kgH: number
  pesoMedio: number | null
}

/** Salida (Gate 1 en adelante, con peso) de la última hora hasta la última pieza leída. */
export function salidaUltimaHora(s: MinutosGrader & { hastaMin: number }): Salida | null {
  const h = s.hastaMin
  const ini = Math.max(0, h - 60)
  const minutos = h - ini
  if (minutos <= 0) return null
  let piezas = 0
  let kg = 0
  for (let m = ini; m < h; m++) { piezas += s.pzPeso[m] ?? 0; kg += s.kgSalida[m] ?? 0 }
  const f = 60 / minutos
  return { minutos, piezas, kg, piezasH: piezas * f, kgH: kg * f, pesoMedio: piezas > 0 ? kg / piezas : null }
}

/** Reparto en % de mayor a menor. */
export function repartoPct(r: Record<string, number>): Array<{ clave: string; n: number; pct: number }> {
  const total = Object.values(r).reduce((a, b) => a + b, 0)
  if (total <= 0) return []
  return Object.entries(r)
    .filter(([, n]) => n > 0)
    .map(([clave, n]) => ({ clave, n, pct: (n / total) * 100 }))
    .sort((a, b) => b.n - a.n || a.clave.localeCompare(b.clave))
}

/** Calibre y calidad de la salida en [0, hasta). */
export function repartoDelTurno(s: MinutosGrader & { calidad: Array<Record<string, number> | undefined>; hastaMin: number }) {
  return {
    calibre: repartoPct(sumarCalibres(s.calibre, 0, s.hastaMin)),
    calidad: repartoPct(sumarCalibres(s.calidad, 0, s.hastaMin)),
  }
}

export interface TotalesTurno {
  piezas: number
  g0: number
  /** `null` sin Gate 0: con Gate 0 en cero no se inventa un 0 %. */
  p0: number | null
}

export function totalesDelTurno(s: { pz: number[]; g0: number[]; hastaMin: number }): TotalesTurno {
  let piezas = 0
  let g0 = 0
  for (let m = 0; m < s.hastaMin; m++) { piezas += s.pz[m] ?? 0; g0 += s.g0[m] ?? 0 }
  return { piezas, g0, p0: g0 > 0 && piezas > 0 ? (g0 / piezas) * 100 : null }
}

/** Promedio móvil hacia atrás de `k` minutos (suaviza la curva sin adelantarla). */
export function movil(a: readonly number[], k: number): number[] {
  const out = new Array<number>(a.length)
  let s = 0
  for (let i = 0; i < a.length; i++) {
    s += a[i] ?? 0
    if (i >= k) s -= a[i - k] ?? 0
    out[i] = s / Math.min(i + 1, k)
  }
  return out
}
