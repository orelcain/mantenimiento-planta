import type { Timestamp } from 'firebase/firestore'

/**
 * Bitácora de turno de Mantención.
 *
 * Un EVENTO es lo que pasó durante el turno (una falla, un ajuste, una ronda,
 * una novedad), con texto, fotos antes/después y —cuando corresponde— cuánto
 * detuvo la máquina o en qué ventana se intervino sin detener producción.
 *
 * Esa última distinción es la que convierte la bitácora en evidencia del aporte
 * de Mantención: "35 min de parada" se mide como MTTR, y "intervenido durante
 * colación HG" es producción que NO se perdió gracias a elegir el momento.
 */

/** Banda del turno de Mantención: día 08-16, tarde 16-00, noche 00-08. */
export type BandaTurno = 'dia' | 'tarde' | 'noche'

export interface TurnoMantencion {
  /** `YYYY-MM-DD_banda`. La fecha es el día en que ARRANCA el turno. */
  id: string
  fecha: string
  banda: BandaTurno
  inicio: Date
  fin: Date
}

export interface CierrePendiente {
  tipo: 'resuelto' | 'no-aplica'
  /** Turno en que se cerró. */
  turnoId: string
  porNombre: string
  /** Evento que lo resolvió (solo `resuelto`). */
  eventoId?: string | null
  /** Motivo (solo `no-aplica`). */
  motivo?: string | null
  en?: Timestamp | null
}

/** Copia mínima del pendiente original, para mostrarlo sin volver a leerlo. */
export interface OrigenPendiente {
  id: string
  turnoId: string
  equipo: string
  descripcion: string
  registradoPor: string
}

export type TipoEvento ='falla' | 'ajuste' | 'inspeccion' | 'preventivo' | 'novedad'

/**
 * Qué le costó el evento a producción.
 * - `con-parada`: la máquina estuvo detenida `minutosParada` minutos.
 * - `en-ventana`: se intervino sin detener producción, aprovechando `ventana`
 *   (colación, cambio de turno, aseo…).
 * - `no-aplica`: rondas, novedades, lo que no toca producción.
 */
export type ImpactoEvento = 'no-aplica' | 'con-parada' | 'en-ventana'

export type EtiquetaFoto = 'antes' | 'despues' | 'foto'

export interface FotoEvento {
  url: string
  /** Ruta en Storage, para poder borrarla. */
  path: string
  etiqueta: EtiquetaFoto
  /** Dimensiones reales: el correo y el PDF las necesitan para no deformar. */
  ancho?: number
  alto?: number
}

export interface EventoBitacora {
  id: string
  plantId: string
  turnoId: string
  fechaTurno: string
  banda: BandaTurno
  tipo: TipoEvento
  /** Equipo o área, texto libre ("BAADER 142", "Sala de bombas NH₃"). */
  equipo: string
  descripcion: string
  /** `HH:mm`. */
  horaInicio: string
  /** `HH:mm`, o null si sigue en curso. */
  horaTermino: string | null
  impacto: ImpactoEvento
  minutosParada: number | null
  ventana: string | null
  /** Queda para el turno siguiente: sale destacado en el correo. */
  pendiente: boolean
  fotos: FotoEvento[]
  creadoPor: string
  /** Nombre de la CUENTA con que se escribió (a menudo la compartida de Mantención). */
  autorNombre: string
  /**
   * Técnico que registró el evento, elegido de la lista del calendario. Es el
   * nombre que se muestra: con la cuenta compartida, `autorNombre` no dice quién fue.
   */
  registradoPor?: string | null
  /** Otros técnicos que trabajaron en el evento (además de quien registra). */
  participantes?: string[]
  /** Nodo de `hierarchy` si el equipo se eligió del buscador (null = texto libre). */
  equipoId?: string | null
  /**
   * En un PENDIENTE: cómo y dónde se cerró. `resuelto` = otro evento lo resolvió
   * (cuenta como cerrado por Mantención); `no-aplica` = se descartó con motivo.
   */
  cierre?: CierrePendiente | null
  /** En el evento que RESUELVE un pendiente de un turno anterior: de cuál. */
  resuelvePendiente?: OrigenPendiente | null
  actualizadoPorNombre?: string
  createdAt?: Timestamp | null
  updatedAt?: Timestamp | null
}

/** Lo que el formulario entrega para crear o editar un evento. */
export type EventoBitacoraDatos = Pick<
  EventoBitacora,
  | 'tipo'
  | 'equipo'
  | 'descripcion'
  | 'horaInicio'
  | 'horaTermino'
  | 'impacto'
  | 'minutosParada'
  | 'ventana'
  | 'pendiente'
  | 'fotos'
> & {
  participantes: string[]
  equipoId: string | null
  /** Al editar: las fotos que tenía el evento al abrirlo (para guardar solo los cambios). */
  fotosAntes?: FotoEvento[]
  /** Solo al crear desde «Resolver»: el pendiente que este evento cierra. */
  resuelvePendiente?: OrigenPendiente | null
  /** Al crear: quién registra. Al editar: quién edita (queda en actualizadoPorNombre). */
  quien: string
}

/** Nombre a mostrar como autor de un evento. */
export function autorVisible(e: Pick<EventoBitacora, 'registradoPor' | 'autorNombre'>): string {
  return e.registradoPor?.trim() || e.autorNombre
}

/** Todos los técnicos del evento: quien registra primero y luego los que participaron, sin repetir. */
export function tecnicosDelEvento(e: Pick<EventoBitacora, 'registradoPor' | 'autorNombre' | 'participantes'>): string[] {
  const vistos = new Set<string>()
  return [autorVisible(e), ...(e.participantes ?? [])]
    .map((n) => n?.trim())
    .filter((n): n is string => {
      if (!n) return false
      const k = n.toLowerCase()
      if (vistos.has(k)) return false
      vistos.add(k)
      return true
    })
}
