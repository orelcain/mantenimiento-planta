/**
 * Motivo P0 por pieza: cruza las piezas de Gate 0 del espejo con los registros de Puerta 0 (Matrix, Excel) y
 * reparte el P0 entre Mantención (fotocélula) y seteo y pesca («Fuera de límites» y «Puerta no preparada»). Sin
 * registro exacto, la pieza se estima con `causasP0Vivo` (seteo inferido de las piezas). Puro: sin Firestore ni DOM.
 *
 * 23-11 (decisión aprobada, mockup v4): «Puerta no preparada» es de Seteo. La puerta no alcanza a volver porque el
 * calibre carga muchas piezas seguidas en las mismas gates: se arregla repartiendo el calibre en más gates, no
 * con mantención. Sin Puerta 0, «tenía gate» no separa fotocélula de puerta: esas piezas quedan en Mantención como
 * estimado y así se rotulan.
 */
import type { PiezaEspejo } from './espejoFilas'
import { SeteoInferido, causasP0Vivo, type CausaP0 } from './pescaVivo'
import type { StoredGate0Record } from '../graderGate0Store'

export type DuenoP0 = 'mantencion' | 'seteo'

/** Motivos exactos de Puerta 0 que sí dicen de quién son. Clave: texto normalizado (sin acentos, minúsculas). */
const DUENO_DE_MOTIVO: Record<string, DuenoP0> = {
  'no leido por fotocelula': 'mantencion',
  'puerta no preparada': 'seteo',
  'fuera de limites': 'seteo',
}

const norm = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** Nombre canónico (con tildes) de cada motivo conocido: así el detalle no depende de cómo venga escrito. */
const MOTIVO_CANONICO: Record<string, string> = {
  'no leido por fotocelula': 'No leído por fotocélula',
  'puerta no preparada': 'Puerta no preparada',
  'fuera de limites': 'Fuera de límites',
}

/** Clave de cruce: los 19 primeros caracteres del ts (sin milisegundos) + el peso con 2 decimales. */
const claveCruce = (ts: string, kg: number): string => `${ts.slice(0, 19)}|${kg.toFixed(2)}` // decimal-tecnico: clave de cruce, no se muestra

/**
 * Cruza cada pieza (en el mismo orden) con un registro de Puerta 0 por ts + peso. Si hay piezas repetidas en la
 * misma clave, cada registro se consume una sola vez. Devuelve el texto exacto del motivo o `null` sin registro.
 */
export function cruzarPuerta0(piezas: readonly PiezaEspejo[], registros: readonly StoredGate0Record[]): Array<string | null> {
  const cola = new Map<string, string[]>()
  for (const r of registros) {
    if (r.weightKg === undefined || r.weightKg === null) continue
    const k = claveCruce(r.ts, r.weightKg)
    const l = cola.get(k) ?? []
    l.push((r.error ?? '').trim())
    cola.set(k, l)
  }
  return piezas.map((p) => {
    if (p.pesoKg === null) return null
    const l = cola.get(claveCruce(p.ts, p.pesoKg))
    const motivo = l?.shift()
    return motivo === undefined ? null : motivo
  })
}

export interface PiezaP0 {
  ts: string
  cantidad: number
  kg: number
  /** Dueño: exacto si hay motivo de Puerta 0 que lo diga; si no, estimado con `causasP0Vivo`. `sin-reparto` = sin peso. */
  dueno: DuenoP0 | 'sin-reparto'
  /** Texto exacto del motivo de Puerta 0, o `null` si no hay registro. */
  motivo: string | null
  exacto: boolean
  /** Causa estimada (seteo inferido). `null` si la pieza no tiene peso. */
  causa: CausaP0 | null
}

export interface GrupoP0 {
  pz: number
  kg: number
  exactoPz: number
  estimadoPz: number
}

export type ExactitudP0 = 'exacto' | 'estimado' | 'mixto' | 'sin-piezas'

export interface ResumenP0 {
  pz: number
  kg: number
  mantencion: GrupoP0
  seteo: GrupoP0
  sinReparto: GrupoP0
  /** Piezas y kg por motivo exacto de Puerta 0 (texto tal cual). */
  motivos: Record<string, { pz: number; kg: number }>
  exactitud: ExactitudP0
  /** Porcentaje de piezas con motivo exacto. `null` sin piezas. */
  pctExacto: number | null
  porPieza: PiezaP0[]
}

const grupoVacio = (): GrupoP0 => ({ pz: 0, kg: 0, exactoPz: 0, estimadoPz: 0 })

