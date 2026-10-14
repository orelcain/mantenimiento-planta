/**
 * Solicitar VARIOS repuestos de una máquina de una vez.
 *
 * La solicitud de la app es de a un repuesto. Cuando a una máquina le faltan
 * cinco cosas, eso eran cinco formularios. Aquí va la lógica pura: cómo se
 * agrupan las piezas para elegir rápido, qué se puede pedir y el resumen del
 * pie («3 repuestos · 50 unidades · 1 aviso»). La pantalla está en
 * `components/repuestos/SolicitarVariosSheet.tsx`.
 */
import { haystackMatchesAll, normalizeForSearch } from '@/utils/repuestos'
import { nombreVisible } from '@/utils/repuestos/nombreVisible'
import { avisoDeStock, CANTIDAD_MAXIMA, type StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'

export interface PiezaSolicitable {
  /** Clave estable (rowKey del módulo o id del doc): el SAP puede faltar. */
  clave: string
  codigoSAP: string
  textoBreve: string
  /** Nombres comunes: el primero es el título que se muestra. No se persiste en la solicitud. */
  nombresComunes?: string[]
  codigoFabricante?: string
  /** Común de la máquina (lista curada o marcado a mano). */
  comun?: boolean
  /** Cuántas lleva la máquina (BOM de SAP PM). Solo informa: la cantidad arranca en 1. */
  cantidadPorMaquina?: number
  stock?: StockDeSolicitud
}

export type GrupoSolicitable = 'comunes' | 'unaUnidad' | 'resto' | 'sinSap'

export const TITULO_GRUPO: Record<GrupoSolicitable, string> = {
  comunes: 'Comunes de la máquina',
  unaUnidad: 'Con 1 unidad en bodega',
  resto: 'Resto de la máquina',
  sinSap: 'Del despiece, sin SAP en la app',
}

/** Sin SAP no hay solicitud: SAP es lo que Bodega/Compras necesita. */
export const sePuedePedir = (p: PiezaSolicitable): boolean => !!p.codigoSAP.trim()

export function grupoDe(p: PiezaSolicitable): GrupoSolicitable {
  if (!sePuedePedir(p)) return 'sinSap'
  if (p.comun) return 'comunes'
  if (p.stock?.configurado && p.stock.stockActual === 1) return 'unaUnidad'
  return 'resto'
}

/** Filtra por texto (mismo matcher que el buscador principal) y agrupa en el orden de la pantalla. */
export function agruparParaSolicitar(
  piezas: PiezaSolicitable[],
  query = '',
): { grupo: GrupoSolicitable; piezas: PiezaSolicitable[] }[] {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean)
  const visibles = terms.length
    ? piezas.filter((p) => haystackMatchesAll(normalizeForSearch(`${p.textoBreve} ${(p.nombresComunes ?? []).join(' ')} ${p.codigoSAP} ${p.codigoFabricante ?? ''}`), terms))
    : piezas
  const orden: GrupoSolicitable[] = ['comunes', 'unaUnidad', 'resto', 'sinSap']
  const porGrupo = new Map<GrupoSolicitable, PiezaSolicitable[]>(orden.map((g) => [g, []]))
  for (const p of visibles) porGrupo.get(grupoDe(p))!.push(p)
  for (const lista of porGrupo.values()) lista.sort((a, b) => nombreVisible(a).titulo.localeCompare(nombreVisible(b).titulo, 'es'))
  return orden.map((grupo) => ({ grupo, piezas: porGrupo.get(grupo)! })).filter((g) => g.piezas.length > 0)
}

/** Cantidad válida: entero entre 1 y el máximo de la solicitud individual. */
export const acotarCantidad = (n: number): number => Math.min(CANTIDAD_MAXIMA, Math.max(1, Math.round(n || 1)))

/** Marcadas → resumen del pie y avisos de stock (sin stock / no alcanza) por pieza. */
export function resumenDeSeleccion(piezas: PiezaSolicitable[], seleccion: Map<string, number>) {
  let repuestos = 0, unidades = 0
  const avisos = new Map<string, string>()
  for (const p of piezas) {
    const cant = seleccion.get(p.clave)
    if (cant == null || !sePuedePedir(p)) continue
    repuestos++
    unidades += cant
    const a = avisoDeStock(p.stock, cant)
    if (a.nivel === 'sin-stock' || a.nivel === 'insuficiente') avisos.set(p.clave, a.texto)
  }
  return { repuestos, unidades, avisos }
}

/** Las solicitudes que salen: una por pieza marcada, en el orden de la lista. */
export function solicitudesDe(piezas: PiezaSolicitable[], seleccion: Map<string, number>, observaciones?: string): NuevaSolicitud[] {
  const obs = observaciones?.trim() || undefined
  return piezas
    .filter((p) => seleccion.has(p.clave) && sePuedePedir(p))
    .map((p) => ({ codigoSAP: p.codigoSAP.trim(), textoBreve: p.textoBreve, cantidad: acotarCantidad(seleccion.get(p.clave)!), observaciones: obs }))
}
