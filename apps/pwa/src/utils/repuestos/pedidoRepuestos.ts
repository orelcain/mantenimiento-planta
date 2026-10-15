/**
 * Pedido de repuestos: una lista que se arma buscando en TODO el catálogo (cualquier máquina),
 * y que sale como correo (tabla con fotos), texto, Excel o solicitudes en la app.
 *
 * Nace de un pedido de Danilo (11-10-2026): «buscar e ir seleccionando varios repuestos… que se
 * añadan a una lista que se pueda exportar y copiar a un correo para pedirlos a bodega o al
 * planificador cuando estamos bajos de stock, y que lleve las fotos si las tiene». La hoja
 * «Solicitar repuestos» de una máquina sigue igual: esto cubre el pedido que cruza máquinas.
 *
 * Lógica pura (sin React ni Firebase) para poder probarla. El correo usa la misma forma que la
 * bitácora y la inspección (`documentoCorreo`): estilo en línea, estructura en `<table>` e
 * imágenes con `width`/`height` como atributos, porque así es como pega Outlook.
 */
import {
  C,
  CELDA,
  FUENTE,
  SEC,
  TABLA,
  TEXTO,
  TEXTO_FIJO,
  TITULO,
  celdaHtml,
  encabezadoTabla,
  escaparHtml,
  estado,
  filaCifras,
  kpi,
  negrita,
  nota,
  small,
  track,
} from '@/services/bitacora/documentoCorreo'
import type { NuevaSolicitud } from '@/hooks/repuestos/useSolicitudes'
import type { StockDeSolicitud } from '@/hooks/repuestos/solicitudDeRepuesto'

export interface LineaPedido {
  /** rowKey del catálogo: estable aunque el repuesto no tenga SAP. */
  clave: string
  codigoSAP: string
  codigoFabricante: string
  textoBreve: string
  /** Máquina/equipo donde se usa (el que se veía al agregarlo). */
  equipo: string
  cantidad: number
  unidad: string
  /** Stock al momento de agregarlo; `null` = sin registro en bodega (no es cero). */
  stockActual: number | null
  stockMinimo: number | null
  ubicacionBodega: string
  /** Mejor foto disponible (real > manual > galería) o null. */
  foto: string | null
}

export const CANTIDAD_MAXIMA = 999

export function acotar(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.min(CANTIDAD_MAXIMA, Math.max(1, Math.round(n)))
}

type Identidad = Pick<LineaPedido, 'clave' | 'codigoSAP' | 'codigoFabricante'>

/**
 * ¿Es el mismo repuesto? La clave (rowKey) cambia cuando una pieza de despiece recibe su SAP
 * (`fab:X` → SAP), así que además se compara por SAP y, si a uno le falta el SAP, por código
 * de fabricante. Dos SAP distintos nunca son el mismo, aunque compartan código de fabricante.
 */
export function mismoRepuesto(a: Identidad, b: Identidad): boolean {
  if (a.clave === b.clave) return true
  const sa = a.codigoSAP.trim()
  const sb = b.codigoSAP.trim()
  if (sa && sb) return sa === sb
  const fa = a.codigoFabricante.trim()
  return !!fa && fa === b.codigoFabricante.trim()
}

/** Agrega la línea o la quita si ya estaba (el botón de la fila es un interruptor). */
export function alternarLinea(lista: readonly LineaPedido[], linea: LineaPedido): LineaPedido[] {
  return lista.some((l) => mismoRepuesto(l, linea))
    ? lista.filter((l) => !mismoRepuesto(l, linea))
    : [...lista, { ...linea, cantidad: acotar(linea.cantidad) }]
}

/** Para marcar las filas del catálogo que ya están en el pedido (mismo criterio que `mismoRepuesto`). */
export function indiceEnPedido(lista: readonly LineaPedido[]): (fila: Identidad) => boolean {
  if (!lista.length) return () => false
  return (fila) => lista.some((l) => mismoRepuesto(l, fila))
}

/**
 * Las líneas guardadas sin SAP que hoy ya lo tienen en el catálogo pasan a usar el SAP (clave,
 * código y registro como solicitud). Si el SAP ya estaba en el pedido, se juntan sumando la
 * cantidad. `sapDeFabricante` debe devolver un SAP solo cuando es único para ese código.
 * Devuelve la MISMA lista si no cambió nada (para no disparar guardados en bucle).
 */
