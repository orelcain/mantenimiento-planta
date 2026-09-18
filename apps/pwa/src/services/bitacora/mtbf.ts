import type { TurnoMantencion } from './bitacora.types'
import { formatoMinutos } from './turnoMantencion'

/**
 * MTBF y MTTR de la bitácora (pedido de Orel, 18-09-2026): las dos siglas de la
 * planilla «MTBF - MTTR» con su definición y su cálculo a la vista, para que no
 * sean decorativas.
 *
 *  - MTTR = minutos de parada ÷ fallas con parada (ya lo calcula `resumirBitacora`).
 *  - MTBF = tiempo operando ÷ fallas con parada, donde tiempo operando son las
 *    horas del turno menos un tiempo fijo sin producción y menos las paradas.
 *
 * Es el MTBF de la PLANTA con lo que registran los técnicos: aproximado y dicho
 * así en la misma línea. El riguroso por máquina, con tiempo de producción real
 * de Shoplogix, vive en Análisis de Turno (`kpisMantencionTurno`).
 */

/**
 * Tiempo sin producción dentro de un turno de 8 h que NO cuenta para el MTBF:
 * colación (1 h), reunión de inicio de turno y ejercicios compensatorios.
 * Promedio que dio Orel (18-09-2026): 1,5 h.
 */
export const MINUTOS_SIN_PRODUCCION_POR_TURNO = 90

export function minutosDelTurno(turno: Pick<TurnoMantencion, 'inicio' | 'fin'>): number {
  return Math.max(0, Math.round((turno.fin.getTime() - turno.inicio.getTime()) / 60_000))
}

/** Minutos operando: el turno menos lo sin producción y menos las paradas registradas. */
export function minutosOperando(minutosTurno: number, minutosParada: number, turnos = 1): number {
  return Math.max(0, minutosTurno - MINUTOS_SIN_PRODUCCION_POR_TURNO * turnos - minutosParada)
}

/** MTBF en minutos, o null sin fallas con parada (no existe, no es cero). */
export function mtbf(minutosTurno: number, minutosParada: number, conParada: number, turnos = 1): number | null {
  return conParada > 0 ? minutosOperando(minutosTurno, minutosParada, turnos) / conParada : null
}

export function mtbfDelTurno(turno: Pick<TurnoMantencion, 'inicio' | 'fin'>, r: { minutosParada: number; conParada: number }): number | null {
  return mtbf(minutosDelTurno(turno), r.minutosParada, r.conParada)
}

const fallas = (n: number) => `${n} ${n === 1 ? 'falla' : 'fallas'}`

/**
 * La línea que va bajo la planilla: cada sigla con su definición entre
 * paréntesis y el cálculo con los números del turno. Sin paradas, lo dice.
 */
export function explicacionMtbfMttr(turno: Pick<TurnoMantencion, 'inicio' | 'fin'>, r: { minutosParada: number; conParada: number; mttrMin: number | null }): string {
  if (r.conParada === 0) return 'MTTR y MTBF: sin fallas con parada en el turno, no aplican.'
  const minutosTurno = minutosDelTurno(turno)
  const operando = minutosOperando(minutosTurno, r.minutosParada)
  const valorMtbf = mtbf(minutosTurno, r.minutosParada, r.conParada)
  const mttr =
    r.mttrMin == null
      ? `MTTR — (tiempo promedio en reparar cada falla: ${r.conParada === 1 ? 'la falla no tiene' : `las ${r.conParada} fallas no tienen`} duración todavía).`
      : `MTTR ${formatoMinutos(r.mttrMin)} (tiempo promedio en reparar cada falla: ${formatoMinutos(r.minutosParada)} de parada ÷ ${fallas(r.conParada)}).`
  const base =
    `${formatoMinutos(minutosTurno)} de turno − ${formatoMinutos(MINUTOS_SIN_PRODUCCION_POR_TURNO)} sin producción (colación, reunión, ejercicios) − ` +
    `${formatoMinutos(r.minutosParada)} de parada = ${formatoMinutos(operando)}`
  return `${mttr} MTBF ${valorMtbf == null ? '—' : formatoMinutos(valorMtbf)} (tiempo promedio operando entre fallas: ${base} ÷ ${r.conParada}).`
}

/** La misma línea para un período: N turnos, sumando sus horas. */
export function explicacionMtbfMttrPeriodo(minutosTurnos: number, turnos: number, r: { minutosParada: number; conParada: number; mttrMin: number | null }): string {
  if (r.conParada === 0) return 'MTTR y MTBF: sin fallas con parada en el período, no aplican.'
  const operando = minutosOperando(minutosTurnos, r.minutosParada, turnos)
  const valorMtbf = mtbf(minutosTurnos, r.minutosParada, r.conParada, turnos)
  const mttr =
    r.mttrMin == null
      ? 'MTTR — (las fallas no tienen duración).'
      : `MTTR ${formatoMinutos(r.mttrMin)} (tiempo promedio en reparar cada falla: ${formatoMinutos(r.minutosParada)} de parada ÷ ${fallas(r.conParada)}).`
  return (
    `${mttr} MTBF ${valorMtbf == null ? '—' : formatoMinutos(valorMtbf)} (tiempo promedio operando entre fallas: ` +
    `${formatoMinutos(minutosTurnos)} en ${turnos} turnos − ${formatoMinutos(MINUTOS_SIN_PRODUCCION_POR_TURNO * turnos)} sin producción − ` +
    `${formatoMinutos(r.minutosParada)} de parada = ${formatoMinutos(operando)} ÷ ${r.conParada}). Aproximado: las horas del turno, no el tiempo real de cada máquina.`
  )
}
