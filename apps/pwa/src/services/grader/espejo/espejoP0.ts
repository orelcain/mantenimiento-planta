/**
 * Puerta 0 del espejo (e1.10), lógica pura: las cadenas que el lector del PC de planta lee del informe «Puerta 0» de
 * Matrix (11 celdas + `#n`, unidas por TAB) pasan a `StoredGate0Record`, el mismo registro que deja el Excel. Así el
 * cruce por hora y peso (`cruzarPuerta0`) y el árbol de «Por qué va a P0» no cambian.
 *
 * Columnas de «Puerta 0» (lista blanca del lector): Especie | Lote | Fecha | Hora | Turno | Gate | Cantidad de piezas |
 * Calidad | Peso de las piezas | Error | peso en Gr. El servidor guarda en `graderEspejo/{linea}__{fecha}/p0/{HH}`.
 *
 * Una sola fuente por turno (`elegirFuenteP0`): `arbolP0` cuenta como «sin lectura» cada registro que no cruza, así que
 * juntar Excel y espejo contaría dos veces la misma pieza.
 */
import type { StoredGate0Record } from '../graderGate0Store'
import { parsearPesoKg } from './espejoFilas'

const RX_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RX_HORA = /^\d{2}:\d{2}:\d{2}$/
const RX_ENTERO = /^\d+$/
/** 11 celdas del informe `p0` + el ordinal `#n`. */
const CAMPOS_P0 = 12

/** «1.234» / «1234,0» / «1234 g» → gramos. `undefined` si no es número. */
function gramos(celda: string): number | undefined {
  let limpio = celda.replace(/g(r(amos)?)?$/i, '').trim()
  if (!limpio) return undefined
  // Gramos con punto de miles («4.320»): sin coma, el punto no es decimal.
  if (/^\d{1,3}(\.\d{3})+$/.test(limpio)) limpio = limpio.replace(/\./g, '')
  const n = parsearPesoKg(limpio)
  return n === null ? undefined : n
}

/** Una cadena de Puerta 0 → registro, o `null` si está mal formada (no rompe nunca). */
export function parsearFilaP0(cadena: string): StoredGate0Record | null {
  if (typeof cadena !== 'string') return null
  const partes = cadena.split('\t')
  if (partes.length < CAMPOS_P0) return null
  const c = partes.map((x) => x.trim())
  const fecha = c[2] ?? ''
  const hora = c[3] ?? ''
  if (!RX_FECHA.test(fecha) || !RX_HORA.test(hora)) return null
  const ts = `${fecha}T${hora}.000Z`
  if (Number.isNaN(Date.parse(ts))) return null
  const celdaCantidad = c[6] ?? ''
  const pieces = RX_ENTERO.test(celdaCantidad) ? Number(celdaCantidad) : 1
  const porPieza = gramos(c[10] ?? '')
  // Mismo criterio que el parser del Excel: kg de la celda; si viene en gramos (> 5000), a kg; sin peso, g × piezas.
  let weightKg = parsearPesoKg(c[8] ?? '') ?? undefined
  if (weightKg !== undefined && weightKg > 5000) weightKg = weightKg / 1000
  if (weightKg === undefined && porPieza !== undefined && porPieza > 0) weightKg = (porPieza * pieces) / 1000
  const r: StoredGate0Record = { ts, pieces, error: c[9] ?? '' }
  if (weightKg !== undefined) r.weightKg = weightKg
  if (porPieza !== undefined) r.weightPerPieceGrams = porPieza
  if (c[7]) r.quality = c[7]
  if (c[1]) r.lot = c[1]
  return r
}

/** Cadenas → registros únicos (la cadena lleva su `#n`) y ordenados por hora. */
export function registrosP0(cadenas: readonly string[]): StoredGate0Record[] {
  const out: StoredGate0Record[] = []
  for (const cad of new Set(cadenas)) {
    const r = parsearFilaP0(cad)
    if (r) out.push(r)
  }
  return out.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
}

export type FuenteP0 = 'excel' | 'espejo'

/**
 * Qué Puerta 0 usar en el turno: la que trae más registros dentro de la ventana (empate: el Excel, que es el exporte
 * oficial). `null` si ninguna trae registros: entonces las causas son estimadas.
 */
