/**
 * Salida por calibre con sus gates (tanda 2, opción A «Por calibre, con sus gates» aprobada por Orel): reemplaza
 * «Calibre y calidad» y «Pesca por programa». Cada calibre lleva su % de la salida partido por calidad y las gates
 * que lo recibieron; los de poco flujo quedan en una sola línea plegada.
 *
 * Sale de `seteo.programas` (la pesca del turno por calibre · calidad, sin Gate 0), así que es lo mismo que la tabla
 * de pesca de antes, reagrupado por calibre.
 */
import type { ProgramaPesca } from './seteoGatesVivo'

/** Calidades que la matriz muestra siempre, con 0 piezas si no hubo. */
const CALIDADES_FIJAS = ['Premium', 'Industrial', 'D']

const ORDEN_CALIBRE = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', '12-UP lb']

export interface ParteCalibre {
  calidad: string
  piezas: number
  /** % de la salida del turno. */
  pct: number
  gates: ProgramaPesca['gates']
}

export interface CalibreSalida {
  calibre: string
  piezas: number
  /** % de la salida del turno. */
  pct: number
  /** Una parte por calidad, la de más piezas primero. */
  partes: ParteCalibre[]
  /** Todos sus programas son de poco flujo (bajo 1 pz/min por gate): va a la línea plegada. */
  pocoFlujo: boolean
}

export interface SalidaCalibres {
  piezas: number
  calibres: CalibreSalida[]
  /** Los que se muestran (de más a menos salida) y los de poco flujo. */
  principales: CalibreSalida[]
  poco: CalibreSalida[]
  /** Calidad del turno, de más a menos. */
  calidad: Array<{ calidad: string; pct: number; piezas: number }>
  /** Gates distintas de los calibres de poco flujo. */
  gatesPoco: number
}

const partirPrograma = (programa: string): [string, string] => {
  const i = programa.indexOf(' · ')
  return i < 0 ? [programa, ''] : [programa.slice(0, i), programa.slice(i + 3)]
}

/** «8-10 lb» → «8-10»; «12-UP lb» → «12-UP». */
export const calibreCorto = (c: string) => c.replace(/ lb$/, '')

export function salidaPorCalibre(programas: readonly ProgramaPesca[]): SalidaCalibres {
  // Los programas del grupo «Poco flujo» se abren: cada uno conserva su calibre y calidad.
  const planos: Array<{ p: ProgramaPesca; poco: boolean }> = []
  for (const p of programas) {
    if (p.grupo) for (const m of p.miembros ?? []) planos.push({ p: m, poco: true })
    else planos.push({ p, poco: false })
  }
  const por = new Map<string, { piezas: number; pct: number; partes: Map<string, ParteCalibre>; todoPoco: boolean }>()
  const cal = new Map<string, { piezas: number; pct: number }>()
  for (const { p, poco } of planos) {
    const [calibre, calidad] = partirPrograma(p.programa)
    const c = por.get(calibre) ?? { piezas: 0, pct: 0, partes: new Map<string, ParteCalibre>(), todoPoco: true }
    c.piezas += p.piezas
    c.pct += p.pct
    if (!poco) c.todoPoco = false
    const parte = c.partes.get(calidad) ?? { calidad, piezas: 0, pct: 0, gates: [] }
    parte.piezas += p.piezas
    parte.pct += p.pct
    parte.gates = [...parte.gates, ...p.gates].sort((a, b) => a.gate - b.gate)
    c.partes.set(calidad, parte)
    por.set(calibre, c)
    const q = cal.get(calidad) ?? { piezas: 0, pct: 0 }
    q.piezas += p.piezas
    q.pct += p.pct
    cal.set(calidad, q)
  }
  const calibres: CalibreSalida[] = [...por.entries()].map(([calibre, c]) => ({
    calibre,
    piezas: c.piezas,
    pct: c.pct,
    partes: [...c.partes.values()].sort((a, b) => b.piezas - a.piezas),
    pocoFlujo: c.todoPoco,
  }))
  const orden = (x: CalibreSalida, y: CalibreSalida) => y.pct - x.pct || ORDEN_CALIBRE.indexOf(x.calibre) - ORDEN_CALIBRE.indexOf(y.calibre)
  const principales = calibres.filter((c) => !c.pocoFlujo).sort(orden)
  const poco = calibres.filter((c) => c.pocoFlujo).sort((x, y) => ORDEN_CALIBRE.indexOf(y.calibre) - ORDEN_CALIBRE.indexOf(x.calibre))
  // Las 3 calidades siempre se muestran, aunque una no tenga piezas (decisión de Orel).
  for (const q of CALIDADES_FIJAS) if (!cal.has(q)) cal.set(q, { piezas: 0, pct: 0 })
  const gs = new Set<number>()
  for (const c of poco) for (const pa of c.partes) for (const g of pa.gates) gs.add(g.gate)
  return {
    piezas: planos.reduce((s, x) => s + x.p.piezas, 0),
    calibres,
    principales,
    poco,
    calidad: [...cal.entries()].map(([calidad, v]) => ({ calidad, pct: v.pct, piezas: v.piezas })).sort((a, b) => b.piezas - a.piezas),
    gatesPoco: gs.size,
  }
}

const hhmm = (ts: string) => ts.slice(11, 16)

/** «G8–G10, G11 desde 03:21»: las gates sin límite de hora se juntan en tramos; las con hora van aparte. */
export function textoGatesParte(gates: ProgramaPesca['gates']): string {
  const libres = gates.filter((g) => !g.desde && !g.hasta).map((g) => g.gate).sort((a, b) => a - b)
  const out: string[] = []
  let i = 0
  while (i < libres.length) {
    let j = i
    while (j + 1 < libres.length && libres[j + 1] === libres[j]! + 1) j++
    out.push(j - i >= 2 ? `G${libres[i]}–G${libres[j]}` : libres.slice(i, j + 1).map((g) => `G${g}`).join(', '))
    i = j + 1
  }
  for (const g of gates) {
    if (g.desde && g.hasta) out.push(`G${g.gate} de ${hhmm(g.desde)} a ${hhmm(g.hasta)}`)
    else if (g.hasta) out.push(`G${g.gate} hasta ${hhmm(g.hasta)}`)
    else if (g.desde) out.push(`G${g.gate} desde ${hhmm(g.desde)}`)
  }
  return out.join(', ')
}
