import type { InventarioLinea, MotivoDuda } from '@/hooks/repuestos/useBodega'

/**
 * Filtros y orden de la tabla del inventario por máquina (vista PC, estilo
 * autofiltro de Excel) y de la lista del celular. Puro: la tabla, el pie de
 * totales y los chips cuentan con ESTAS funciones, así el número que se
 * anuncia siempre es el que se ve.
 */

/** Contado − sistema; null si falta alguno de los dos (no hay con qué comparar). */
export function diferencia(l: InventarioLinea): number | null {
  return l.stockSistema == null || l.cantidad == null ? null : l.cantidad - l.stockSistema
}

export type FiltroDif = '' | 'con' | 'falta' | 'sobra' | 'cero' | 'nd'
export type FiltroEstado = '' | 'validado' | 'dudoso' | MotivoDuda

export interface FiltrosTabla {
  ubicacion: string
  codigo: string
  nombre: string
  sap: '' | 'con' | 'sin'
  dif: FiltroDif
  estado: FiltroEstado
}

export const FILTROS_VACIOS: FiltrosTabla = { ubicacion: '', codigo: '', nombre: '', sap: '', dif: '', estado: '' }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export function nombreDe(l: InventarioLinea): string {
  return l.textoBreve || l.descripcion || ''
}

export function pasaFiltros(l: InventarioLinea, f: FiltrosTabla, busca = ''): boolean {
  const q = norm(busca.trim())
  if (q) {
    const h = norm(`${l.codigoFabricante} ${l.codigoCuaderno} ${l.codigoSAP} ${nombreDe(l)} ${l.nombreComun} ${l.ubicacion}`)
    if (!q.split(/\s+/).every(t => h.includes(t))) return false
  }
  if (f.ubicacion && l.ubicacion !== f.ubicacion) return false
  if (f.codigo && !`${l.codigoFabricante} ${l.codigoCuaderno}`.toUpperCase().includes(f.codigo.trim().toUpperCase())) return false
  if (f.nombre && !norm(`${nombreDe(l)} ${l.nombreComun}`).includes(norm(f.nombre.trim()))) return false
  if (f.sap === 'con' && !l.codigoSAP) return false
  if (f.sap === 'sin' && l.codigoSAP) return false
  const d = diferencia(l)
  if (f.dif === 'con' && !(d != null && d !== 0)) return false
  if (f.dif === 'falta' && !(d != null && d < 0)) return false
  if (f.dif === 'sobra' && !(d != null && d > 0)) return false
  if (f.dif === 'cero' && d !== 0) return false
  if (f.dif === 'nd' && d != null) return false
  if (f.estado === 'validado' && l.estado !== 'validado') return false
  if (f.estado === 'dudoso' && l.estado !== 'dudoso') return false
  if (f.estado && f.estado !== 'validado' && f.estado !== 'dudoso' && !(l.estado === 'dudoso' && l.motivo === f.estado)) return false
  return true
}

export function filtrosActivos(f: FiltrosTabla, busca = ''): number {
  return Object.values(f).filter(Boolean).length + (busca.trim() ? 1 : 0)
}

export type ColumnaOrden = 'ubicacion' | 'codigo' | 'nombre' | 'sap' | 'cantidad' | 'sistema' | 'dif' | 'estado'

function valor(l: InventarioLinea, c: ColumnaOrden): string | number | null {
  switch (c) {
    case 'ubicacion': return l.ubicacion
    case 'codigo': return l.codigoFabricante
    case 'nombre': return nombreDe(l) || null
    case 'sap': return l.codigoSAP || null
    case 'cantidad': return l.cantidad
    case 'sistema': return l.stockSistema
    case 'dif': return diferencia(l)
    case 'estado': return l.estado === 'dudoso' ? `1${l.motivo ?? ''}` : '0'
  }
}

/** Orden estable; los vacíos siempre al final, suba o baje. Números por valor, texto con orden natural ("Ubicación 2" < "Ubicación 10"). */
export function ordenarLineas(ls: readonly InventarioLinea[], c: ColumnaOrden, dir: 1 | -1): InventarioLinea[] {
  return ls
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const A = valor(a.l, c), B = valor(b.l, c)
      if (A == null && B == null) return a.i - b.i
      if (A == null) return 1
      if (B == null) return -1
      const r = typeof A === 'number' && typeof B === 'number'
        ? A - B
        : String(A).localeCompare(String(B), 'es', { numeric: true })
      return r !== 0 ? r * dir : a.i - b.i
    })
    .map(x => x.l)
}
