/**
 * Efecto de las acciones fuertes (Causa raíz, Análisis de turno). Puro: recibe los turnos del
 * Jack-Knife ya cargados (`turno.resumen.eventos`) y los ACR; no lee nada.
 */
import type { CalculoJK, TurnoJK } from '@/services/shoplogix/jackKnife'
import { nivelPrioridad } from '@/services/shoplogix/jackKnife'
import type { Acr } from './acr.types'
import { tieneAccionFuerteHecha } from './acrHistorial'

/** Turnos a cada lado del corte. */
export const VENTANA_EFECTO = 30
/** Paso entre ventanas de referencia (se solapan). */
export const PASO_REFERENCIA = 15
/** Eventos mínimos de una causa en la ventana de antes para medirla. */
export const MIN_EVENTOS_ANTES = 5
/** Causas medidas mínimas para afirmar un veredicto del grupo. */
export const MIN_CAUSAS = 5

/** Turnos en orden cronológico (copia; el original no se toca). */
function ordenados(turnos: readonly TurnoJK[]): TurnoJK[] {
  return [...turnos].sort((a, b) => a.dateKey.localeCompare(b.dateKey))
}

/** Eventos por causa dentro de una lista de turnos. */
function contarPorCausa(turnos: readonly TurnoJK[]): Map<string, { ev: number; min: number }> {
  const mapa = new Map<string, { ev: number; min: number }>()
  for (const t of turnos) {
    for (const [causa, , min] of t.resumen.eventos) {
      const x = mapa.get(causa) ?? { ev: 0, min: 0 }
      x.ev++
      x.min += min
      mapa.set(causa, x)
    }
  }
  return mapa
}

/** Fecha de corte por causa: la menor `hechaEn` de sus acciones fuertes hechas. */
export function cortesPorCausa(acrs: readonly Acr[]): Map<string, string> {
  const cortes = new Map<string, string>()
  for (const a of acrs) {
    if (typeof a.causaJK !== 'string') continue
    for (const x of a.acciones) {
      if (x.fuerza !== 'fuerte' || x.estado !== 'hecha' || !x.hechaEn) continue
      const previa = cortes.get(a.causaJK)
      if (previa === undefined || x.hechaEn < previa) cortes.set(a.causaJK, x.hechaEn)
    }
  }
  return cortes
}

export interface ReferenciaCaida {
  /** Ventanas (causa × paso) que entraron en la referencia. */
  casos: number
  mediana: number
  p25: number
  p75: number
}

/**
 * Cuánto cae una causa sola, sin análisis: para cada ventana de referencia, el cambio de eventos
 * de las 30 siguientes frente a las 30 anteriores. Se omite la ventana si la causa tiene corte y
 * la ventana posterior llega hasta el corte (así una caída posterior a la acción no cuenta aquí).
 */
export function referenciaCaidaSola(
  turnos: readonly TurnoJK[],
  cortes: ReadonlyMap<string, string>,
): ReferenciaCaida | null {
  const lista = ordenados(turnos)
  const n = lista.length
  const cambios: number[] = []

  for (let i = VENTANA_EFECTO; i + VENTANA_EFECTO <= n; i += PASO_REFERENCIA) {
    const antes = contarPorCausa(lista.slice(i - VENTANA_EFECTO, i))
    const despues = contarPorCausa(lista.slice(i, i + VENTANA_EFECTO))
    const ultimo = lista[i + VENTANA_EFECTO - 1]!.dateKey
    for (const [causa, x] of antes) {
      if (x.ev < MIN_EVENTOS_ANTES) continue
      const corte = cortes.get(causa)
      if (corte !== undefined && ultimo >= corte) continue
      cambios.push((despues.get(causa)?.ev ?? 0) / x.ev - 1)
    }
  }

  if (cambios.length === 0) return null
  cambios.sort((a, b) => a - b)
  const q = (p: number): number => cambios[Math.min(cambios.length - 1, Math.floor(p * cambios.length))]!
  return { casos: cambios.length, mediana: q(0.5), p25: q(0.25), p75: q(0.75) }
}

