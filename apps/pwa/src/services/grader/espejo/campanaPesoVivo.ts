/**
 * Campana del peso del turno (tanda 2, opción A «Una campana con las gates» aprobada por Orel): una sola tarjeta para
 * lo que hoy son «Zona compartida», «Bordes de gate» y «Peso». La campana crece por capas (lo leído hasta cada hito
 * del turno) sobre los rangos de las gates, y encima se marca la zona compartida.
 *
 * Todas las cuentas son de la salida del turno: gate 1 a 12, con peso. Gate 0 no entra (su peso va en su hoja).
 */
import type { PiezaEspejo } from './espejoFilas'
import { rangoLbKg } from './detalleGateVivo'
import { ZONA_DESDE_G, ZONA_HASTA_G } from './pescaVivo'

export const CAMPANA_DESDE_KG = 2
export const CAMPANA_HASTA_KG = 6
export const CAMPANA_PASO_KG = 0.1
/** Un hito necesita al menos esto de turno leído antes y después para tener sentido. */
export const HITO_MARGEN_MIN = 30

const BINS = Math.round((CAMPANA_HASTA_KG - CAMPANA_DESDE_KG) / CAMPANA_PASO_KG)
const gramos = (p: PiezaEspejo) => (p.pesoKg !== null && p.cantidad > 0 ? (p.pesoKg * 1000) / p.cantidad : 0)

/**
 * Hitos del turno: horas en punto (hora de reloj del turno) que caen al tercio y a los dos tercios de lo leído, con
 * al menos 30 min de datos a cada lado. Hasta dos; ninguno si el turno lleva menos de una hora. Devuelve ISO.
 */
export function hitosDelTurno(primeraTs: string, ultimaTs: string): string[] {
  const a = Date.parse(primeraTs)
  const b = Date.parse(ultimaTs)
  if (!(b > a)) return []
  const HORA = 3_600_000
  const cand: number[] = []
  for (let t = Math.ceil((a + HITO_MARGEN_MIN * 60_000) / HORA) * HORA; t <= b - HITO_MARGEN_MIN * 60_000; t += HORA) cand.push(t)
  if (cand.length === 0) return []
  const cerca = (obj: number) => cand.reduce((m, t) => (Math.abs(t - obj) < Math.abs(m - obj) ? t : m), cand[0]!)
  const elegidos = new Set<number>([cerca(a + (b - a) / 3)])
  if (cand.length > 1) elegidos.add(cerca(a + ((b - a) * 2) / 3))
  return [...elegidos].sort((x, y) => x - y).map((t) => new Date(t).toISOString())
}

export interface CapaCampana {
  /** `hasta 00:00` o `ahora`. */
  rotulo: string
  /** Piezas con peso acumuladas hasta el hito (la capa de arriba es todo el turno). */
  piezas: number
  /** Piezas por casilla de 100 g, acumuladas: cada capa contiene a la anterior. */
  bins: number[]
}

export interface BandaCalibre {
  rotulo: string
  desdeKg: number
  /** `null` = sin tope (12-UP): llega al borde del eje. */
  hastaKg: number | null
}

export interface CampanaTurno {
  piezas: number
  mediaKg: number | null
  /** De más antigua a más reciente. La última es «ahora». */
  capas: CapaCampana[]
  /** Piezas fuera de 2–6 kg (no se dibujan). */
  fuera: number
  /** Rangos en kg de los calibres que hoy tienen gate, de menor a mayor. */
  bandas: BandaCalibre[]
  /** Casilla más alta de la campana de hoy (para la escala). */
  maximo: number
}

/** Los calibres con gate hoy, con su rango en kg. `programas` = el programa de cada gate («8-10 lb · Premium»). */
export function bandasDeCalibres(programas: ReadonlyArray<string | null>): BandaCalibre[] {
  const vistos = new Map<string, BandaCalibre>()
  for (const p of programas) {
    const r = rangoLbKg(p)
    if (!r) continue
    const rotulo = r.hiLb === null ? `${r.loLb}-UP` : `${r.loLb}-${r.hiLb}`
    if (!vistos.has(rotulo)) vistos.set(rotulo, { rotulo, desdeKg: r.loKg, hastaKg: r.hiKg })
  }
  return [...vistos.values()].sort((a, b) => a.desdeKg - b.desdeKg)
}

/** La campana del turno por capas. `piezas` = las del turno en orden de hora; `programas` = el de cada gate. */
export function campanaDelTurno(piezas: readonly PiezaEspejo[], programas: ReadonlyArray<string | null> = []): CampanaTurno {
  const conPeso = piezas.filter((p) => p.gate > 0 && gramos(p) > 10)
  const bandas = bandasDeCalibres(programas)
  if (conPeso.length === 0) return { piezas: 0, mediaKg: null, capas: [], fuera: 0, bandas, maximo: 0 }
  const hitos = hitosDelTurno(conPeso[0]!.ts, conPeso[conPeso.length - 1]!.ts)
  const cortes = [...hitos, '9999']
  const capas: CapaCampana[] = cortes.map((c, i) => ({
    rotulo: i === cortes.length - 1 ? 'ahora' : `hasta ${c.slice(11, 16)}`,
    piezas: 0,
    bins: new Array<number>(BINS).fill(0),
  }))
  let n = 0
  let kg = 0
  let fuera = 0
  for (const p of conPeso) {
    const w = gramos(p) / 1000
    n += p.cantidad
    kg += w * p.cantidad
    const i = Math.floor((w - CAMPANA_DESDE_KG) / CAMPANA_PASO_KG + 1e-9)
    const dentro = i >= 0 && i < BINS
    if (!dentro) fuera += p.cantidad
    // La pieza cuenta en su capa y en todas las de arriba (cada capa contiene a la anterior).
    const k = cortes.findIndex((c) => p.ts < c)
    for (let j = k; j < capas.length; j++) {
      capas[j]!.piezas += p.cantidad
      if (dentro) capas[j]!.bins[i]! += p.cantidad
    }
  }
  const ahora = capas[capas.length - 1]!
  return { piezas: n, mediaKg: kg / n, capas, fuera, bandas, maximo: Math.max(1, ...ahora.bins) }
}

export const ZONA_KG: [number, number] = [ZONA_DESDE_G / 1000, ZONA_HASTA_G / 1000]
