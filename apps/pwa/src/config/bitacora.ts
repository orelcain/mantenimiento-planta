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

/** En el orden de los chips del formulario; `otro` va último y abre un campo de texto. */
/**
 * El tipo responde UNA cosa: qué se hizo. Lo que pasó lo dice el impacto, y la
 * falla se deduce de los dos (ver `esFalla`).
 *
 * «Rutinario» entró porque era lo que más se hacía y no estaba: los técnicos lo
 * escribieron a mano 3 veces en 4 turnos (lubricación del Knuro, retiro de
 * cintas para higiene, desmonte y montaje), mientras que «Planificado» y
 * «Ajuste» no los usó nadie (18-09-2026). Cubre también el montaje y desmontaje
 * de cintas: son la misma naturaleza de trabajo, y dos chips sinónimos hacen
 * dudar en vez de ayudar.
 */
export const TIPOS_EVENTO: ReadonlyArray<{ id: TipoEvento; label: string }> = [
  { id: 'correctivo', label: 'Correctivo' },
  { id: 'rutinario', label: 'Rutinario' },
  { id: 'preventivo', label: 'Preventivo' },
  { id: 'inspeccion', label: 'Inspección' },
  { id: 'ajuste', label: 'Ajuste' },
  { id: 'novedad', label: 'Novedad' },
  { id: 'otro', label: 'Otro' },
]

/**
 * Tipos que ya NO se ofrecen pero siguen guardados en eventos viejos: su
 * etiqueta tiene que existir o el histórico queda sin nombre.
 */
const TIPOS_LEGADO: ReadonlyArray<{ id: TipoEvento; label: string }> = [
  { id: 'falla', label: 'Falla' },
  { id: 'planificado', label: 'Planificado' },
  // Duró unas horas: el montaje y desmontaje de cintas para higiene ES trabajo
  // rutinario, y tener las dos opciones lado a lado obligaba a elegir entre
  // sinónimos — justo el problema que esta ronda vino a sacar (Orel, 18-09).
  { id: 'montaje', label: 'Montaje/desmontaje' },
]

/** Largo máximo del tipo escrito a mano (igual en firestore.rules). */
export const MAX_TIPO_OTRO = 40
/** Largo máximo del título del evento (igual en firestore.rules). */
export const MAX_TITULO_EVENTO = 120
/** Repuestos distintos por evento (igual en firestore.rules). */
export const MAX_REPUESTOS_EVENTO = 20
/** Cantidad máxima de un mismo repuesto en un evento. */
export const MAX_CANTIDAD_REPUESTO = 999

export const ETIQUETA_TIPO: Record<TipoEvento, string> = Object.fromEntries(
  [...TIPOS_EVENTO, ...TIPOS_LEGADO].map((t) => [t.id, t.label]),
) as Record<TipoEvento, string>

/**
 * Las cuatro respuestas a «¿Cómo afectó al proceso?», de mayor a menor costo.
 * El `detalle` va bajo la etiqueta: con tres chips sin explicación, todos
 * terminaban en «No aplica» (medido sobre 4 turnos reales, 18-09-2026).
 */
export const IMPACTOS: ReadonlyArray<{ id: ImpactoEvento; label: string; detalle: string }> = [
  { id: 'con-parada', label: 'Detuvo la máquina', detalle: 'Hubo que parar para intervenir' },
  { id: 'afecta-sin-detener', label: 'Afectó sin detener', detalle: 'Siguió produciendo, pero con contingencia' },
  { id: 'en-ventana', label: 'Sin costo, en una ventana', detalle: 'Colación, cambio de turno' },
  { id: 'no-aplica', label: 'Fuera del proceso', detalle: 'Casino, portería, patio' },
]

/**
 * Atajos de contingencia; el campo acepta cualquier texto. CORTOS a propósito:
 * con la frase entera cada chip ocupaba una fila a 375 px y el bloque crecía
 * 130 px. El ejemplo largo ya va en el placeholder del campo.
 */
export const CONTINGENCIAS_SUGERIDAS = [
  'Cabezas a mano',
  'Media velocidad',
  'Una sola línea',
  'Manual mientras tanto',
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