export function conSapAsignado(lista: readonly LineaPedido[], sapDeFabricante: (fab: string) => string | undefined): readonly LineaPedido[] {
  let cambio = false
  const salida: LineaPedido[] = []
  for (const l of lista) {
    const fab = l.codigoFabricante.trim()
    const sap = !l.codigoSAP && fab ? sapDeFabricante(fab)?.trim() : undefined
    const nueva = sap ? { ...l, clave: sap, codigoSAP: sap } : l
    if (nueva !== l) cambio = true
    const previa = salida.findIndex((x) => mismoRepuesto(x, nueva))
    if (previa >= 0) {
      const x = salida[previa] as LineaPedido
      salida[previa] = { ...x, cantidad: acotar(x.cantidad + nueva.cantidad) }
      cambio = true
    } else {
      salida.push(nueva)
    }
  }
  return cambio ? salida : lista
}

export function fijarCantidad(lista: readonly LineaPedido[], clave: string, n: number): LineaPedido[] {
  return lista.map((l) => (l.clave === clave ? { ...l, cantidad: acotar(n) } : l))
}

export function quitarLinea(lista: readonly LineaPedido[], clave: string): LineaPedido[] {
  return lista.filter((l) => l.clave !== clave)
}

/** Lo que bodega sabe hoy de un SAP: lo de la solicitud más el mínimo (para avisar «bajo el mínimo»). */
export type StockVigente = StockDeSolicitud & { stockMinimo?: number }

/**
 * El stock vigente: el de bodega si se conoce ahora, si no el que tenía al agregarlo.
 * Igual que `avisoDeStock`: un documento de bodega sin stock cargado es «sin registro», no 0;
 * y el mínimo también se toma del vigente (se pudo configurar después de agregar la línea).
 */
export function conStockVigente(l: LineaPedido, stockDe?: (sap: string) => StockVigente): LineaPedido {
  if (!stockDe || !l.codigoSAP) return l
  const s = stockDe(l.codigoSAP)
  if (!s.configurado || typeof s.stockActual !== 'number') return { ...l, stockActual: null }
  return {
    ...l,
    stockActual: s.stockActual,
    stockMinimo: typeof s.stockMinimo === 'number' ? s.stockMinimo : l.stockMinimo,
    unidad: s.unidad || l.unidad,
    ubicacionBodega: s.ubicacionBodega ?? l.ubicacionBodega,
  }
}

export type NivelPedido = 'sin-registro' | 'agotado' | 'bajo' | 'ok'

export function nivelStock(l: Pick<LineaPedido, 'stockActual' | 'stockMinimo'>): NivelPedido {
  if (l.stockActual == null) return 'sin-registro'
  if (l.stockActual <= 0) return 'agotado'
  if (l.stockMinimo != null && l.stockMinimo > 0 && l.stockActual <= l.stockMinimo) return 'bajo'
  return 'ok'
}

const TEXTO_NIVEL: Record<NivelPedido, string> = {
  'sin-registro': 'sin registro en bodega',
  agotado: 'agotado',
  bajo: 'bajo el mínimo',
  ok: 'con stock',
}
const COLOR_NIVEL: Record<NivelPedido, string> = {
  'sin-registro': C.sec,
  agotado: C.parada,
  bajo: C.afectado,
  ok: C.ventana,
}

export function etiquetaStock(l: LineaPedido): string {
  const n = nivelStock(l)
  if (n === 'sin-registro') return TEXTO_NIVEL[n]
  const ubic = l.ubicacionBodega ? ` · ${l.ubicacionBodega}` : ''
  return `${l.stockActual} en bodega${ubic}`
}

export interface ResumenPedido {
  repuestos: number
  unidades: number
  /** Agotados o bajo el mínimo: la razón típica del pedido. */
  criticos: number
  sinSap: number
}

export function resumenPedido(lista: readonly LineaPedido[]): ResumenPedido {
  return {
    repuestos: lista.length,
    unidades: lista.reduce((a, l) => a + l.cantidad, 0),
    criticos: lista.filter((l) => {
      const n = nivelStock(l)
      return n === 'agotado' || n === 'bajo'
    }).length,
    sinSap: lista.filter((l) => !l.codigoSAP).length,
  }
}

export interface DatosPedido {
  lineas: readonly LineaPedido[]
  nota?: string
  solicitante?: string
  fecha: Date
}

