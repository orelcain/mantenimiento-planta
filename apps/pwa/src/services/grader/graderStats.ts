/**
 * Funciones estadísticas puras para el módulo Grader.
 * Reutilizables y testeables de forma aislada.
 */

/** Percentil (0..100). Interpolación lineal. */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  if (sorted.length === 1) return sorted[0]!
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  if (lo === hi) return sorted[lo]!
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo)
}

/** Mediana */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return percentile(s, 50)
}

/** Promedio */
export function mean(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((a, b) => a + b, 0) / values.length
}

/** Desviación estándar (poblacional) */
export function stdDev(values: number[]): number {
  if (values.length < 2) return 0
  const m = mean(values)
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

/** Media móvil simple. Retorna undefined para posiciones sin ventana completa. */
export function movingAverage(values: number[], window: number): (number | undefined)[] {
  return values.map((_, i) => {
    if (i < window - 1) return undefined
    let sum = 0
    for (let j = i - window + 1; j <= i; j++) sum += values[j]!
    return sum / window
  })
}

/** Regresión lineal simple: y = slope * x + intercept */
export function linearRegression(xs: number[], ys: number[]): {
  slope: number
  intercept: number
  r2: number
} {
  const n = xs.length
  if (n < 2) return { slope: 0, intercept: ys[0] ?? 0, r2: 0 }

  const mx = mean(xs)
  const my = mean(ys)

  let num = 0, den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i]! - mx) * (ys[i]! - my)
    den += (xs[i]! - mx) ** 2
  }

  const slope = den === 0 ? 0 : num / den
  const intercept = my - slope * mx

  // R²
  const ssRes = ys.reduce((s, y, i) => s + (y - (slope * xs[i]! + intercept)) ** 2, 0)
  const ssTot = ys.reduce((s, y) => s + (y - my) ** 2, 0)
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot

  return { slope, intercept, r2 }
}

/**
 * Índice Herfindahl-Hirschman (HHI) de concentración.
 * Recibe participaciones como fracción (0-1). Retorna 0-1.
 * HHI ≈ 0 = distribución muy diversificada
 * HHI ≈ 1 = altamente concentrado en una sola celda
 */
export function herfindahlIndex(shares: number[]): number {
  if (shares.length === 0) return 0
  return shares.reduce((s, p) => s + p * p, 0)
}

/** Coeficiente de variación (CV = stdDev / mean) */
export function coefficientOfVariation(values: number[]): number {
  const m = mean(values)
  if (m === 0) return 0
  return stdDev(values) / m
}

/** Redondea a N decimales */
export function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}