export interface FilaEfecto {
  causa: string
  corte: string
  antesEv: number
  antesMin: number
  despuesEv: number
  despuesMin: number
  /** Turnos posteriores al corte ya disponibles (hasta 30). */
  turnosDespues: number
  estado: 'midiendo' | 'medida' | 'pocasAntes'
  /** Cambio de eventos (después / antes − 1). Solo con estado `medida`. */
  cambio: number | null
}

/** Antes y después por causa, alrededor de su fecha de corte. */
export function efectoPorCausa(turnos: readonly TurnoJK[], cortes: ReadonlyMap<string, string>): FilaEfecto[] {
  const lista = ordenados(turnos)
  return [...cortes].map(([causa, corte]) => {
    const primero = lista.findIndex((t) => t.dateKey >= corte)
    const i = primero === -1 ? lista.length : primero
    const antes = lista.slice(Math.max(0, i - VENTANA_EFECTO), i)
    const despues = lista.slice(i, i + VENTANA_EFECTO)
    const a = contarPorCausa(antes).get(causa) ?? { ev: 0, min: 0 }
    const d = contarPorCausa(despues).get(causa) ?? { ev: 0, min: 0 }
    const estado: FilaEfecto['estado'] =
      antes.length < VENTANA_EFECTO || a.ev < MIN_EVENTOS_ANTES
        ? 'pocasAntes'
        : despues.length < VENTANA_EFECTO
          ? 'midiendo'
          : 'medida'
    return {
      causa,
      corte,
      antesEv: a.ev,
      antesMin: a.min,
      despuesEv: d.ev,
      despuesMin: d.min,
      turnosDespues: despues.length,
      estado,
      cambio: estado === 'medida' ? d.ev / a.ev - 1 : null,
    }
  })
}

export interface ResumenEfecto {
  medidas: number
  minimas: number
  medianaCambio: number | null
  veredicto: 'falta' | 'caeMas' | 'igual'
}

/**
 * Veredicto del grupo. `caeMas` exige al menos 5 causas medidas y que la mediana de sus cambios
 * quede en o bajo el percentil 25 de la referencia. Con 5 causas, la mediana cae bajo el
 * percentil 25 por azar ~10 % de las veces (binomial, ≥3 de 5).
 */
export function resumenEfecto(filas: readonly FilaEfecto[], ref: { p25: number } | null): ResumenEfecto {
  const cambios = filas
    .filter((f): f is FilaEfecto & { cambio: number } => f.estado === 'medida' && f.cambio !== null)
    .map((f) => f.cambio)
    .sort((a, b) => a - b)
  const medidas = cambios.length
  const medianaCambio = medidas === 0 ? null : cambios[Math.min(medidas - 1, Math.floor(0.5 * medidas))]!

  let veredicto: ResumenEfecto['veredicto'] = 'igual'
  if (medidas < MIN_CAUSAS) veredicto = 'falta'
  else if (ref !== null && medianaCambio !== null && medianaCambio <= ref.p25) veredicto = 'caeMas'

  return { medidas, minimas: MIN_CAUSAS, medianaCambio, veredicto }
}

/** Causas de nivel 1 o 2 del Jack-Knife que tienen un ACR con acción fuerte hecha. */
export function coberturaPrioritarias(
  calc: CalculoJK,
  acrs: readonly Acr[],
): { cubiertas: number; total: number } {
  const prioritarias = calc.pts.filter((p) => nivelPrioridad(p, calc.un, calc.um) <= 2)
  const cubiertas = prioritarias.filter((p) =>
    acrs.some((a) => a.causaJK === p.k && tieneAccionFuerteHecha(a)),
  ).length
  return { cubiertas, total: prioritarias.length }
}
