/**
 * Máquinas candidatas para «Registrar trabajo» desde una detención del Jack-Knife (SPEC_BUSCADOR_JACK_KNIFE_2.md §2).
 * Lógica pura: sin Firestore ni React. El criterio de causa copia `hojaDeMantencion` del servidor
 * (functions/shoplogix/jackKnife.js, l.68 y l.107): `matchImputacion(reason || name)` con bucket «mantencion» y hoja.
 */
import { matchImputacion } from './imputacionTaxonomy'

const MIN = 60_000
const VENTANA_MS = 5 * MIN

/** Un state de la máquina en ms (instante de planta guardado como UTC, igual que `inicioMs`). */
export interface EstadoMaquinaMs {
  s: number
  e: number
  reason: string
  name: string
}

/** Una máquina del turno con sus states. */
export interface MaquinaDelTurno {
  machineName: string
  states: readonly EstadoMaquinaMs[]
}

/** Causa de Mantención de un state, o null si no es de Mantención. */
export function causaDeEstado(st: Pick<EstadoMaquinaMs, 'reason' | 'name'>): string | null {
  const m = matchImputacion(st.reason || st.name)
  return m.bucket === 'mantencion' && m.leaf ? m.leaf.label : null
}

/**
 * Máquinas con un state de la misma causa que se solape con la detención (±5 min).
 * Devuelve los nombres en el orden de entrada, sin repetir.
 */
export function maquinasCandidatas(
  maquinas: readonly MaquinaDelTurno[],
  causa: string,
  inicioMs: number,
  min: number,
): string[] {
  const fin = inicioMs + min * MIN
  const out: string[] = []
  for (const m of maquinas) {
    const hay = m.states.some(
      (st) => st.s < fin + VENTANA_MS && st.e > inicioMs - VENTANA_MS && causaDeEstado(st) === causa,
    )
    if (hay && !out.includes(m.machineName)) out.push(m.machineName)
  }
  return out
}
