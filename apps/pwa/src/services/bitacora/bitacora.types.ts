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

export type TipoEvento = 'falla' | 'ajuste' | 'inspeccion' | 'preventivo' | 'novedad'

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
  autorNombre: string
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
>
