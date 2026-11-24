/**
 * Piezas fuera del rango de su gate (pedido de Orel en el video del 24-11): en una gate 8-10 lb, una pieza sobre 10 lb
 * (o bajo 8 lb) no debería estar. Un par suelto es una «sugerencia» (nivel atento); varias y con peso en la gate
 * (tendencia) es una «alerta» (nivel mal).
 *
 * Mira la última ventana de la gate con su programa vigente. La zona compartida Premium (4,59–4,99 kg) no cuenta: ahí
 * una pieza cabe en 8-10 y en 10-12. Las mezclas de calibres en una gate salen por la misma regla (las piezas ajenas
 * caen fuera de su rango); detectarlas sin pesar cada pieza no se puede.
 */
import type { PiezaEspejo } from './espejoFilas'
import { ZONA_KG } from './campanaPesoVivo'
import { rangoProgramaKg, type GateVivo } from './seteoGatesVivo'

/** Minutos que se miran hacia atrás desde la referencia. */
export const VENTANA_FUERA_MIN = 30
/** Margen sobre el límite antes de contar la pieza como fuera (la balanza redondea a 10 g y el límite de 10 lb es 4,536). */
export const MARGEN_FUERA_KG = 0.05
/** Piezas fuera para avisar (sugerencia) y para pasar a alerta junto con el % de la gate. */
export const MIN_FUERA_SUGERENCIA = 2
export const MIN_FUERA_ALERTA = 5
export const PCT_FUERA_ALERTA = 5

export interface GateFuera {
  gate: number
  programa: string
  lado: 'sobre' | 'bajo'
  /** Piezas fuera y piezas con peso de la gate en la ventana. */
  n: number
  total: number
  pct: number
  /** La pieza más lejana del límite (kg). */
  extremoKg: number
  /** Límite que se pasó (kg). */
  limiteKg: number
  /** Hora ISO de la primera pieza fuera de la ventana. */
  desdeTs: string
  nivel: 'sugerencia' | 'alerta'
}

const gramos = (p: PiezaEspejo) => (p.pesoKg !== null && p.cantidad > 0 ? (p.pesoKg * 1000) / p.cantidad : 0)

/** Las gates con piezas fuera del rango de su programa, la peor primero. */
export function piezasFueraDeRango(piezas: readonly PiezaEspejo[], gates: readonly GateVivo[], refMs: number): GateFuera[] {
  const ini = new Date(refMs - VENTANA_FUERA_MIN * 60_000).toISOString()
  const fin = new Date(refMs + 1000).toISOString()
  const out: GateFuera[] = []
  for (const g of gates) {
    const r = rangoProgramaKg(g.programa)
    if (!g.programa || !r || g.apagada) continue
    const desde = g.desdeTs && g.desdeTs > ini ? g.desdeTs : ini
    const premium = /premium/i.test(g.programa)
    // La zona compartida deja pasar a una gate Premium 8-10 hasta el tope de la zona (4,99 kg): ahí caben en 8-10 y 10-12.
    const topeSobre = r.hi === null ? null : premium && r.hi < ZONA_KG[1] && r.hi > ZONA_KG[0] - 0.1 ? ZONA_KG[1] + MARGEN_FUERA_KG : r.hi + MARGEN_FUERA_KG
    const pisoBajo = r.lo - MARGEN_FUERA_KG
    let total = 0
    const sobre: PiezaEspejo[] = []
    const bajo: PiezaEspejo[] = []
    for (const p of piezas) {
      if (p.gate !== g.gate || p.ts < desde || p.ts >= fin) continue
      const w = gramos(p) / 1000
      if (w <= 0.01) continue
      total += p.cantidad
      if (topeSobre !== null && w > topeSobre) sobre.push(p)
      else if (r.lo > 0.5 && w < pisoBajo) bajo.push(p)
    }
    for (const [lado, lista, limite] of [['sobre', sobre, r.hi], ['bajo', bajo, r.lo]] as const) {
      const n = lista.reduce((s, p) => s + p.cantidad, 0)
      if (n < MIN_FUERA_SUGERENCIA || limite === null) continue
      const pct = total > 0 ? (n / total) * 100 : 0
      const kgs = lista.map((p) => gramos(p) / 1000)
      out.push({
        gate: g.gate,
        programa: g.programa,
        lado,
        n,
        total,
        pct,
        extremoKg: lado === 'sobre' ? Math.max(...kgs) : Math.min(...kgs),
        limiteKg: limite,
        desdeTs: lista[0]!.ts,
        nivel: n >= MIN_FUERA_ALERTA && pct >= PCT_FUERA_ALERTA ? 'alerta' : 'sugerencia',
      })
    }
  }
  return out.sort((a, b) => Number(b.nivel === 'alerta') - Number(a.nivel === 'alerta') || b.n - a.n)
}