function sumar(g: GrupoP0, p: PiezaP0): void {
  g.pz += p.cantidad
  g.kg += p.kg
  if (p.exacto) g.exactoPz += p.cantidad
  else g.estimadoPz += p.cantidad
}

/** Causa estimada de una pieza: la única clave de `causasP0Vivo` con piezas. */
function causaDe(piezaGate0: PiezaEspejo, seteo: SeteoInferido): CausaP0 | null {
  const c = causasP0Vivo([piezaGate0], seteo)
  const k = (Object.keys(c.causas) as CausaP0[]).find((x) => c.causas[x] > 0)
  return k ?? null
}

/** Clasifica todas las piezas de Gate 0 del turno (`piezas` puede traer gate>0: son el seteo inferido). */
export function clasificarP0(piezas: readonly PiezaEspejo[], registros: readonly StoredGate0Record[] | null): ResumenP0 {
  const seteo = new SeteoInferido(piezas)
  const g0 = piezas.filter((p) => p.gate === 0)
  const motivos = registros && registros.length > 0 ? cruzarPuerta0(g0, registros) : g0.map(() => null)
  const out: ResumenP0 = {
    pz: 0,
    kg: 0,
    mantencion: grupoVacio(),
    seteo: grupoVacio(),
    sinReparto: grupoVacio(),
    motivos: {},
    exactitud: 'sin-piezas',
    pctExacto: null,
    porPieza: [],
  }
  g0.forEach((p, i) => {
    const kg = p.pesoKg ?? 0
    const causa = causaDe(p, seteo)
    const motivo = motivos[i] ?? null
    const duenoExacto = motivo !== null ? DUENO_DE_MOTIVO[norm(motivo)] : undefined
    let dueno: PiezaP0['dueno']
    let exacto = false
    if (duenoExacto) {
      dueno = duenoExacto
      exacto = true
    } else if (causa === null) {
      dueno = 'sin-reparto'
    } else {
      dueno = causa === 'tenia-gate' ? 'mantencion' : 'seteo'
    }
    const pieza: PiezaP0 = { ts: p.ts, cantidad: p.cantidad, kg, dueno, motivo, exacto, causa }
    out.porPieza.push(pieza)
    out.pz += p.cantidad
    out.kg += kg
    sumar(dueno === 'mantencion' ? out.mantencion : dueno === 'seteo' ? out.seteo : out.sinReparto, pieza)
    if (motivo !== null) {
      const clave = MOTIVO_CANONICO[norm(motivo)] ?? motivo
      const m = out.motivos[clave] ?? { pz: 0, kg: 0 }
      m.pz += p.cantidad
      m.kg += kg
      out.motivos[clave] = m
    }
  })
  if (out.pz > 0) {
    const exactoPz = out.mantencion.exactoPz + out.seteo.exactoPz + out.sinReparto.exactoPz
    out.pctExacto = (exactoPz / out.pz) * 100
    out.exactitud = exactoPz === 0 ? 'estimado' : exactoPz === out.pz ? 'exacto' : 'mixto'
  }
  return out
}

/** Piezas de Mantención por minuto del eje (`ts` - `t0Ms`), para repartir las barras de P0 cada 15 min. */
export function mantPorMinuto(porPieza: readonly PiezaP0[], t0Ms: number): Map<number, number> {
  const m = new Map<number, number>()
  for (const p of porPieza) {
    if (p.dueno !== 'mantencion') continue
    const min = Math.floor((Date.parse(p.ts) - t0Ms) / 60_000)
    m.set(min, (m.get(min) ?? 0) + p.cantidad)
  }
  return m
}

/** Dueño mayoritario de un tramo del eje: Mantención si sus piezas superan la mitad de las de P0 del tramo. */
export function duenoDelTramo(porPieza: readonly PiezaP0[], t0Ms: number, desdeMin: number, hastaMin: number): { dueno: DuenoP0; mant: number; total: number; estimado: boolean } | null {
  let mant = 0
  let total = 0
  let estimadoPz = 0
  for (const p of porPieza) {
    if (p.dueno === 'sin-reparto') continue
    const min = Math.floor((Date.parse(p.ts) - t0Ms) / 60_000)
    if (min < desdeMin || min >= hastaMin) continue
    total += p.cantidad
    if (p.dueno === 'mantencion') mant += p.cantidad
    if (!p.exacto) estimadoPz += p.cantidad
  }
  if (total === 0) return null
  return { dueno: mant * 2 > total ? 'mantencion' : 'seteo', mant, total, estimado: estimadoPz > 0 }
}

