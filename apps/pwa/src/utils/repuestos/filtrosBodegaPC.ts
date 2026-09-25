import { stockStatusOf, type StockStatus } from '@/hooks/repuestos/estadoDeStock'
import { haystackMatchesAll, normalizeForSearch } from '@/utils/repuestos'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'

/**
 * Filtros de la vista PC de Bodega (columna izquierda). Se combinan: dentro de
 * un grupo es "cualquiera de" (OR), entre grupos es "y además" (AND). Cada
 * opción cuenta cuántos quedarían si se marca, con los OTROS grupos ya
 * aplicados — así el número que se lee es el que aparece al marcarla.
 * El estado reutiliza stockStatusOf: el mismo criterio que los chips del
 * celular (Configurados = con stock + bajo mínimo + sin stock).
 */

export type GrupoFiltro = 'estado' | 'clase' | 'ubicacion' | 'maquina' | 'otros'
export type FiltrosBodega = Record<GrupoFiltro, readonly string[]>

export const ESTADO_TEXTO: Record<StockStatus, string> = {
  ok: 'Con stock', low: 'Bajo mínimo', out: 'Sin stock', unset: 'Sin configurar',
}

export const CLASE_TEXTO: Record<string, string> = {
  repuesto: 'Repuesto', insumo: 'Insumo', refrigeracion: 'Refrigeración', quimico: 'Químico',
  herramienta: 'Herramienta', lubricante: 'Lubricante', '': 'Sin clase',
}

type Item = Pick<BodegaMergedItem, 'bodegaId' | 'stockActual' | 'stockMinimo' | 'clase' | 'ubicacionBodega' |
  'equipos' | 'codigoFabricante' | 'valorUnitario' | 'costoCompra' | 'isWatched' | 'codigoSAP' | 'textoBreve' | 'alias' |
  'proveedor' | 'tipo'>

export const OTROS: Record<string, { texto: string; cumple: (i: Item) => boolean }> = {
  fav: { texto: 'Mis favoritos', cumple: i => !!i.isWatched },
  fab: { texto: 'Con código de fabricante', cumple: i => !!i.codigoFabricante?.trim() },
  valor: { texto: 'Con valor', cumple: i => (i.costoCompra ?? i.valorUnitario ?? 0) > 0 },
  multi: { texto: 'En 2 o más equipos', cumple: i => i.equipos.length >= 2 },
}

/** Por defecto se ve lo que tiene stock configurado, como en el celular. */
export const FILTROS_INICIALES: FiltrosBodega = { estado: ['ok', 'low', 'out'], clase: [], ubicacion: [], maquina: [], otros: [] }
export const FILTROS_LIMPIOS: FiltrosBodega = { estado: [], clase: [], ubicacion: [], maquina: [], otros: [] }

/** "C-3-2" → "Estante C"; "BANDEJA 7" → "Bandejas"… para agrupar sin 800 opciones sueltas. */
export function grupoUbicacion(ubicacion: string | undefined): string {
  const s = (ubicacion || '').trim().toUpperCase()
  if (!s) return ''
  const m = s.match(/^([A-Z])[-\s]?\d/)
  if (m) return `Estante ${m[1]}`
  if (/^BANDEJA/.test(s)) return 'Bandejas'
  if (/^CAJA/.test(s)) return 'Cajas'
  if (/^PALLET/.test(s)) return 'Pallets'
  return 'Otras'
}

/** Valores del ítem en un grupo (un repuesto puede estar en varias máquinas). */
export function valoresDe(i: Item, g: GrupoFiltro): string[] {
  switch (g) {
    case 'estado': return [stockStatusOf(i)]
    case 'clase': return [i.clase || '']
    case 'ubicacion': return [i.bodegaId ? grupoUbicacion(i.ubicacionBodega) : '']
    case 'maquina': {
      const ms = [...new Set(i.equipos.map(e => e.machineName).filter(Boolean))]
      return ms.length ? ms : ['']
    }
    case 'otros': return Object.keys(OTROS).filter(k => OTROS[k]!.cumple(i))
  }
}

const GRUPOS: GrupoFiltro[] = ['estado', 'clase', 'ubicacion', 'maquina', 'otros']

export function pasaBusqueda(i: Item, busca: string): boolean {
  const t = normalizeForSearch(busca).split(/\s+/).filter(Boolean)
  if (!t.length) return true
  return haystackMatchesAll(normalizeForSearch(
    `${i.codigoSAP} ${i.codigoFabricante} ${i.textoBreve} ${i.alias || ''} ${i.ubicacionBodega} ${i.proveedor || ''} ${i.tipo || ''}`), t)
}

/** ¿Pasa todos los filtros (salvo el grupo `excepto`, para contar sus opciones)? */
export function pasaFiltros(i: Item, f: FiltrosBodega, busca = '', excepto?: GrupoFiltro): boolean {
  if (!pasaBusqueda(i, busca)) return false
  for (const g of GRUPOS) {
    if (g === excepto) continue
    const sel = f[g]
    if (!sel.length) continue
    const vals = valoresDe(i, g)
    // "otros" son condiciones que se suman (Y); el resto, "cualquiera de" (O).
    if (g === 'otros' ? !sel.every(s => vals.includes(s)) : !sel.some(s => vals.includes(s))) return false
  }
  return true
}

/** Opciones de un grupo con cuántos quedan si se marcan (los demás grupos ya aplicados). */
export function facetas(items: readonly Item[], f: FiltrosBodega, g: GrupoFiltro, busca = ''): { valor: string; cuenta: number }[] {
  const m = new Map<string, number>()
  if (g === 'otros') for (const k of Object.keys(OTROS)) m.set(k, 0)
  if (g === 'estado') for (const k of ['ok', 'low', 'out', 'unset']) m.set(k, 0)
  for (const i of items) {
    if (!pasaFiltros(i, f, busca, g)) continue
    for (const v of valoresDe(i, g)) m.set(v, (m.get(v) ?? 0) + 1)
  }
  for (const v of f[g]) if (!m.has(v)) m.set(v, 0)
  const fijos = g === 'estado' || g === 'otros'
  return [...m.entries()]
    .map(([valor, cuenta]) => ({ valor, cuenta }))
    .sort((a, b) => fijos ? 0 : (a.valor === '' ? 1 : b.valor === '' ? -1 : b.cuenta - a.cuenta || a.valor.localeCompare(b.valor, 'es', { numeric: true })))
}
