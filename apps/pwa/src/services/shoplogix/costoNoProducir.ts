/**
 * El costo de no producir, en pesos.
 *
 * POR QUÉ EXISTE
 * --------------
 * El monitor ya dice cuántas piezas costó cada detención (`monitorPerdidas`).
 * Las piezas las entiende Mantención; la gerencia entiende pesos. Este módulo
 * hace la última conversión y nada más:
 *
 *   piezas (ya valorizadas al ritmo local) × kg por pieza × margen por kg
 *
 * ⚠ NO recalcula «horas detenidas × producción por hora». Esa cuenta ya está
 * hecha, con el ritmo que la línea traía antes de cada detención y dividida
 * por las máquinas de la línea. Rehacerla acá daría una segunda cifra distinta
 * para el mismo turno.
 *
 * ⚠ El margen NO sale del código ni de Shoplogix: lo carga un administrador
 * por línea (`costoNoProducirConfig`). Sin margen o sin peso promedio este
 * módulo devuelve qué falta; nunca supone un valor.
 *
 * Dos lecturas:
 *  1. Costo de lo detenido: todo lo recuperable del turno, por dueño.
 *  2. Evitado por reparar rápido: cada detención de Mantención contra lo que
 *     esa misma causa dura habitualmente. Lo que duró MÁS que lo habitual se
 *     informa aparte y no se resta: netear escondería las dos cosas.
 */
import type { DuenoPerdida, GrupoDelTurno } from './monitorEventos'

export type Moneda = 'CLP' | 'USD'

/** Un margen con la fecha desde la que rige (día de planta, YYYY-MM-DD). */
export interface MargenVigente {
  margenPorKg: number
  moneda: Moneda
  vigenteDesde: string
  /** Quién lo cargó y cuándo: una cifra de plata tiene que tener autor. */
  autor?: string | null
  guardadoEn?: string | null
}

export interface ConfigCostoNoProducir {
  /** CLP por 1 USD, fijado a mano. Solo hace falta si algún margen está en USD. */
  tipoCambioClpPorUsd: number | null
  /** Historial de márgenes por línea (`plantLineId`). No se pisa: se agrega. */
  lineas: Record<string, MargenVigente[]>
}

/** Fuera de este rango es un error de tipeo, no un margen (CLP por kg). */
export const MARGEN_CLP_MIN = 1
export const MARGEN_CLP_MAX = 100_000
/** Con menos casos, «lo habitual» de una causa es una anécdota. */
export const CASOS_MINIMOS = 5

/**
 * El margen en CLP por kg que regía para una línea en un día.
 * null si la línea no tiene margen, si el día es anterior al primero cargado,
 * o si está en USD y no hay tipo de cambio.
 */
export function margenClpPorKg(
  cfg: ConfigCostoNoProducir | null | undefined,
  lineId: string | null | undefined,
  dateKey: string | null | undefined,
): { clpPorKg: number; origen: MargenVigente } | null {
  if (!cfg || !lineId || !dateKey) return null
  const dia = dateKey.slice(0, 10)
  const vigentes = (cfg.lineas[lineId] ?? [])
    .filter((m) => m.margenPorKg > 0 && m.vigenteDesde <= dia)
    .sort((a, b) => (a.vigenteDesde < b.vigenteDesde ? -1 : a.vigenteDesde > b.vigenteDesde ? 1 : 0))
  // Con dos del mismo día manda el último guardado: el orden es estable.
  const origen = vigentes[vigentes.length - 1]
  if (!origen) return null
  let clpPorKg = origen.margenPorKg
  if (origen.moneda === 'USD') {
    const tc = cfg.tipoCambioClpPorUsd
    if (!(tc != null && tc > 0)) return null
    clpPorKg = origen.margenPorKg * tc
  }
  if (!(clpPorKg >= MARGEN_CLP_MIN && clpPorKg <= MARGEN_CLP_MAX)) return null
  return { clpPorKg, origen }
}

export interface DetencionEnPesos {
  reason: string
  dueno: DuenoPerdida
  min: number
  piezas: number
  pesos: number
}

export interface CostoEnPesos {
  total: { min: number; piezas: number; kg: number; pesos: number }
  porDueno: Array<{ dueno: DuenoPerdida; min: number; piezas: number; pesos: number }>
  detenciones: DetencionEnPesos[]
}

export type FaltaParaPesos = 'margen' | 'peso'

/**
 * Lectura 1: lo recuperable del turno, en pesos.
 *
 * Entran los grupos con piezas (Mantención, Externo, Sin imputar). Lo
 * programado y el convenio traen `piezas: null` y quedan fuera: ahí no se
 * pierde producción.
 */
export function costoEnPesos(args: {
  grupos: GrupoDelTurno[] | null | undefined
  pesoKg: number | null | undefined
  clpPorKg: number | null | undefined
}): CostoEnPesos | { falta: FaltaParaPesos } | null {
  const grupos = (args.grupos ?? []).filter((g) => g.dueno !== 'programado' && g.piezas != null)
  if (grupos.length === 0) return null
  if (!(args.clpPorKg != null && args.clpPorKg > 0)) return { falta: 'margen' }
  if (!(args.pesoKg != null && args.pesoKg > 0)) return { falta: 'peso' }
  const porPieza = args.pesoKg * args.clpPorKg

  const detenciones: DetencionEnPesos[] = []
  const porDueno: CostoEnPesos['porDueno'] = []
  for (const g of grupos) {
    let min = 0
    let piezas = 0
    for (const c of g.causas) {
      if (c.piezas == null || !(c.piezas > 0)) continue
      min += c.min
      piezas += c.piezas
      detenciones.push({ reason: c.reason, dueno: g.dueno, min: c.min, piezas: c.piezas, pesos: c.piezas * porPieza })
    }
    if (piezas > 0) porDueno.push({ dueno: g.dueno, min, piezas, pesos: piezas * porPieza })
  }
  if (detenciones.length === 0) return null
  detenciones.sort((a, b) => b.pesos - a.pesos)
  const piezas = porDueno.reduce((s, d) => s + d.piezas, 0)
  return {
    total: {
      min: porDueno.reduce((s, d) => s + d.min, 0),
      piezas,
      kg: piezas * args.pesoKg,
      pesos: piezas * porPieza,
    },
    porDueno,
    detenciones,
  }
}