// 23-11: se quitó `PRECISION_ESTIMADO_PCT = 74`. Se había medido para fotocélula + puerta juntas (402 de 543 piezas
// «tenía gate», 7 turnos del 16 al 19-11); con la puerta en Seteo ya no vale, y solo 4 de esos turnos traen puerta
// (41 piezas). Mientras no se vuelva a medir, el estimado se rotula «estimado» sin porcentaje.

export const RAFAGA_VENTANA_MS = 15 * 60_000
/** Piezas de Mantención en la ventana para decir que hay ráfaga. Umbral ilustrativo, a validar en terreno. */
export const RAFAGA_UMBRAL_PZ = 12

export interface RafagaP0 {
  desdeMs: number
  hastaMs: number
  pz: number
  kg: number
  /** Alguna pieza de la ráfaga no tiene motivo exacto (puede traer piezas de puerta: sin Puerta 0 no se separan). */
  estimado: boolean
}

/**
 * Ráfaga de Mantención: ≥ `umbral` piezas de fotocélula (o «tenía gate» estimado) en una ventana de 15 min. Si hay
 * varias, la que termina más tarde. `null` si no hay ninguna.
 */
export function rafagaFotocelula(porPieza: readonly PiezaP0[], umbral = RAFAGA_UMBRAL_PZ, ventanaMs = RAFAGA_VENTANA_MS): RafagaP0 | null {
  const mant = porPieza
    .filter((p) => p.dueno === 'mantencion')
    .map((p) => ({ ...p, t: Date.parse(p.ts) }))
    .sort((a, b) => a.t - b.t)
  let mejor: RafagaP0 | null = null
  let i = 0
  let suma = 0
  for (let j = 0; j < mant.length; j++) {
    suma += mant[j]!.cantidad
    while (mant[j]!.t - mant[i]!.t >= ventanaMs) {
      suma -= mant[i]!.cantidad
      i++
    }
    if (suma >= umbral) {
      const v = mant.slice(i, j + 1)
      mejor = {
        desdeMs: mant[i]!.t,
        hastaMs: mant[j]!.t,
        pz: suma,
        kg: v.reduce((s, p) => s + p.kg, 0),
        estimado: v.some((p) => !p.exacto),
      }
    }
  }
  return mejor
}

export interface LineaDesglose {
  rotulo: string
  pz: number
}

const ROTULO_ESTIMADO: Partial<Record<CausaP0, string>> = {
  'tenia-gate': 'Fotocélula o puerta (estimado)',
  'calidad-sin-gate': 'Sin gate para su calidad (estimado)',
  'sin-gate-peso': 'Sin gate para su peso (estimado)',
  'calidad-d': 'Calidad D (estimado)',
}

/**
 * Sublíneas de «Por qué va a P0» por dueño, sacadas de las mismas piezas que el total del dueño: exactas por motivo de
 * Puerta 0 y estimadas por causa. Lo que no cae en una línea conocida va a «Otros», así cada dueño suma siempre su total
 * (en producción el desglose de «calidad sin gate» listaba solo los 3 primeros y no sumaba: 134 contra 112).
 */
export function desgloseP0(r: ResumenP0): { mantencion: LineaDesglose[]; seteo: LineaDesglose[] } {
  const orden: Record<'mantencion' | 'seteo', string[]> = {
    mantencion: ['No leído por fotocélula', ROTULO_ESTIMADO['tenia-gate']!],
    seteo: ['Fuera de límites', 'Puerta no preparada', ROTULO_ESTIMADO['calidad-sin-gate']!, ROTULO_ESTIMADO['sin-gate-peso']!, ROTULO_ESTIMADO['calidad-d']!],
  }
  const cuenta = { mantencion: new Map<string, number>(), seteo: new Map<string, number>() }
  for (const p of r.porPieza) {
    if (p.dueno === 'sin-reparto') continue
    const conocida = p.exacto && p.motivo !== null
      ? MOTIVO_CANONICO[norm(p.motivo)] ?? null
      : p.causa !== null ? ROTULO_ESTIMADO[p.causa] ?? null : null
    const k = conocida && orden[p.dueno].includes(conocida) ? conocida : 'Otros'
    cuenta[p.dueno].set(k, (cuenta[p.dueno].get(k) ?? 0) + p.cantidad)
  }
  const lineas = (d: 'mantencion' | 'seteo'): LineaDesglose[] =>
    [...orden[d], 'Otros'].map((rotulo) => ({ rotulo, pz: cuenta[d].get(rotulo) ?? 0 })).filter((x) => x.pz > 0)
  return { mantencion: lineas('mantencion'), seteo: lineas('seteo') }
}