export function elegirFuenteP0(
  excel: readonly StoredGate0Record[] | null,
  espejo: readonly StoredGate0Record[] | null,
  ventana: { startMs: number; endMs: number } | null,
): { registros: readonly StoredGate0Record[]; fuente: FuenteP0 } | null {
  const enVentana = (rs: readonly StoredGate0Record[] | null): number => {
    if (!rs) return 0
    if (!ventana) return rs.length
    let n = 0
    for (const r of rs) {
      const t = Date.parse(r.ts)
      if (t >= ventana.startMs && t < ventana.endMs) n++
    }
    return n
  }
  const nx = enVentana(excel)
  const ne = enVentana(espejo)
  if (nx === 0 && ne === 0) return null
  if (ne > nx && espejo) return { registros: espejo, fuente: 'espejo' }
  return { registros: excel!, fuente: 'excel' }
}

// ---- Pedido manual «Actualizar causas P0» ----

/** Primera versión del lector que lee Puerta 0 (pasiva y a pedido). */
export const VERSION_CON_P0 = 'e1.10'
/** Lo mismo que acepta la función: un pedido de más de 1 h ya no se atiende. */
export const PEDIDO_P0_MAX_MIN = 60

/** Estado de Puerta 0 que el lector deja en `graderEspejoEstado/{equipo}.p0.estado` (e1.10). */
export interface EstadoP0Lector {
  /**
   * leido | parcial | pasiva | apagado | sin-selector | varios | sin-vuelta | no-cambia | no-volvio | bloqueado |
   * pospuesto | error.
   */
  resultado?: string
  /** Filas de Puerta 0 enviadas en esa lectura. */
  filas?: number
  /** Primera y última fila leída («yyyy-MM-dd HH:mm:ss»). */
  primera?: string
  ultima?: string
  /** Por qué leyó: hora | cierre | pedido | pasiva. */
  motivo?: string
  /** Pedido atendido (ISO del `pedidoEn`), o '' si la lectura no fue a pedido. */
  pedido?: string
  /** pestana | boton | menu | '' (pasiva o sin cambio de informe). */
  via?: string
  /** ¿Volvió a «Pieza pieza Grader» y lo verificó? */
  volvio?: boolean
  /** Rango o casilla «Limitar» distintos al volver ('' si quedaron igual). */
  cambio?: string
  version?: string
}

function partes(v: string | undefined): number[] | null {
  const m = /^e(\d{1,2}(?:\.\d{1,2}){0,2})$/.exec(v ?? '')
  return m ? m[1]!.split('.').map(Number) : null
}

/** ¿La versión del lector lee Puerta 0? Sin versión conocida, se supone que no. */
export function lectorConP0(version: string | undefined): boolean {
  const a = partes(version)
  const b = partes(VERSION_CON_P0)!
  if (!a) return false
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    if (x !== y) return x > y
  }
  return true
}

export type ModoPedidoP0 = 'normal' | 'pedido' | 'atendido' | 'apagado' | 'fallo' | 'sin-soporte'

/** Resultados del lector que no traen el motivo real. */
const FALLOS = new Set(['sin-selector', 'varios', 'sin-vuelta', 'no-cambia', 'no-volvio', 'bloqueado', 'error'])

/**
 * Qué dice el botón. «pedido» mientras el lector no conteste ese pedido; luego «atendido», «apagado» (el lector tiene el
 * cambio de informe apagado) o «fallo». `ahoraMs` es la hora real.
 */
export function estadoPedidoP0(p: {
  pedidoEnMs: number | null
  ahoraMs: number
  version: string | undefined
  p0: EstadoP0Lector | null
}): { modo: ModoPedidoP0; pedidoEnMs: number | null } {
  const { pedidoEnMs, ahoraMs } = p
  if (!lectorConP0(p.version)) return { modo: 'sin-soporte', pedidoEnMs }
  if (pedidoEnMs === null || !Number.isFinite(pedidoEnMs)) return { modo: 'normal', pedidoEnMs: null }
  const iso = new Date(pedidoEnMs).toISOString()
  const r = p.p0
  if (r && r.pedido === iso) {
    if (r.resultado === 'apagado') return { modo: 'apagado', pedidoEnMs }
    if (r.resultado && FALLOS.has(r.resultado)) return { modo: 'fallo', pedidoEnMs }
    return { modo: 'atendido', pedidoEnMs }
  }
  if (ahoraMs - pedidoEnMs > PEDIDO_P0_MAX_MIN * 60_000) return { modo: 'normal', pedidoEnMs: null }
  return { modo: 'pedido', pedidoEnMs }
}
