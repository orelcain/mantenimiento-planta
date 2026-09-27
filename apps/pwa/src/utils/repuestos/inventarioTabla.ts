import type { InventarioLinea, MotivoDuda } from '@/hooks/repuestos/useBodega'

/**
 * Filtros y orden de la tabla del inventario por máquina (vista PC, estilo
 * autofiltro de Excel) y de la lista del celular. Puro: la tabla, el pie de
 * totales y los chips cuentan con ESTAS funciones, así el número que se
 * anuncia siempre es el que se ve.
 */

/**
 * Contado − sistema; null si falta alguno de los dos (no hay con qué comparar).
 * Si el SAP está repartido en varias líneas (p. ej. 92462030: 19 en la
 * ubicación 3 y 2 en la 7), se compara el TOTAL contado contra el stock del
 * SAP: línea por línea saldrían diferencias que no existen.
 */
export function diferencia(l: InventarioLinea): number | null {
  const contado = l.contadoSap ?? l.cantidad
  return l.stockSistema == null || contado == null ? null : contado - l.stockSistema
}

/** Marca en cada línea el total contado de su SAP cuando ese SAP aparece en más de una línea validada. */
export function conTotalesPorSap(ls: readonly InventarioLinea[]): InventarioLinea[] {
  const grupos = new Map<string, InventarioLinea[]>()
  for (const l of ls) {
    if (l.estado !== 'validado' || !l.codigoSAP || l.cantidad == null) continue
    if (!grupos.has(l.codigoSAP)) grupos.set(l.codigoSAP, [])
    grupos.get(l.codigoSAP)!.push(l)
  }
  return ls.map(l => {
    const g = l.estado === 'validado' && l.codigoSAP ? grupos.get(l.codigoSAP) : undefined
    if (!g || g.length < 2) return l
    return { ...l, contadoSap: g.reduce((a, x) => a + (x.cantidad ?? 0), 0), lineasSap: g.length }
  })
}

export type FiltroDif = '' | 'con' | 'falta' | 'sobra' | 'cero' | 'nd'
export type FiltroEstado = '' | 'validado' | 'dudoso' | 'nombre' | MotivoDuda

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
  if (f.estado === 'nombre' && !l.nombrePendiente) return false
  if (f.estado && f.estado !== 'validado' && f.estado !== 'dudoso' && f.estado !== 'nombre'
      && !(l.estado === 'dudoso' && l.motivo === f.estado)) return false
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

/* ══════════════ Ajuste del stock de bodega según el conteo ══════════════ */

/** Un repuesto (SAP) cuyo stock hay que llevar a lo contado. */
export interface AjusteSap {
  codigoSAP: string
  /** Lo contado: suma de sus líneas validadas (un SAP podría estar en dos ubicaciones). */
  contado: number
  /** Stock del sistema hoy; null = no tiene ficha en bodega (se crea). */
  sistema: number | null
  ubicaciones: string[]
  lineaIds: string[]
}

export interface PlanAjuste {
  /** Cambian de stock (sistema ≠ contado) o se crean en bodega. */
  cambian: AjusteSap[]
  /** Ya cuadraban: solo se marcan como aplicadas, sin tocar bodega. */
  cuadran: AjusteSap[]
  /** Dudosas: no se aplican hasta validarlas. */
  dudosas: number
  /** Validadas sin SAP: no tienen ficha de bodega a la que llevar el stock. */
  sinSap: number
  /** Precisión del sistema ANTES del ajuste, sobre los que tenían ficha. */
  conFicha: number
  cuadrabanConFicha: number
}

/**
 * Qué haría "Ajustar stock" SIN escribir nada. Solo toma lo pendiente (líneas
 * validadas con SAP cuya cantidad no se ha aplicado todavía, o que se
 * recontaron después de aplicarla), así se puede volver a correr al validar
 * dudosos o recontar.
 */
export function planDeAjuste(lineas: readonly InventarioLinea[]): PlanAjuste {
  const validadas = lineas.filter(l => l.estado === 'validado' && l.cantidad != null)
  const porSap = new Map<string, InventarioLinea[]>()
  for (const l of validadas) {
    if (!l.codigoSAP) continue
    if (!porSap.has(l.codigoSAP)) porSap.set(l.codigoSAP, [])
    porSap.get(l.codigoSAP)!.push(l)
  }
  const cambian: AjusteSap[] = []
  const cuadran: AjusteSap[] = []
  let conFicha = 0, cuadrabanConFicha = 0
  for (const [sap, ls] of porSap) {
    const pendiente = ls.some(l => l.aplicadoCantidad == null || l.aplicadoCantidad !== l.cantidad)
    if (!pendiente) continue
    const contado = ls.reduce((a, l) => a + (l.cantidad ?? 0), 0)
    // El stock del sistema es por SAP: todas sus líneas traen el mismo.
    const sistema = ls.find(l => l.stockSistema != null)?.stockSistema ?? null
    const a: AjusteSap = {
      codigoSAP: sap, contado, sistema,
      ubicaciones: [...new Set(ls.map(l => l.ubicacion))].sort((x, y) => x.localeCompare(y, 'es', { numeric: true })),
      lineaIds: ls.map(l => l.id),
    }
    if (sistema != null) { conFicha++; if (sistema === contado) cuadrabanConFicha++ }
    ;(sistema === contado ? cuadran : cambian).push(a)
  }
  return {
    cambian, cuadran,
    dudosas: lineas.filter(l => l.estado === 'dudoso').length,
    sinSap: validadas.filter(l => !l.codigoSAP).length,
    conFicha, cuadrabanConFicha,
  }
}
