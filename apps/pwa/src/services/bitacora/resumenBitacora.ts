import type { EventoBitacora, TipoEvento, TurnoMantencion } from './bitacora.types'
import { minutosDesdeInicioTurno, minutosEntre } from './turnoMantencion'

/**
 * Números del turno que salen en la cabecera de la bitácora, en el correo y en
 * el PDF. Viven en UNA función para que los tres digan lo mismo (el patrón de
 * "contador que no cuenta lo que muestra" ya costó varias rondas en la app).
 */
export interface ResumenBitacora {
  eventos: number
  /** Eventos que detuvieron la máquina. */
  conParada: number
  /** Suma de minutos de parada de esos eventos. */
  minutosParada: number
  /** Tiempo medio de reparación: minutos de parada / eventos con parada. */
  mttrMin: number | null
  /** Intervenciones hechas sin detener producción (en una ventana). */
  enVentana: number
  pendientes: number
  /** Equipos distintos mencionados (sin distinguir mayúsculas ni espacios). */
  equipos: number
  /** Minutos de intervención registrados (inicio → término). */
  minutosIntervencion: number
  porTipo: Record<TipoEvento, number>
}

const normalizarEquipo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Minutos de parada de un evento: los declarados o, si faltan, su duración. */
export function minutosParadaDe(e: Pick<EventoBitacora, 'impacto' | 'minutosParada' | 'horaInicio' | 'horaTermino'>): number | null {
  if (e.impacto !== 'con-parada') return null
  if (e.minutosParada != null && Number.isFinite(e.minutosParada)) return Math.max(0, e.minutosParada)
  return minutosEntre(e.horaInicio, e.horaTermino)
}

export function resumirBitacora(eventos: readonly EventoBitacora[]): ResumenBitacora {
  const porTipo: Record<TipoEvento, number> = { falla: 0, ajuste: 0, inspeccion: 0, preventivo: 0, novedad: 0 }
  const equipos = new Set<string>()
  let conParada = 0
  let minutosParada = 0
  let enVentana = 0
  let pendientes = 0
  let minutosIntervencion = 0

  for (const e of eventos) {
    porTipo[e.tipo] = (porTipo[e.tipo] ?? 0) + 1
    if (e.equipo?.trim()) equipos.add(normalizarEquipo(e.equipo))
    if (e.pendiente) pendientes++
    if (e.impacto === 'en-ventana') enVentana++
    const parada = minutosParadaDe(e)
    if (parada != null) {
      conParada++
      minutosParada += parada
    }
    minutosIntervencion += minutosEntre(e.horaInicio, e.horaTermino) ?? 0
  }

  return {
    eventos: eventos.length,
    conParada,
    minutosParada,
    mttrMin: conParada > 0 ? minutosParada / conParada : null,
    enVentana,
    pendientes,
    equipos: equipos.size,
    minutosIntervencion,
    porTipo,
  }
}

/** Orden cronológico dentro del turno (la tarde que cruza 00:00 queda al final). */
export function ordenarEventos<T extends Pick<EventoBitacora, 'horaInicio'>>(
  turno: Pick<TurnoMantencion, 'banda'>,
  eventos: readonly T[],
): T[] {
  return [...eventos].sort(
    (a, b) => minutosDesdeInicioTurno(turno, a.horaInicio) - minutosDesdeInicioTurno(turno, b.horaInicio),
  )
}