function fechaCorta(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${d.getFullYear()}`
}

export function asuntoPedido({ lineas, fecha }: Pick<DatosPedido, 'lineas' | 'fecha'>): string {
  const n = lineas.length
  return `Solicitud de repuestos · ${n} ${n === 1 ? 'ítem' : 'ítems'} · ${fechaCorta(fecha)}`
}

function codigos(l: LineaPedido): string {
  return [l.codigoSAP ? `SAP ${l.codigoSAP}` : 'sin SAP', l.codigoFabricante ? `Fab. ${l.codigoFabricante}` : '']
    .filter(Boolean)
    .join(' · ')
}

/**
 * " pzas" tras la cantidad; en singular cuando es 1 ("1 pza", no "1 pzas").
 * Solo se singulariza la forma en minúsculas que guarda el catálogo; las siglas
 * SAP en mayúsculas (KG, MT) quedan tal cual. "UN" no se escribe.
 */
export function unidadTrasCantidad(l: Pick<LineaPedido, 'cantidad' | 'unidad'>): string {
  const u = l.unidad?.trim()
  if (!u || u === 'UN') return ''
  if (l.cantidad !== 1 || u !== u.toLowerCase()) return ` ${u}`
  if (u.endsWith('des')) return ` ${u.slice(0, -2)}` // unidades → unidad
  if (u.length > 2 && u.endsWith('s')) return ` ${u.slice(0, -1)}` // pzas → pza
  return ` ${u}`
}

/** Texto plano: para WhatsApp, para el pegado que pierde el formato y como respaldo. */
export function textoPedido(d: DatosPedido): string {
  const r = resumenPedido(d.lineas)
  const filas = d.lineas.map((l, i) => {
    const unidad = unidadTrasCantidad(l)
    return [
      `${i + 1}. ${l.textoBreve || 'Sin nombre'} — ${l.cantidad}${unidad}`,
      `   ${codigos(l)}${l.equipo ? ` · ${l.equipo}` : ''}`,
      `   Stock: ${etiquetaStock(l)}`,
    ].join('\n')
  })
  const cabecera = [asuntoPedido(d)]
  if (d.solicitante) cabecera.push(`Solicita: ${d.solicitante}`)
  cabecera.push(`${r.repuestos} ${r.repuestos === 1 ? 'repuesto' : 'repuestos'} · ${r.unidades} ${r.unidades === 1 ? 'unidad' : 'unidades'}${r.criticos ? ` · ${r.criticos} agotados o bajo el mínimo` : ''}`)
  const partes = [cabecera.join('\n'), filas.join('\n')]
  if (d.nota?.trim()) partes.push(`Observación: ${d.nota.trim()}`)
  return partes.join('\n\n')
}

/** Cómo va la foto de cada línea en el correo. Sin medidas, no se pone (Outlook la pega a tamaño original). */
export interface FotoCorreo {
  src: string
  w: number
  h: number
}

export interface DatosCorreoPedido extends DatosPedido {
  foto?: (l: LineaPedido) => FotoCorreo | null
  /** `false` = correo sin columna de fotos (más liviano, o para quien no las necesita). Por defecto, con fotos. */
  conFotos?: boolean
}

/** El pedido como cuerpo de correo, con la forma de los demás correos de Mantención. */
export function htmlPedido(d: DatosCorreoPedido): string {
  const r = resumenPedido(d.lineas)
  const cabecera =
    `<div style="font-family:${FUENTE};font-size:${TITULO};font-weight:600;color:${C.tinta};">${negrita('Solicitud de repuestos')}</div>` +
    `<div style="font-family:${FUENTE};font-size:${SEC};color:${C.sec};padding-top:4px;">` +
    small(escaparHtml([fechaCorta(d.fecha), d.solicitante ? `Solicita ${d.solicitante}` : ''].filter(Boolean).join(' · '))) +
    `</div>`
  const cifras = filaCifras(
    [
      kpi(String(r.repuestos), r.repuestos === 1 ? 'repuesto' : 'repuestos'),
      kpi(String(r.unidades), r.unidades === 1 ? 'unidad' : 'unidades'),
      r.criticos ? kpi(String(r.criticos), 'agotados o bajo mínimo') : '',
    ],
    1,
  )
  const conFotos = d.conFotos !== false
  const filas = d.lineas
    .map((l) => {
      const f = conFotos ? d.foto?.(l) ?? null : null
      const foto = f
        ? `<img src="${escaparHtml(f.src)}" width="${f.w}" height="${f.h}" alt="" style="display:block;width:${f.w}px;height:${f.h}px;border:0;border-radius:4px;">`
        : `<span style="color:${C.sec};">${small('sin foto')}</span>`
      const unidad = escaparHtml(unidadTrasCantidad(l))
      const desc =
        `${negrita(escaparHtml(l.textoBreve || 'Sin nombre'))}` +
        `<div style="font-size:${SEC};color:${C.sec};padding-top:2px;">${small(escaparHtml(codigos(l)))}</div>` +
        (l.equipo ? `<div style="font-size:${SEC};color:${C.sec};">${small(escaparHtml(l.equipo))}</div>` : '')
      return (
        `<tr>` +
        (conFotos ? `<td valign="top" style="${CELDA}width:${track(2)};">${foto}</td>` : '') +
        celdaHtml(desc, track(conFotos ? 6 : 8)) +
        `<td valign="top" style="${CELDA}width:${track(1)};white-space:nowrap;font-variant-numeric:tabular-nums;">${negrita(`${l.cantidad}${unidad}`)}</td>` +
        `<td valign="top" style="${CELDA}width:${track(3)};">${estado(etiquetaStock(l), COLOR_NIVEL[nivelStock(l)])}</td>` +
        `</tr>`
      )
    })
    .join('')
  const tabla =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="${TABLA}margin-top:18px;">` +
    encabezadoTabla(conFotos ? ['Foto', 'Repuesto', 'Cant.', 'Stock'] : ['Repuesto', 'Cant.', 'Stock']) +
    filas +
    `</table>`
  const obs = d.nota?.trim() ? nota(`${negrita('Observación.')} ${escaparHtml(d.nota.trim())}`) : ''
  const sinSap = r.sinSap
    ? nota(`${negrita('Sin código SAP.')} ${r.sinSap === 1 ? 'Un ítem no tiene' : `${r.sinSap} ítems no tienen`} SAP: va con el código del fabricante.`)
    : ''
  return (
    `<div style="${TEXTO_FIJO}font-family:${FUENTE};font-size:${TEXTO};color:${C.tinta};max-width:680px;">` +
    cabecera +
    cifras +
    tabla +
    obs +
    sinSap +
    `</div>`
  )
}

