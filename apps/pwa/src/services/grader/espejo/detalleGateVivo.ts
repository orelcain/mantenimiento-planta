/**
 * Detalle de una gate (tanda 2 del monitor, opción B «Puntos por minuto» aprobada por Orel): la curva de pesos de
 * la última hora sobre el rango de su programa, hacia dónde se carga (el mínimo, el máximo o sobre el tope) y una
 * tira por minuto con un punto por pieza. Cuentas puras sobre las piezas del espejo; la hoja solo dibuja.
 */
import type { PiezaEspejo } from './espejoFilas'
import { calibrePorPeso } from './pescaVivo'
import { dec1 } from '@/utils/formatoNumeros'
import { rangoProgramaKg } from './seteoGatesVivo'

const KG_POR_LB = 0.453592
/** Un peso en kg dicho en libras, con un decimal y coma: 4,59 kg → «10,1 lb». */
export const kgALbTxt = (kg: number) => `${dec1(kg / KG_POR_LB)} lb`
export const VENTANA_GATE_MIN = 60
/** Paso de la curva de una gate con programa (50 g) y de Gate 0 (100 g). */
export const PASO_GATE_KG = 0.05
export const PASO_GATE0_KG = 0.1
/** Eje fijo de Gate 0: no tiene programa, las piezas rechazadas van de livianas a gigantes. */
export const EJE_GATE0_KG: [number, number] = [0.5, 6]

/** Rango del programa en libras y en kilos: «8-10 lb» → 8 / 10 y 3,63 / 4,54. «12-UP» no tiene tope. */
export interface RangoLbKg {
  loLb: number
  hiLb: number | null
  loKg: number
  hiKg: number | null
}

export function rangoLbKg(programa: string | null): RangoLbKg | null {
  const r = rangoProgramaKg(programa)
  if (!r) return null
  return { loLb: Math.round(r.lo / KG_POR_LB), hiLb: r.hi === null ? null : Math.round(r.hi / KG_POR_LB), loKg: r.lo, hiKg: r.hi }
}

/** Una pieza (o grupo de piezas iguales) con peso, ya reducida a lo que dibuja la tira. */
export interface PuntoPeso {
  ts: string
  /** Peso de UNA pieza. */
  kg: number
  cantidad: number
  /** Solo Gate 0: dueño del P0 y motivo. */
  dueno?: 'mantencion' | 'seteo' | null
  motivo?: string | null
  calidad?: string
}

export interface MinutoGate {
  /** `HH:MM`. */
  hora: string
  piezas: number
  puntos: PuntoPeso[]
}

export interface CasillaCurva {
  /** Borde izquierdo de la barra, kg. */
  kg: number
  n: number
}

export interface RepartoRango {
  haciaMin: number
  haciaMax: number
  sobre: number
}

export interface DetalleGate {
  /** Minutos de la ventana con piezas (más reciente primero). */
  minutos: MinutoGate[]
  piezas: number
  /** Piezas sin peso (no entran en la curva ni en las tiras). */
  sinPeso: number
  eje: [number, number]
  paso: number
  curva: CasillaCurva[]
  /** Con programa de tope: cuántas piezas van hacia el mínimo, hacia el máximo o sobre el tope. */
  reparto: RepartoRango | null
  /** Gate 0: las piezas por calibre de peso, de más a menos (los dos primeros y «otras»). */
  porCalibre: Array<{ rotulo: string; n: number }>
}

/**
 * Cuenta hacia dónde se cargan las piezas dentro del rango del programa. Mitad inferior del rango (y lo que quedó
 * bajo el mínimo) = hacia el mínimo; mitad superior = hacia el máximo; desde el tope hacia arriba = sobre el tope.
 * Sin tope (12-UP) no hay reparto.
 */
export function repartoEnRango(puntos: ReadonlyArray<{ kg: number; cantidad: number }>, loKg: number, hiKg: number | null): RepartoRango | null {
  if (hiKg === null) return null
  const mitad = (loKg + hiKg) / 2
  const r: RepartoRango = { haciaMin: 0, haciaMax: 0, sobre: 0 }
  for (const p of puntos) {
    if (p.kg >= hiKg) r.sobre += p.cantidad
    else if (p.kg >= mitad) r.haciaMax += p.cantidad
    else r.haciaMin += p.cantidad
  }
  return r
}

const cuantil = (s: number[], q: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))]!
const r3 = (v: number) => Math.round(v * 1000) / 1000

/** Eje de una gate con programa: el rango y la cola real de las piezas, con un margen, en mallas de 50 g. */
export function ejeDeGate(puntos: ReadonlyArray<{ kg: number }>, rango: RangoLbKg | null): [number, number] {
  const w = puntos.map((p) => p.kg).sort((a, b) => a - b)
  const p1 = w.length > 0 ? cuantil(w, 0.01) : rango?.loKg ?? 3
  const p99 = w.length > 0 ? cuantil(w, 0.99) : rango?.hiKg ?? 5
  const lo = Math.min(rango?.loKg ?? p1, p1)
  const hi = Math.max(rango?.hiKg ?? p99, p99)
  const a = Math.max(0.5, Math.floor((lo - 0.1) / PASO_GATE_KG) * PASO_GATE_KG)
  const b = Math.ceil((hi + 0.1) / PASO_GATE_KG) * PASO_GATE_KG
  return [r3(a), r3(b)]
}

