/**
 * Lo que la ficha de una pieza (Bodega › pieza) calcula a partir de los datos: sin React,
 * para poder probarlo. La ficha es una página que se lee; estas funciones deciden QUÉ dice.
 */
import { stockStatusOf, type StockStatus } from '@/hooks/repuestos/estadoDeStock'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'
import { esAlta, type AltaCodigo, type SolicitudItem, type SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'

/** Parámetro de la URL que abre la ficha: `/repuestos?pieza=<rowKey>`. */
export const PARAM_PIEZA = 'pieza'

export type TonoEstado = 'ok' | 'aviso' | 'falta' | 'neutro'

const TONO: Record<StockStatus, TonoEstado> = { ok: 'ok', low: 'aviso', out: 'falta', unset: 'neutro' }

export const valorEnBodega = (i: Pick<BodegaMergedItem, 'stockActual' | 'costoCompra' | 'valorUnitario'>): number =>
  i.stockActual * (i.costoCompra ?? i.valorUnitario ?? 0)

const fechaCorta = (d: Date): string =>
  d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })

/**
 * El estado del stock dicho en una frase, con su tono. Cero sin mínimo no es una alerta:
 * nadie dijo cuántas deben existir (misma regla que `estadoDeStock`).
 */
export function fraseDeEstado(i: BodegaMergedItem): { tono: TonoEstado; texto: string } {
  const est = stockStatusOf(i)
  const u = i.unidad?.trim() || 'pzas'
  const minimo = i.stockMinimo > 0 ? i.stockMinimo : 0
  let texto: string
  switch (est) {
    case 'unset':
      return { tono: 'neutro', texto: 'No está configurado en bodega: no hay stock ni mínimo registrados.' }
    case 'out':
      texto = minimo ? `Sin stock: el mínimo es ${minimo}.` : 'Sin stock. No tiene mínimo, así que no alerta.'
      break
    case 'low':
      texto = i.stockActual === minimo
        ? `En el mínimo: ${i.stockActual === 1 ? 'queda 1' : `quedan ${i.stockActual}`} y el mínimo es ${minimo}.`
        : `Bajo el mínimo: ${i.stockActual === 1 ? 'queda 1' : `quedan ${i.stockActual}`} y el mínimo es ${minimo}.`
      break
    default:
      texto = minimo ? `Hay ${i.stockActual} ${u}; el mínimo es ${minimo}.` : `Hay ${i.stockActual} ${u}, sin mínimo definido.`
  }
  const conteo = i.ultimoConteoAt
    ? ` Contado el ${fechaCorta(i.ultimoConteoAt)}${i.ultimoConteoPor ? ` por ${i.ultimoConteoPor}` : ''}.`
    : ' Nadie lo ha contado.'
  return { tono: TONO[est], texto: texto + conteo }
}

/**
 * Equipos donde se usa, sin repetir. El mismo equipo llega con varios `machineId`
 * (uno por máquina del catálogo): la ficha de antes decía «Equipos (6)» con 3 nombres repetidos.
 */
export function equiposUnicos(i: Pick<BodegaMergedItem, 'equipos'>): { machineId: string; machineName: string }[] {
  const vistos = new Set<string>()
  const out: { machineId: string; machineName: string }[] = []
  for (const e of i.equipos) {
    const nombre = (e.machineName ?? '').trim()
    const clave = nombre.toLocaleLowerCase('es') || e.machineId
    if (vistos.has(clave)) continue
    vistos.add(clave)
    out.push({ machineId: e.machineId, machineName: nombre || e.machineId })
  }
  return out
}

export interface ImagenDePieza { url: string; rotulo: string; esDibujo: boolean }

/**
 * Las imágenes de la pieza, la evidencia primero: la captura del manual con la pieza marcada,
 * después las fotos de bodega y las del catálogo. Sin repetir URL.
 */