/** Lo que una causa dura habitualmente, sacado de turnos ANTERIORES. */
export interface Habitual {
  /** Minutos por evento (minutos de máquina, el mismo reloj de las detenciones). */
  min: number
  casos: number
}

/**
 * Duración habitual por causa: minutos totales / eventos totales de los turnos
 * que se le pasen. Es el MTTR histórico de esa causa en el reloj de Shoplogix.
 *
 * ⚠ Quien llama deja FUERA el turno que se está mirando: compararlo consigo
 * mismo daría siempre «igual a lo habitual».
 */
export function habitualPorCausa(
  turnos: Array<{ causas?: Array<{ reason: string; min: number; count: number }> | null }>,
  casosMinimos = CASOS_MINIMOS,
): Map<string, Habitual> {
  const acc = new Map<string, { min: number; casos: number }>()
  for (const t of turnos) {
    for (const c of t.causas ?? []) {
      if (!(c.min > 0) || !(c.count > 0)) continue
      const p = acc.get(c.reason) ?? { min: 0, casos: 0 }
      acc.set(c.reason, { min: p.min + c.min, casos: p.casos + c.count })
    }
  }
  const out = new Map<string, Habitual>()
  for (const [reason, v] of acc) {
    if (v.casos >= casosMinimos) out.set(reason, { min: v.min / v.casos, casos: v.casos })
  }
  return out
}

export interface CausaContraHabitual {
  reason: string
  habitual: Habitual
  /** Eventos que duraron menos que lo habitual, y cuánto menos en total. */
  bajo: { eventos: number; min: number; piezas: number; pesos: number }
  /** Eventos que duraron más, y cuánto más en total. */
  sobre: { eventos: number; min: number; piezas: number; pesos: number }
}

export interface EvitadoEnPesos {
  evitado: { eventos: number; min: number; piezas: number; pesos: number }
  sobre: { eventos: number; min: number; piezas: number; pesos: number }
  causas: CausaContraHabitual[]
  /** Causas de Mantención sin historia suficiente: no se comparan. */
  sinReferencia: string[]
}

/**
 * Lectura 2: lo que Mantención evitó por resolver antes de lo habitual.
 *
 * Cada minuto de diferencia se valoriza al ritmo de SU causa en este turno
 * (piezas de la causa / minutos de sus eventos), el mismo con que se cobró la
 * detención: así «evitado» y «costo» hablan en la misma unidad.
 */
export function evitadoPorRepararRapido(args: {
  grupos: GrupoDelTurno[] | null | undefined
  habitual: Map<string, Habitual>
  pesoKg: number | null | undefined
  clpPorKg: number | null | undefined
}): EvitadoEnPesos | null {
  const g = (args.grupos ?? []).find((x) => x.dueno === 'mantencion')
  if (!g) return null
  if (!(args.pesoKg != null && args.pesoKg > 0) || !(args.clpPorKg != null && args.clpPorKg > 0)) return null
  const porPieza = args.pesoKg * args.clpPorKg
  const cero = () => ({ eventos: 0, min: 0, piezas: 0, pesos: 0 })
  const res: EvitadoEnPesos = { evitado: cero(), sobre: cero(), causas: [], sinReferencia: [] }

  for (const c of g.causas) {
    if (c.piezas == null || !(c.piezas > 0) || c.paradas.length === 0) continue
    const h = args.habitual.get(c.reason)
    if (!h) { res.sinReferencia.push(c.reason); continue }
    const minEventos = c.paradas.reduce((s, p) => s + p.min, 0)
    if (!(minEventos > 0)) continue
    const pzPorMin = c.piezas / minEventos
    const fila: CausaContraHabitual = { reason: c.reason, habitual: h, bajo: cero(), sobre: cero() }
    for (const p of c.paradas) {
      const dif = h.min - p.min
      const lado = dif > 0 ? fila.bajo : dif < 0 ? fila.sobre : null
      if (!lado) continue
      const min = Math.abs(dif)
      lado.eventos += 1
      lado.min += min
      lado.piezas += min * pzPorMin
      lado.pesos += min * pzPorMin * porPieza
    }
    res.causas.push(fila)
    for (const k of ['eventos', 'min', 'piezas', 'pesos'] as const) {
      res.evitado[k] += fila.bajo[k]
      res.sobre[k] += fila.sobre[k]
    }
  }
  if (res.causas.length === 0 && res.sinReferencia.length === 0) return null
  return res
}

/**
 * Pesos para mostrar: siempre con «≈» y redondeados, como toda cifra
 * valorizada del monitor. Al millar bajo $100.000; a la decena de mil arriba.
 * Sobre $10 millones se abrevia («≈ $18,4 M»).
 */
export function fmtPesos(pesos: number): string {
  if (!(pesos > 0)) return '$0'
  if (pesos >= 10_000_000) {
    return `≈ $${(pesos / 1_000_000).toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} M`
  }
  const paso = pesos < 100_000 ? 1_000 : 10_000
  const r = Math.max(paso, Math.round(pesos / paso) * paso)
  return `≈ $${r.toLocaleString('es-CL')}`
}
