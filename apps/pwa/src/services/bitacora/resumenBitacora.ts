import type { EventoBitacora, TurnoMantencion } from './bitacora.types'
import { minutosEntre } from './turnoMantencion'
import { soloListos } from './borradores'
import { claveTipo, minutosEnTurno } from './presentacionEvento'

/**
 * Números del turno que salen en la cabecera de la bitácora, en el correo y en
 * el PDF. Viven en UNA función para que los tres digan lo mismo (el patrón de
 * "contador que no cuenta lo que muestra" ya costó varias rondas en la app).
 */
export interface ResumenBitacora {
  eventos: number
  /** Eventos que detuvieron la máquina (incluye los que aún no tienen duración). */
  conParada: number
  /** Paradas sin término ni minutos: se cuentan, pero no suman minutos ni entran al MTTR. */
  paradasSinDuracion: number
  /** Suma de minutos de parada de esos eventos. */
  minutosParada: number
  /** Tiempo medio de reparación: minutos de parada / eventos con parada. */
  mttrMin: number | null
  /** Intervenciones hechas sin detener producción (en una ventana). */
  enVentana: number
  /** Pendientes de este turno que siguen abiertos HOY. */
  pendientes: number
  /**
   * Pendientes con los que CERRÓ este turno, incluidos los que un turno
   * posterior ya resolvió. Es el número que salió en el correo de ese turno: sin
   * él, reexportar una bitácora vieja mostraba 0 pendientes y dejaba de coincidir
   * con lo que se envió (revisión 15-09).
   */
  pendientesDelTurno: number
  /** De esos, los que otro turno ya cerró. */
  pendientesResueltosDespues: number
  /** Pendientes de turnos anteriores que este turno resolvió (entrega de turno). */
  pendientesCerrados: number
  /** Equipos distintos mencionados (sin distinguir mayúsculas ni espacios). */
  equipos: number
  /** Minutos de intervención registrados (inicio → término). */
  minutosIntervencion: number
  /** Por tipo: el id del tipo fijo (`falla`) o `otro:<tipo propio normalizado>`. */
  porTipo: Record<string, number>
}

const normalizarEquipo = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')

/** Minutos de parada de un evento: los declarados o, si faltan, su duración. */
export function minutosParadaDe(e: Pick<EventoBitacora, 'impacto' | 'minutosParada' | 'horaInicio' | 'horaTermino'>): number | null {
  if (e.impacto !== 'con-parada') return null
  if (e.minutosParada != null && Number.isFinite(e.minutosParada)) return Math.max(0, e.minutosParada)
  return minutosEntre(e.horaInicio, e.horaTermino)
}

/**
 * ¿Este evento quedó pendiente al cerrar su turno? Un evento con `cierre`
 * necesariamente estuvo pendiente: lo cerró otro turno después.
 */
export function fuePendiente(e: Pick<EventoBitacora, 'pendiente' | 'cierre'>): boolean {
  return Boolean(e.pendiente || e.cierre)
}

/**
 * Los eventos PUBLICADOS en dos grupos, cada uno en orden del turno: lo hecho y
 * lo que queda pendiente para el turno siguiente. Es el orden y la numeración
 * de WhatsApp, correo, PDF y la pantalla: «el evento 3» es el mismo en todos.
 */
export function gruposDelTurno<T extends EventoBitacora>(
  turno: Pick<TurnoMantencion, 'banda'> & { inicio?: Date },
  eventos: readonly T[],
): { hechos: T[]; pendientes: T[] } {
  const ordenados = ordenarEventos(turno, soloListos(eventos))
  return { hechos: ordenados.filter((e) => !fuePendiente(e)), pendientes: ordenados.filter(fuePendiente) }
}

export function resumirBitacora(todos: readonly EventoBitacora[]): ResumenBitacora {
  // Un borrador se ve en la lista, pero no es un hecho del turno todavía.
  const eventos = soloListos(todos)
  const porTipo: Record<string, number> = {}
  const equipos = new Set<string>()
  let conParada = 0
  let paradasSinDuracion = 0
  let minutosParada = 0
  let enVentana = 0
  let pendientes = 0
  let pendientesResueltosDespues = 0
  // Por ID: si dos teléfonos resolvieron el MISMO pendiente casi a la vez, son
  // dos eventos pero UN pendiente cerrado (revisión 15-09).
  const cerrados = new Set<string>()
  let minutosIntervencion = 0

  for (const e of eventos) {
    const tipo = claveTipo(e)
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1
    if (e.equipo?.trim()) equipos.add(normalizarEquipo(e.equipo))
    if (e.pendiente) pendientes++
    else if (e.cierre) pendientesResueltosDespues++
    if (e.resuelvePendiente?.id) cerrados.add(e.resuelvePendiente.id)
    if (e.impacto === 'en-ventana') enVentana++
    if (e.impacto === 'con-parada') {
      conParada++
      const parada = minutosParadaDe(e)
      // Una parada aún abierta (sin término ni minutos) no desaparece del
      // resumen: cuenta como parada y se avisa aparte que le falta la duración.
      if (parada == null) paradasSinDuracion++
      else minutosParada += parada
    }
    minutosIntervencion += minutosEntre(e.horaInicio, e.horaTermino) ?? 0
  }

  return {
    eventos: eventos.length,
    conParada,
    paradasSinDuracion,
    minutosParada,
    mttrMin: conParada - paradasSinDuracion > 0 ? minutosParada / (conParada - paradasSinDuracion) : null,
    enVentana,
    pendientes,
    pendientesDelTurno: pendientes + pendientesResueltosDespues,
    pendientesResueltosDespues,
    pendientesCerrados: cerrados.size,
    equipos: equipos.size,
    minutosIntervencion,
    porTipo,
  }
}

/**
 * Orden cronológico dentro del turno (la tarde que cruza 00:00 queda al final).
 * Los eventos sin hora se ubican según cuándo se registraron.
 */
export function ordenarEventos<T extends Pick<EventoBitacora, 'horaInicio'> & { createdAt?: unknown; posicionMin?: number | null }>(
  turno: Pick<TurnoMantencion, 'banda'> & { inicio?: Date },
  eventos: readonly T[],
): T[] {
  return [...eventos].sort((a, b) => minutosEnTurno(turno, a) - minutosEnTurno(turno, b))
}
