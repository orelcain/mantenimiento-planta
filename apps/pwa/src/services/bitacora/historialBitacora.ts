import type { EventoBitacora, TurnoMantencion } from './bitacora.types'
import { autorVisible } from './bitacora.types'
import { minutosParadaDe, resumirBitacora, type ResumenBitacora } from './resumenBitacora'
import { fechaLocal, turnoDesdeId } from './turnoMantencion'

/**
 * Historial: lo que suman los turnos ya registrados (mockup aprobado 15-09-2026).
 *
 * No hay datos nuevos que llenar: todo sale de los eventos de la bitácora. Por
 * eso cada número se calcula con las MISMAS funciones del turno
 * (`resumirBitacora`), y no con una cuenta paralela que se desincronice.
 */

export interface FilaTurno {
  turnoId: string
  turno: TurnoMantencion
  resumen: ResumenBitacora
  /** Pendientes que este turno dejó abiertos y siguen sin cerrar. */
  pendientesAbiertos: number
}

export interface EquipoDelPeriodo {
  equipo: string
  minutos: number
  paradas: number
  /** Parte del total de minutos parados del período (0-1). */
  parte: number
}

export interface ResumenPeriodo {
  desde: string
  hasta: string
  turnos: number
  eventos: number
  sinDetener: number
  /** Parte de los eventos hechos sin detener producción (0-1). */
  parteSinDetener: number
  minutosParada: number
  conParada: number
  mttrMin: number | null
  pendientesCerrados: number
  pendientesAbiertos: number
  turnosSinParada: number
  equipos: EquipoDelPeriodo[]
  porTecnico: Array<{ nombre: string; eventos: number }>
}

const normalizarEquipo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** `YYYY-MM-DD` de hace `dias` días (incluye hoy). */
export function fechaDesde(dias: number, hoy: Date = new Date()): string {
  const d = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - (dias - 1))
  return fechaLocal(d)
}

/** Un renglón por turno CON eventos, del más reciente al más antiguo. */
export function filasPorTurno(eventos: readonly EventoBitacora[]): FilaTurno[] {
  const porTurno = new Map<string, EventoBitacora[]>()
  for (const e of eventos) {
    if (!e.turnoId) continue
    porTurno.set(e.turnoId, [...(porTurno.get(e.turnoId) ?? []), e])
  }
  return [...porTurno.entries()]
    .map(([turnoId, lista]) => ({ turnoId, turno: turnoDesdeId(turnoId), lista }))
    .filter((x): x is { turnoId: string; turno: TurnoMantencion; lista: EventoBitacora[] } => Boolean(x.turno))
    .sort((a, b) => b.turno.inicio.getTime() - a.turno.inicio.getTime())
    .map(({ turnoId, turno, lista }) => ({
      turnoId,
      turno,
      resumen: resumirBitacora(lista),
      pendientesAbiertos: lista.filter((e) => e.pendiente && !e.cierre).length,
    }))
}

export function resumirPeriodo(eventos: readonly EventoBitacora[], desde: string, hasta: string): ResumenPeriodo {
  const filas = filasPorTurno(eventos)
  const total = resumirBitacora(eventos)

  const porEquipo = new Map<string, { equipo: string; minutos: number; paradas: number }>()
  for (const e of eventos) {
    const parada = minutosParadaDe(e)
    if (parada == null || !e.equipo?.trim()) continue
    const k = normalizarEquipo(e.equipo)
    const actual = porEquipo.get(k) ?? { equipo: e.equipo.trim(), minutos: 0, paradas: 0 }
    actual.minutos += parada
    actual.paradas += 1
    porEquipo.set(k, actual)
  }
  const equipos = [...porEquipo.values()]
    .sort((a, b) => b.minutos - a.minutos || b.paradas - a.paradas)
    .map((x) => ({ ...x, parte: total.minutosParada > 0 ? x.minutos / total.minutosParada : 0 }))

  const porTecnico = new Map<string, number>()
  for (const e of eventos) {
    const n = autorVisible(e).trim()
    if (n) porTecnico.set(n, (porTecnico.get(n) ?? 0) + 1)
  }

  return {
    desde,
    hasta,
    turnos: filas.length,
    eventos: total.eventos,
    sinDetener: total.enVentana,
    parteSinDetener: total.eventos > 0 ? total.enVentana / total.eventos : 0,
    minutosParada: total.minutosParada,
    conParada: total.conParada,
    mttrMin: total.mttrMin,
    pendientesCerrados: total.pendientesCerrados,
    // Lo que sigue abierto HOY de lo registrado en el período.
    pendientesAbiertos: eventos.filter((e) => e.pendiente && !e.cierre).length,
    turnosSinParada: filas.filter((f) => f.resumen.conParada === 0).length,
    equipos: equipos.slice(0, 5),
    porTecnico: [...porTecnico.entries()]
      .map(([nombre, n]) => ({ nombre, eventos: n }))
      .sort((a, b) => b.eventos - a.eventos)
      .slice(0, 6),
  }
}

/** "De 61 intervenciones, 43 se hicieron sin detener la línea." */
export function tesisDelPeriodo(r: ResumenPeriodo): string {
  if (!r.eventos) return 'Todavía no hay eventos registrados en este período.'
  if (!r.sinDetener) return `${r.eventos} ${r.eventos === 1 ? 'intervención registrada' : 'intervenciones registradas'} en el período.`
  return `De ${r.eventos} ${r.eventos === 1 ? 'intervención' : 'intervenciones'}, ${r.sinDetener} ${
    r.sinDetener === 1 ? 'se hizo' : 'se hicieron'
  } sin detener la línea.`
}

export function porcentaje(parte: number): string {
  return `${Math.round(parte * 100)}%`
}
