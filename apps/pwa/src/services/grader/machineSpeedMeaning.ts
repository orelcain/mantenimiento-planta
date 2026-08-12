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
/** Con una ventana elegida el mínimo baja: son minutos, no un turno. */
const MIN_PIEZAS_VENTANA = 10

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
  /** El objetivo por hora — la referencia contra la que se lee `ritmoPorHora`. */
  objetivoPorHora: number | null
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

/** Ventana de tiempo a analizar. Sin ella se mira el turno completo. */
export interface SpeedWindow {
  startMs: number
  endMs: number
}

function overlapSec(fromMs: number, toMs: number, w?: SpeedWindow): number {
  if (!w) return Math.max(0, (toMs - fromMs) / 1000)
  const ini = Math.max(fromMs, w.startMs)
  const fin = Math.min(toMs, w.endMs)
  return Math.max(0, (fin - ini) / 1000)
}

/*
 * Estados recortados a la ventana, NO filtrados por ella.
 *
 * Un paro de 40 min que empieza antes del tramo elegido igual aporta los
 * minutos que caen dentro. Contarlo entero inflaría la detención de una ventana
 * de 15 min hasta el absurdo; descartarlo entero diría que no hubo paro cuando
 * la máquina estuvo quieta todo el tramo. Solo la parte que solapa.
 */
function sumStates(m: UpstreamMachineShift, tipo: 'uptime' | 'downtime', w?: SpeedWindow): number {
  let sec = 0
  for (const s of m.states ?? []) {
    if (s.type !== tipo) continue
    const ini = s.startAt instanceof Date ? s.startAt.getTime() : new Date(s.startAt as unknown as string).getTime()
    const fin = ini + (s.durationSec ?? 0) * 1000
    if (Number.isNaN(ini)) { if (!w) sec += s.durationSec ?? 0; continue }
    sec += overlapSec(ini, fin, w)
  }
  return sec
}

export function buildMachineSpeedSummary(
  machines: UpstreamMachineShift[],
  window?: SpeedWindow,
): MachineSpeedSummary | null {
  if (machines.length === 0) return null

  const base = machines.map((m) => {
    /*
     * Los tramos SÍ se filtran (no se prorratean): son buckets de 5 min
     * indivisibles — no se sabe en qué minuto del bucket salieron las piezas.
     * Se cuenta el bucket si su inicio cae dentro de la ventana.
     */
    const intervals = (m.intervals ?? []).filter((iv) => {
      if (!window) return true
      const ts = iv.startAt instanceof Date ? iv.startAt.getTime() : new Date(iv.startAt as unknown as string).getTime()
      return !Number.isNaN(ts) && ts >= window.startMs && ts < window.endMs
    })
    const piezas = intervals.reduce((a, iv) => a + (iv.cycles || 0), 0)
    const uptimeSec = sumStates(m, 'uptime', window)
    const downtimeSec = sumStates(m, 'downtime', window)
    return {
      machineid: m.machineid,
      name: shortMachineName(m.machineName),
      piezas,
      uptimeSec,
      downtimeSec,
      // El objetivo se lee del turno COMPLETO: es una consigna de la máquina, no
      // del tramo. Tomarlo de la ventana daría null en un tramo sin producción.
      objetivoCpm: targetCpmFromIntervals(m.intervals ?? []),
      ritmoCpm: cadenceCpm(piezas, uptimeSec),
    }
  })

  // El umbral se afloja al mirar un tramo: 50 piezas es "no hubo turno" en un
  // turno completo, pero es media hora de producción normal en una ventana.
  const minPiezas = window ? MIN_PIEZAS_VENTANA : MIN_PIEZAS
  const conDatos = base.filter((b) => b.piezas >= minPiezas && b.uptimeSec > 0)
  if (conDatos.length === 0) return null

  const lineaCpm = lineCadenceCpm(conDatos.map((b) => b.ritmoCpm))

  const rows: MachineSpeedRow[] = conDatos.map((b) => {
    const { lostBySpeed, lostByStops } = computeLostPieces(b.piezas, b.uptimeSec, b.downtimeSec, lineaCpm)
    return {
      ...b,
      ritmoPorHora: b.ritmoCpm * 60,
      objetivoPorHora: b.objetivoCpm != null ? b.objetivoCpm * 60 : null,
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