export function imagenesDePieza(i: Pick<BodegaMergedItem, 'dibujosManual' | 'fotos' | 'fotosCatalogo'>): ImagenDePieza[] {
  const vistas = new Set<string>()
  const out: ImagenDePieza[] = []
  const sumar = (url: string | undefined, rotulo: string, esDibujo: boolean) => {
    if (!url || vistas.has(url)) return
    vistas.add(url)
    out.push({ url, rotulo, esDibujo })
  }
  for (const d of i.dibujosManual ?? []) sumar(d.url, d.rotulo, true)
  for (const f of i.fotos ?? []) sumar(f, 'Foto de bodega', false)
  for (const f of i.fotosCatalogo ?? []) sumar(f, 'Foto del catálogo', false)
  return out
}

/** Pedidos de esta pieza que todavía no se entregan (las altas no tienen SAP: no entran). */
export function pedidosAbiertosDe(solicitudes: readonly SolicitudItem[], codigoSAP: string): SolicitudRepuesto[] {
  const sap = codigoSAP.trim()
  if (!sap) return []
  return solicitudes.filter((s): s is SolicitudRepuesto => !esAlta(s) && s.estado !== 'entregada' && s.codigoSAP.trim() === sap)
}

/**
 * Lo que espera a bodega: primero lo que falta aprobar, después lo que falta entregar, y las altas
 * de código pendientes aparte. Dentro de cada grupo, lo más antiguo arriba (lleva más esperando).
 */
export function pedidosPorAtender(solicitudes: readonly SolicitudItem[]): {
  porAprobar: SolicitudRepuesto[]
  porEntregar: SolicitudRepuesto[]
  altas: AltaCodigo[]
  total: number
} {
  const antiguo = (a: { createdAt: Date }, b: { createdAt: Date }) => a.createdAt.getTime() - b.createdAt.getTime()
  const repuestos = solicitudes.filter((s): s is SolicitudRepuesto => !esAlta(s))
  const porAprobar = repuestos.filter((s) => s.estado === 'pendiente').sort(antiguo)
  const porEntregar = repuestos.filter((s) => s.estado === 'aprobada').sort(antiguo)
  const altas = solicitudes.filter((s): s is AltaCodigo => esAlta(s) && s.estado === 'pendiente').sort(antiguo)
  return { porAprobar, porEntregar, altas, total: porAprobar.length + porEntregar.length + altas.length }
}

/** «hoy 08:12», «ayer 21:04» o «31-05 19:43». */
export function cuandoCorto(d: Date, ahora: Date = new Date()): string {
  const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
  const dia = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const dif = Math.round((dia(ahora) - dia(d)) / 86_400_000)
  if (dif === 0) return `hoy ${hora}`
  if (dif === 1) return `ayer ${hora}`
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm} ${hora}`
}

/** Lo que dice la columna de stock de un pedido: punto + palabras cortas. */
export function stockDelPedido(stock: StockDeSolicitud | undefined, cantidad: number): { tono: 'crit' | 'warn' | 'ok' | 'neutro'; texto: string } {
  if (!stock?.configurado || typeof stock.stockActual !== 'number') return { tono: 'neutro', texto: 'sin registro en bodega' }
  const n = stock.stockActual
  if (n <= 0) return { tono: 'crit', texto: 'sin stock' }
  const quedan = n === 1 ? 'queda 1' : `quedan ${n}`
  if (n < cantidad) return { tono: 'warn', texto: `${quedan}, no alcanza` }
  return { tono: 'ok', texto: quedan }
}

/** El ancestro que de verdad desplaza (en Repuestos es el contenedor de la pestaña, no la ventana). */
export function contenedorConScroll(el: HTMLElement | null): HTMLElement | null {
  for (let p = el?.parentElement ?? null; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p
  }
  return null
}

/** Botón en PC: 36 px de alto, radio 8 y letra de cuerpo (el `sm` de la piel rinde 11,2 px con la raíz al 87,5 %). */
export const BOTON_PC = 'h-[36px] rounded-[8px] px-4 text-[length:calc(15px*var(--escala-texto,1))]'

/** Botón en el celular: 44 px y letra de cuerpo (17), no los 14 px del `md` de la piel. */
export const BOTON_CEL = 'h-11 text-[length:calc(17px*var(--escala-texto,1))]'
