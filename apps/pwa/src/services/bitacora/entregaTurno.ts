import type { EventoBitacora, OrigenPendiente, TurnoMantencion } from './bitacora.types'
import { autorVisible } from './bitacora.types'
import { etiquetaTurno, turnoDesdeId } from './turnoMantencion'

/**
 * Entrega de turno: los pendientes que no se cerraron pasan solos al turno
 * siguiente (mockup aprobado por Orel, 15-09-2026).
 *
 * El evento original NO se copia ni se mueve: queda en su turno y se marca
 * cerrado cuando otro turno lo resuelve. Así los números de cada turno no cambian.
 */

/** "Turno tarde 15-09". */
export function etiquetaCortaTurno(turnoId: string): string {
  const t = turnoDesdeId(turnoId)
  if (!t) return turnoId
  const [, mes, dia] = t.fecha.split('-')
  return `${etiquetaTurno(t)} ${dia}-${mes}`
}

/** Cuántos turnos (bloques de 8 h) hay entre el turno de origen y el actual. */
export function turnosEntre(origenId: string, actual: Pick<TurnoMantencion, 'inicio'>): number {
  const o = turnoDesdeId(origenId)
  if (!o) return 0
  return Math.max(0, Math.round((actual.inicio.getTime() - o.inicio.getTime()) / (8 * 3600 * 1000)))
}

/**
 * Pendientes ABIERTOS de turnos ANTERIORES al turno dado (ni del mismo ni de
 * turnos futuros), del más reciente al más antiguo.
 */
export function pendientesAnteriores(eventos: readonly EventoBitacora[], turno: Pick<TurnoMantencion, 'id' | 'inicio'>): EventoBitacora[] {
  return eventos
    .filter((e) => e.pendiente && !e.cierre && e.turnoId !== turno.id)
    .map((e) => ({ e, t: turnoDesdeId(e.turnoId) }))
    .filter((x): x is { e: EventoBitacora; t: TurnoMantencion } => Boolean(x.t) && x.t!.inicio < turno.inicio)
    .sort((a, b) => b.t.inicio.getTime() - a.t.inicio.getTime() || b.e.horaInicio.localeCompare(a.e.horaInicio))
    .map((x) => x.e)
}

/** "Turno tarde 15-09 · 22:30 · Matias Serpa · hace 2 turnos". */
export function origenDePendiente(e: EventoBitacora, actual: Pick<TurnoMantencion, 'inicio'>): string {
  const hace = turnosEntre(e.turnoId, actual)
  return [etiquetaCortaTurno(e.turnoId), e.horaInicio, autorVisible(e), hace >= 2 ? `hace ${hace} turnos` : '']
    .filter(Boolean)
    .join(' · ')
}

export function copiaDeOrigen(e: EventoBitacora): OrigenPendiente {
  return {
    id: e.id,
    turnoId: e.turnoId,
    equipo: e.equipo ?? '',
    descripcion: (e.descripcion ?? '').slice(0, 500),
    registradoPor: autorVisible(e),
  }
}
