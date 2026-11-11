/**
 * Cobertura de fotos del catálogo de repuestos: qué filas tienen foto real (bodega u otra),
 * cuáles solo recorte del manual y cuáles ninguna. Alimenta la vista «Galería».
 */
import { esComun, type FilaFiltrable } from '@/hooks/repuestos/filtrosDeRepuestos'
import { origenDeFoto } from './origenFoto'

export type ClaseFotos = 'real' | 'manual' | 'sin'

/** 'real' si alguna foto NO es del manual; 'manual' si todas lo son; 'sin' si no hay. */
export function claseFotos(fotos: string[]): ClaseFotos {
  if (fotos.length === 0) return 'sin'
  return fotos.some((f) => origenDeFoto(f) !== 'manual') ? 'real' : 'manual'
}

/** Foto de portada: la primera que no es del manual; si no hay, la primera del manual. */
export function portada(fotos: string[]): string | undefined {
  return fotos.find((f) => origenDeFoto(f) !== 'manual') ?? fotos[0]
}

export interface Cobertura {
  total: number
  real: number
  manual: number
  sin: number
  /** Porcentaje entero (redondeado) de filas con foto real. 0 si no hay filas. */
  pctReal: number
}

export function coberturaFotos<T>(rows: readonly T[], fotosDe: (r: T) => string[]): Cobertura {
  let real = 0
  let manual = 0
  let sin = 0
  for (const r of rows) {
    const c = claseFotos(fotosDe(r))
    if (c === 'real') real++
    else if (c === 'manual') manual++
    else sin++
  }
  const total = rows.length
  return { total, real, manual, sin, pctReal: total === 0 ? 0 : Math.round((real / total) * 100) }
}

export interface FilaSinFoto extends FilaFiltrable {
  stockActual?: number | null
}

/** Prioridad de trabajo: comunes primero, luego con stock > 0, luego el resto. Estable. */
export function ordenarSinFoto<T extends FilaSinFoto>(rows: readonly T[]): T[] {
  const rango = (r: T) => (esComun(r) ? 0 : (r.stockActual ?? 0) > 0 ? 1 : 2)
  return rows
    .map((r, i) => ({ r, i, k: rango(r) }))
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.r)
}
