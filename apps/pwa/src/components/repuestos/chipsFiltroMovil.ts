/**
 * Lógica pura de la fila de chips del teléfono (lista de Repuestos, piel Apple):
 * qué chips de estado se dibujan y cuándo el chip «Más» figura activo.
 *
 * Plan: docs/PLAN_LISTA_REPUESTOS_MOVIL.md. El estado de filtro es el mismo de siempre
 * (`EstadoResumenStock`); aquí solo se decide qué se ve.
 */
import type { EstadoResumenStock } from './ResumenStockFila'

export type ClaveChipEstado = 'todos' | 'low' | 'out'

export interface ChipEstado {
  clave: ClaveChipEstado
  etiqueta: string
  n: number
  activo: boolean
}

/**
 * `Todos N` siempre; `Bajo N` y `Sin stock N` solo con N > 0 o si ya están activos
 * (para poder quitarlos). Disponibles y Común sin stock viven en «Más».
 */
export function chipsFiltroMovil(r: { total: number; low: number; out: number; estadoActivo: EstadoResumenStock }): ChipEstado[] {
  const chips: ChipEstado[] = [{ clave: 'todos', etiqueta: 'Todos', n: r.total, activo: r.estadoActivo === null }]
  if (r.low > 0 || r.estadoActivo === 'low') chips.push({ clave: 'low', etiqueta: 'Bajo', n: r.low, activo: r.estadoActivo === 'low' })
  if (r.out > 0 || r.estadoActivo === 'out') chips.push({ clave: 'out', etiqueta: 'Sin stock', n: r.out, activo: r.estadoActivo === 'out' })
  return chips
}

export interface EntradaMas {
  estadoActivo: EstadoResumenStock
  favOnly: boolean
  /** Hay un filtro de «Favoritos de este equipo» (o de una de sus listas). */
  favEquipo: boolean
  /** Hay un equipo o faceta elegido en los chips de equipo. */
  faceta: boolean
  conFotos: boolean
  galeria: boolean
  /** `filtrosActivos` del hub: ya incluye el filtro de stock (1) y «solo comunes» (+1). */
  filtrosHojaTotal: number
}

/**
 * Filtros de la hoja «Filtros» que quedan al restar el estado de stock, que ya tiene su propio
 * lugar (chips o «Más»). Disponibles, Bajo y Sin stock restan 1; Común sin stock resta 2.
 */
export function filtrosHojaRestantes(filtrosHojaTotal: number, estadoActivo: EstadoResumenStock): number {
  const delEstado = estadoActivo === 'comunSinStock' ? 2 : estadoActivo ? 1 : 0
  return Math.max(0, filtrosHojaTotal - delEstado)
}

/** «Más» activo si alguno de los filtros que esconde está puesto; la etiqueta dice cuál. */
export function resumenMas(e: EntradaMas): { activo: boolean; etiqueta: string } {
  const nombres: string[] = []
  if (e.estadoActivo === 'ok') nombres.push('Disponibles')
  if (e.estadoActivo === 'comunSinStock') nombres.push('Común sin stock')
  if (e.favOnly) nombres.push('Favoritos')
  if (e.favEquipo) nombres.push('Favoritos del equipo')
  if (e.faceta) nombres.push('Equipo')
  if (e.conFotos) nombres.push('Con fotos')
  if (e.galeria) nombres.push('Galería')
  if (filtrosHojaRestantes(e.filtrosHojaTotal, e.estadoActivo) > 0) nombres.push('Filtros')
  if (nombres.length === 0) return { activo: false, etiqueta: 'Más' }
  const resto = nombres.length - 1
  return { activo: true, etiqueta: `Más: ${nombres[0]}${resto > 0 ? ` y ${resto} más` : ''}` }
}