function curvaDe(puntos: ReadonlyArray<{ kg: number; cantidad: number }>, eje: [number, number], paso: number): CasillaCurva[] {
  const n = Math.max(1, Math.round((eje[1] - eje[0]) / paso))
  const c = new Array<number>(n).fill(0)
  for (const p of puntos) {
    const i = Math.min(n - 1, Math.max(0, Math.floor((p.kg - eje[0]) / paso + 1e-9)))
    c[i]! += p.cantidad
  }
  return c.map((v, i) => ({ kg: r3(eje[0] + i * paso), n: v }))
}

function minutosDe(puntos: readonly PuntoPeso[], sinPeso: ReadonlyMap<string, number>): MinutoGate[] {
  const por = new Map<string, MinutoGate>()
  for (const p of puntos) {
    const k = p.ts.slice(0, 16)
    const m = por.get(k) ?? { hora: k.slice(11, 16), piezas: 0, puntos: [] }
    m.piezas += p.cantidad
    m.puntos.push(p)
    por.set(k, m)
  }
  for (const [k, n] of sinPeso) {
    const m = por.get(k) ?? { hora: k.slice(11, 16), piezas: 0, puntos: [] }
    m.piezas += n
    por.set(k, m)
  }
  return [...por.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([, m]) => m)
}

function armar(puntos: PuntoPeso[], sinPesoPorMinuto: Map<string, number>, eje: [number, number], paso: number, rango: RangoLbKg | null): DetalleGate {
  const sinPeso = [...sinPesoPorMinuto.values()].reduce((s, n) => s + n, 0)
  const conPeso = puntos.reduce((s, p) => s + p.cantidad, 0)
  const cal = new Map<string, number>()
  for (const p of puntos) {
    const k = calibrePorPeso(p.kg * 1000)
    cal.set(k, (cal.get(k) ?? 0) + p.cantidad)
  }
  const orden = [...cal.entries()].sort((a, b) => b[1] - a[1])
  const porCalibre = orden.slice(0, 2).map(([rotulo, n]) => ({ rotulo, n }))
  const resto = orden.slice(2).reduce((s, [, n]) => s + n, 0)
  if (resto > 0) porCalibre.push({ rotulo: 'otras', n: resto })
  return {
    minutos: minutosDe(puntos, sinPesoPorMinuto),
    piezas: conPeso + sinPeso,
    sinPeso,
    eje,
    paso,
    curva: curvaDe(puntos, eje, paso),
    reparto: rango ? repartoEnRango(puntos, rango.loKg, rango.hiKg) : null,
    porCalibre,
  }
}

const gramosDe = (p: PiezaEspejo) => (p.pesoKg !== null && p.cantidad > 0 ? (p.pesoKg * 1000) / p.cantidad : 0)

/**
 * Detalle de una gate con programa: sus piezas de la última hora (hasta `refMs`), solo desde que tiene el programa
 * vigente (`desdeTs`, o todo si arrancó con él). `programa` da el rango en lb y kg.
 */
export function detalleGate(piezas: readonly PiezaEspejo[], gate: number, programa: string | null, desdeTs: string | null, refMs: number): DetalleGate {
  const ini = new Date(refMs - VENTANA_GATE_MIN * 60_000).toISOString()
  const fin = new Date(refMs + 1000).toISOString()
  const desde = desdeTs && desdeTs > ini ? desdeTs : ini
  const puntos: PuntoPeso[] = []
  const sinPeso = new Map<string, number>()
  for (const p of piezas) {
    if (p.gate !== gate || p.ts < desde || p.ts >= fin) continue
    const g = gramosDe(p)
    if (g > 10) puntos.push({ ts: p.ts, kg: g / 1000, cantidad: p.cantidad })
    else sinPeso.set(p.ts.slice(0, 16), (sinPeso.get(p.ts.slice(0, 16)) ?? 0) + p.cantidad)
  }
  const rango = rangoLbKg(programa)
  return armar(puntos, sinPeso, ejeDeGate(puntos, rango), PASO_GATE_KG, rango)
}

/** Una pieza de Gate 0 con su motivo (de `PiezaP0` + el texto que arma la hoja). */
export interface PiezaGate0 {
  ts: string
  cantidad: number
  kg: number
  dueno: 'mantencion' | 'seteo' | 'sin-reparto'
  motivo: string | null
  calidad: string
}

/** Detalle de Gate 0: sus piezas de la última hora, con el dueño y el motivo de cada una. Eje fijo de 0,5 a 6 kg. */
export function detalleGate0(porPieza: readonly PiezaGate0[], refMs: number): DetalleGate {
  const ini = new Date(refMs - VENTANA_GATE_MIN * 60_000).toISOString()
  const fin = new Date(refMs + 1000).toISOString()
  const puntos: PuntoPeso[] = []
  const sinPeso = new Map<string, number>()
  for (const p of porPieza) {
    if (p.ts < ini || p.ts >= fin) continue
    const unidad = p.cantidad > 0 ? p.kg / p.cantidad : 0
    if (unidad > 0.01) puntos.push({ ts: p.ts, kg: unidad, cantidad: p.cantidad, dueno: p.dueno === 'sin-reparto' ? null : p.dueno, motivo: p.motivo, calidad: p.calidad })
    else sinPeso.set(p.ts.slice(0, 16), (sinPeso.get(p.ts.slice(0, 16)) ?? 0) + p.cantidad)
  }
  return armar(puntos, sinPeso, EJE_GATE0_KG, PASO_GATE0_KG, null)
}
