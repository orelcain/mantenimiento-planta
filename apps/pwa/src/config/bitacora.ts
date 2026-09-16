import type { BandaTurno, EtiquetaFoto, ImpactoEvento, TipoEvento } from '@/services/bitacora/bitacora.types'

/**
 * Configuración de la Bitácora de turno.
 *
 * La planta va acá y no escrita en el código (regla multi-planta de
 * `.ai/MEMORY.md`): cuando exista otra planta, se resuelve desde aquí.
 */
export const BITACORA_PLANTA = { id: 'chonchi', nombre: 'Planta Chonchi' } as const

export const BITACORA_COLECCION = 'bitacoraEventos'
/** Un doc por turno (`{plantId}_{turnoId}`) con la observación general. */
export const BITACORA_TURNOS_COLECCION = 'bitacoraTurnos'
/**
 * Quién tiene la bitácora abierta ahora: un doc por DISPOSITIVO y turno
 * (`{plantId}_{turnoId}_{dispositivoId}`), con un latido por minuto.
 */
export const BITACORA_PRESENCIA_COLECCION = 'bitacoraPresencia'

/** Pausa sin teclear antes de guardar el borrador solo. */
export const AUTOGUARDADO_MS = 1500
/** Cada cuánto avisa un dispositivo que sigue con la bitácora abierta. */
export const LATIDO_PRESENCIA_MS = 60_000
/** Sin latido por este tiempo, el dispositivo deja de contarse como conectado. */
export const PRESENCIA_VIGENTE_MS = 150_000

/** Hora de inicio de cada banda (horario de Mantención, ver calendario). */
export const INICIO_BANDA: Record<BandaTurno, number> = { noche: 0, dia: 8, tarde: 16 }

export const ETIQUETA_BANDA: Record<BandaTurno, string> = {
  dia: 'Turno día',
  tarde: 'Turno tarde',
  noche: 'Turno noche',
}

export const TIPOS_EVENTO: ReadonlyArray<{ id: TipoEvento; label: string }> = [
  { id: 'falla', label: 'Falla' },
  { id: 'ajuste', label: 'Ajuste' },
  { id: 'inspeccion', label: 'Inspección' },
  { id: 'preventivo', label: 'Preventivo' },
  { id: 'novedad', label: 'Novedad' },
]

export const ETIQUETA_TIPO: Record<TipoEvento, string> = Object.fromEntries(
  TIPOS_EVENTO.map((t) => [t.id, t.label]),
) as Record<TipoEvento, string>

export const IMPACTOS: ReadonlyArray<{ id: ImpactoEvento; label: string }> = [
  { id: 'no-aplica', label: 'No aplica' },
  { id: 'con-parada', label: 'Detuvo la máquina' },
  { id: 'en-ventana', label: 'Sin detener' },
]

/**
 * Momentos típicos en que Mantención interviene sin parar producción.
 * Son sugerencias: el campo acepta cualquier texto.
 */
export const VENTANAS_SUGERIDAS = [
  'Colación HG',
  'Colación empaque',
  'Cambio de turno',
  'Aseo',
  'Línea sin producción',
] as const

export const ETIQUETA_FOTO: Record<EtiquetaFoto, string> = {
  antes: 'Antes',
  despues: 'Después',
  foto: 'Foto',
}

/** Tope de fotos por evento (igual en firestore.rules). */
export const MAX_FOTOS_EVENTO = 8