/** Filas para Excel: encabezado + una fila por repuesto. */
export function filasExcelPedido(lineas: readonly LineaPedido[]): (string | number)[][] {
  return [
    ['SAP', 'Cód. fabricante', 'Repuesto', 'Cantidad', 'Unidad', 'Equipo', 'Stock en bodega', 'Ubicación bodega', 'Estado'],
    ...lineas.map((l) => [
      l.codigoSAP || '',
      l.codigoFabricante || '',
      l.textoBreve || '',
      l.cantidad,
      l.unidad || 'UN',
      l.equipo || '',
      l.stockActual == null ? '' : l.stockActual,
      l.ubicacionBodega || '',
      TEXTO_NIVEL[nivelStock(l)],
    ]),
  ]
}

/** Las solicitudes que se registran en la app: solo las que tienen SAP (sin él, bodega no puede entregar). */
export function solicitudesDePedido(lineas: readonly LineaPedido[], notaPedido?: string): NuevaSolicitud[] {
  const obs = notaPedido?.trim()
  return lineas
    .filter((l) => l.codigoSAP)
    .map((l) => ({
      codigoSAP: l.codigoSAP,
      textoBreve: l.textoBreve,
      cantidad: l.cantidad,
      ...(obs ? { observaciones: obs } : {}),
    }))
}

/**
 * Líneas que faltan por registrar como solicitud: con SAP y sin registrar todavía.
 * Evita duplicar solicitudes (y avisos de Telegram) al tocar dos veces o al reintentar
 * tras un fallo a mitad de camino.
 */
export function pendientesDeRegistrar(lineas: readonly LineaPedido[], registradas: readonly string[]): LineaPedido[] {
  const hechas = new Set(registradas)
  return lineas.filter((l) => l.codigoSAP && !hechas.has(l.clave))
}

/** Lo que es de cada persona en el pedido (la preferencia de fotos es del dispositivo). */
export interface PedidoDeUsuario {
  lineas: LineaPedido[]
  nota: string
  registradas: string[]
}

export interface EstadoDuenos extends PedidoDeUsuario {
  /** Usuario al que pertenece el pedido visible. `null` = guardado antes de existir dueño. */
  dueno: string | null
  /** Pedidos de otros usuarios en ESTE dispositivo (PC compartido de planta), apartados. */
  otros: Record<string, PedidoDeUsuario>
}

/**
 * Cambia el pedido visible al del usuario que entró. El de quien estaba se aparta (si tenía algo)
 * y se recupera cuando vuelve. Un pedido sin dueño (anterior a esto) lo adopta el primero que entra.
 */
export function cambiarDuenoPedido(s: EstadoDuenos, id: string): EstadoDuenos {
  if (!id || s.dueno === id) return s
  if (s.dueno === null) return { ...s, dueno: id }
  const otros = { ...s.otros }
  if (s.lineas.length || s.nota.trim()) otros[s.dueno] = { lineas: s.lineas, nota: s.nota, registradas: s.registradas }
  else delete otros[s.dueno]
  const mio = otros[id]
  delete otros[id]
  return { dueno: id, otros, lineas: mio?.lineas ?? [], nota: mio?.nota ?? '', registradas: mio?.registradas ?? [] }
}

/** Nombre de archivo sin caracteres raros. */
export function nombreArchivoPedido(fecha: Date, ext: string): string {
  return `pedido-repuestos-${fechaCorta(fecha)}.${ext}`
}
