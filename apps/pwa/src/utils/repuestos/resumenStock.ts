/**
 * Resumen de stock de las filas que el usuario está viendo (fila compacta de KPIs de Repuestos).
 *
 * Lógica pura: el llamador decide QUÉ filas entran (todo menos el propio filtro de stock) y
 * pasa `esComun` (de `hooks/repuestos/filtrosDeRepuestos`).
 */

export interface FilaResumenStock {
  stockStatus: 'ok' | 'low' | 'out' | 'unset'
  stockActual?: number | null
  costoCompra?: number | null
  valorUnitario?: number | null
}

export interface ResumenStock {
  total: number
  ok: number
  low: number
  out: number
  unset: number
  /** Comunes (de uso frecuente) agotados: lo que más urge reponer. */
  comunSinStock: number
  /** Valor referencial del inventario: Σ (costoCompra ?? valorUnitario ?? 0) × stockActual. */
  valor: number
}

export function resumenStock<R extends FilaResumenStock>(rows: readonly R[], esComun: (r: R) => boolean): ResumenStock {
  const res: ResumenStock = { total: rows.length, ok: 0, low: 0, out: 0, unset: 0, comunSinStock: 0, valor: 0 }
  for (const r of rows) {
    res[r.stockStatus]++
    if (r.stockStatus === 'out' && esComun(r)) res.comunSinStock++
    res.valor += (r.costoCompra ?? r.valorUnitario ?? 0) * (r.stockActual || 0)
  }
  return res
}

/** «$1,2 M», «$559 mil», «$850» (es-CL: coma decimal). Vacío si no hay valor. */
export function formatoValorCompacto(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return ''
  const fmt = (v: number) => v.toLocaleString('es-CL', { maximumFractionDigits: 1 })
  if (n >= 1_000_000) return `$${fmt(Math.round(n / 100_000) / 10)} M`
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString('es-CL')} mil`
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
