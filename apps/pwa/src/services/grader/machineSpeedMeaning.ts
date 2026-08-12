/**
 * machineSpeedMeaning.ts — qué significa el pz/min de cada Baader.
 *
 * El número ya estaba en pantalla; lo que faltaba era el resto de la frase.
 * "12,8 pz/min" no dice si eso es bueno, cuánto cuesta ni qué hacer. Este
 * módulo lo traduce a tres cosas que sí se pueden llevar a una reunión:
 *
 *   1. el mismo ritmo en pz/HORA — la unidad en la que se habla de un turno;
 *   2. cuántas piezas deja en el camino cada hora que produce a ese ritmo;
 *   3. cuánto de la pérdida total fue por IR LENTO y cuánto por ESTAR PARADA,
 *      que son problemas distintos y de dueños distintos.
 *
 * ⚠ Las piezas perdidas se miden contra la cadencia de la LÍNEA, no contra el
 * objetivo propio de cada máquina — ver `computeLostPieces`. Las tres Baader no
 * tienen la misma capacidad, y medir a cada una contra su propio objetivo
 * castiga justamente a la que más entrega.
 */

import { cadenceCpm, computeLostPieces, lineCadenceCpm, targetCpmFromIntervals } from './plantKpiCompute'
import { shortMachineName } from './graderMachineNames'
import type { UpstreamMachineShift } from '@/services/shoplogix/types'

/** Debajo de esto no hay turno del que hablar; los ritmos son ruido. */
const MIN_PIEZAS = 50

export interface MachineSpeedRow {
  machineid: string
  name: string
  piezas: number
  /** pz/min mientras produjo (no del turno completo: una máquina parada no es lenta). */
  ritmoCpm: number
  /** El mismo ritmo, por hora. */
  ritmoPorHora: number
  /** Objetivo del sensor para esta máquina, en pz/min. null si no lo reporta. */
  objetivoCpm: number | null
  /**
   * Piezas que deja de hacer por cada HORA que produce a ese ritmo.
   * Positivo = va bajo el objetivo. null sin objetivo.
   */
  brechaPorHora: number | null
  /** Piezas perdidas por ir más lento que la línea. */
  perdidasPorRitmo: number
  /** Piezas perdidas por estar detenida. */
  perdidasPorDetencion: number
  uptimeSec: number
  downtimeSec: number
}

export interface MachineSpeedSummary {
  rows: MachineSpeedRow[]
  /** Cadencia de la línea (mediana de las máquinas que produjeron). */
  lineaCpm: number | null
  totalPiezas: number
  totalPorRitmo: number
  totalPorDetencion: number
  /**
   * true si las máquinas tienen objetivos DISTINTOS entre sí. Es la señal para
   * avisar que sus porcentajes no se comparan: no todas son el mismo modelo.
   */
  objetivosDistintos: boolean
}

function sumStates(m: UpstreamMachineShift, tipo: 'uptime' | 'downtime'): number {
  let sec = 0
  for (const s of m.states ?? []) if (s.type === tipo) sec += s.durationSec ?? 0
  return sec
}

export function buildMachineSpeedSummary(machines: UpstreamMachineShift[]): MachineSpeedSummary | null {
  if (machines.length === 0) return null

  const base = machines.map((m) => {
    const piezas = (m.intervals ?? []).reduce((a, iv) => a + (iv.cycles || 0), 0)
    const uptimeSec = sumStates(m, 'uptime')
    const downtimeSec = sumStates(m, 'downtime')
    return {
      machineid: m.machineid,
      name: shortMachineName(m.machineName),
      piezas,
      uptimeSec,
      downtimeSec,
      objetivoCpm: targetCpmFromIntervals(m.intervals ?? []),
      ritmoCpm: cadenceCpm(piezas, uptimeSec),
    }
  })

  const conDatos = base.filter((b) => b.piezas >= MIN_PIEZAS && b.uptimeSec > 0)
  if (conDatos.length === 0) return null

  const lineaCpm = lineCadenceCpm(conDatos.map((b) => b.ritmoCpm))

  const rows: MachineSpeedRow[] = conDatos.map((b) => {
    const { lostBySpeed, lostByStops } = computeLostPieces(b.piezas, b.uptimeSec, b.downtimeSec, lineaCpm)
    return {
      ...b,
      ritmoPorHora: b.ritmoCpm * 60,
      brechaPorHora: b.objetivoCpm != null ? Math.max(0, (b.objetivoCpm - b.ritmoCpm) * 60) : null,
      perdidasPorRitmo: Math.round(lostBySpeed),
      perdidasPorDetencion: Math.round(lostByStops),
    }
  })

  const objetivos = new Set(rows.map((r) => (r.objetivoCpm == null ? null : Math.round(r.objetivoCpm))))
  objetivos.delete(null)

  return {
    rows,
    lineaCpm,
    totalPiezas: rows.reduce((a, r) => a + r.piezas, 0),
    totalPorRitmo: rows.reduce((a, r) => a + r.perdidasPorRitmo, 0),
    totalPorDetencion: rows.reduce((a, r) => a + r.perdidasPorDetencion, 0),
    objetivosDistintos: objetivos.size > 1,
  }
}
