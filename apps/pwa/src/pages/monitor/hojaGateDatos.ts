/** Lo que la hoja de una gate necesita (tanda 2): el detalle de su última hora y su encabezado. Puro, aparte del componente. */
import { coma1, milesPunto } from '@/services/grader/espejo/alertasGrader'
import { detalleGate, detalleGate0, rangoLbKg, type DetalleGate, type PiezaGate0, type RangoLbKg } from '@/services/grader/espejo/detalleGateVivo'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { PiezaP0 } from '@/services/grader/espejo/motivoP0'
import type { BordeGate } from '@/services/grader/espejo/pescaVivo'
import type { SeteoVivo } from '@/services/grader/espejo/seteoGatesVivo'
import { hhmm, programaTxt } from './formatoGateVivo'
import { motivoDe } from './porQueP0Datos'

export interface ArmadoGate {
  gate: number
  titulo: string
  desc: string
  det: DetalleGate
  rango: RangoLbKg | null
  programa: string | null
  desdeHora: string | null
  borde: BordeGate | null
  cambios: SeteoVivo['cambios']
}

/** Lo que la hoja de una gate necesita: el detalle de su última hora y su encabezado. */
export function armarHojaGate(gate: number, seteo: SeteoVivo, piezas: readonly PiezaEspejo[], porPieza: readonly PiezaP0[], bordes: readonly BordeGate[]): ArmadoGate {
  const refMs = Date.parse(seteo.referenciaTs)
  if (gate === 0) {
    const g0 = seteo.gate0
    const datos: PiezaGate0[] = porPieza.map((p) => ({ ts: p.ts, cantidad: p.cantidad, kg: p.kg, dueno: p.dueno, motivo: motivoDe(p), calidad: p.calidad }))
    const det = detalleGate0(datos, refMs)
    return {
      gate: 0,
      titulo: 'Gate 0 · Rechazo',
      desc: `Última hora · ${milesPunto(det.piezas)} pz · P0 ${coma1(g0.pctHora)} %`,
      det,
      rango: null,
      programa: null,
      desdeHora: null,
      borde: null,
      cambios: [],
    }
  }
  const g = seteo.gates.find((x) => x.gate === gate)
  const programa = g?.programa ?? null
  const det = detalleGate(piezas, gate, programa, g?.desdeTs ?? null, refMs)
  const primero = seteo.tramos.find((t) => t.gate === gate)
  return {
    gate,
    titulo: `G${gate} · ${programa ? programaTxt(programa) : 'Sin piezas'}`,
    desc: `Última hora · ${milesPunto(det.piezas)} pz · ${coma1(g?.pzMinHora ?? 0)} pz/min`,
    det,
    rango: rangoLbKg(programa),
    programa,
    desdeHora: g?.desdeTs ? hhmm(g.desdeTs) : primero ? hhmm(primero.desdeTs) : null,
    borde: bordes.find((b) => b.gate === gate) ?? null,
    cambios: seteo.cambios.filter((c) => c.gate === gate),
  }
}
