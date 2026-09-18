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
  /** Eventos que fueron una falla (ver `esFalla`): correctivo que afectó al proceso. */
  fallas: number
  /** De esas fallas, cuántas detuvieron la máquina (las demás la afectaron sin detenerla). */
  fallasConParada: number
  /** Fallas que detuvieron la máquina pero todavía no tienen duración. */
  fallasSinDuracion: number
  /** Minutos de parada que corresponden a fallas (no a paradas programadas). */
  minutosFalla: number
  /** Tiempo medio de reparación: minutos de parada por falla / fallas con duración. */
  mttrMin: number | null
  /** Intervenciones hechas sin detener producción (en una ventana). */
  enVentana: number
  /**
   * Eventos que afectaron al proceso SIN detener la máquina (la tolva de riles
   * que deja de llevarse las cabezas, y alguien las retira a mano). No suman
   * minutos de parada a propósito: son la evidencia de que el proceso siguió
   * gracias a Mantención, y el MTTR tiene que seguir cuadrando con Shoplogix.
   */
  afectados: number
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
/**
 * ¿Este evento fue una FALLA? No se pregunta: se deduce de lo que el técnico ya
 * contestó (decisión de Orel, 18-09-2026).
 *
 *   correctivo + (detuvo la máquina o la afectó) = falla → cuenta para MTTR/MTBF
 *   preventivo que detuvo la máquina             = parada PROGRAMADA, no falla
 *
 * Antes «falla» era un tipo más de la lista y competía con «correctivo»: había
 * que elegir uno y se perdía el otro. Los eventos viejos que lo tienen guardado
 * siguen contando como falla si afectaron al proceso.
 */
export function esFalla(e: Pick<EventoBitacora, 'tipo' | 'impacto'>): boolean {
  const afecto = e.impacto === 'con-parada' || e.impacto === 'afecta-sin-detener'
  return afecto && (e.tipo === 'correctivo' || e.tipo === 'falla')
}

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
  let afectados = 0
  let fallas = 0
  let fallasConParada = 0
  let fallasSinDuracion = 0
  let minutosFalla = 0
  let minutosIntervencion = 0

  for (const e of eventos) {
    const tipo = claveTipo(e)
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1
    if (e.equipo?.trim()) equipos.add(normalizarEquipo(e.equipo))
    if (e.pendiente) pendientes++
    else if (e.cierre) pendientesResueltosDespues++
    if (e.resuelvePendiente?.id) cerrados.add(e.resuelvePendiente.id)
    if (e.impacto === 'en-ventana') enVentana++
    // Afectó sin detener: NO suma minutos de parada (el MTTR tiene que seguir
    // cuadrando con Shoplogix), pero se cuenta — es la evidencia de que el
    // proceso siguió gracias a Mantención (criterio de Orel, 18-09-2026).
    if (e.impacto === 'afecta-sin-detener') afectados++
    if (esFalla(e)) {
      fallas++
      // Solo las fallas alimentan MTTR/MTBF: una parada programada para un
      // preventivo no es una falla, aunque la máquina haya estado detenida.
      if (e.impacto === 'con-parada') {
        fallasConParada++
        const m = minutosParadaDe(e)
        if (m == null) fallasSinDuracion++
        else minutosFalla += m
      }
    }
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
    fallas,
    fallasConParada,
    fallasSinDuracion,
    minutosFalla,
    // MTTR = tiempo promedio en reparar una falla QUE DETUVO. Antes dividía
    // todos los minutos de parada entre todas las paradas, programadas
    // incluidas; y una falla que no detuvo no aporta minutos, así que tampoco
    // puede estar en el divisor.
    mttrMin: fallasConParada - fallasSinDuracion > 0 ? minutosFalla / (fallasConParada - fallasSinDuracion) : null,
    enVentana,
    afectados,
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
