/**
 * ACR (Análisis de Causa Raíz) — esquema v2 de la colección `rootCauseAnalysis`.
 *
 * Reemplaza el esquema viejo de `types/index.ts` (`RootCauseAnalysis`: `metodo`,
 * `causaRaizIdentificada`), que nunca se usó: 0 documentos al 07-11-2026.
 * Cada ACR cuelga de uno o más eventos de la Bitácora (`eventoBitacoraIds`).
 *
 * Spec: SPEC_ACR.md (opción A, aprobada por Orel 07-11-2026).
 */
import type { EtiquetaFoto } from '@/services/bitacora/bitacora.types'

export type NivelCausa = 'fisica' | 'humana' | 'latente'
export type FuerzaAccion = 'debil' | 'media' | 'fuerte'
export type Categoria6M = 'maquina' | 'metodo' | 'mano_obra' | 'material' | 'medicion' | 'medio_ambiente'
export type ResultadoVerificacion = 'pendiente' | 'eficaz' | 'no_eficaz'
export type EstadoAcr = 'borrador' | 'cerrado'

export interface CausaAcr {
  id: string
  texto: string
  nivel: NivelCausa
  m6: Categoria6M | null
}

export interface AccionAcr {
  id: string
  texto: string
  fuerza: FuerzaAccion
  /** Id de la causa que ataca (null si no se eligió). */
  causaId: string | null
  responsable: string
  /** YYYY-MM-DD o null. */
  fechaLimite: string | null
  estado: 'pendiente' | 'hecha'
}

export interface EvidenciaAcr {
  path: string
  url: string
  nota: string
  /** `bitacora` = foto del evento; `acr` = foto subida desde el análisis. */
  origen: 'bitacora' | 'acr'
}

export interface Acr {
  id: string
  version: 2
  /** BITACORA_PLANTA.id */
  plantId: string
  eventoBitacoraIds: string[]
  equipo: string
  /** Fecha del turno del evento, YYYY-MM-DD. */
  fechaTurno: string
  /** Qué pasó, 1-2 frases. */
  definicion: string
  minutosDetencion: number | null
  evidencias: EvidenciaAcr[]
  piezaGuardada: boolean
  causas: CausaAcr[]
  acciones: AccionAcr[]
  verificacion: { criterio: string; dias: number; resultado: ResultadoVerificacion }
  estado: EstadoAcr
  createdBy: string
  createdByNombre: string
  createdAt: Date
  updatedAt: Date
  // R1 (SPEC_ACR_R1.md §1). Opcionales: los ACR de la opción A no los tienen.
  /** Las 3 preguntas de la tarjeta R1. */
  respuestas?: RespuestasAcr
  /** De dónde salen causas y acciones: la IA o el técnico a mano. */
  propuesta?: { origen: OrigenPropuesta; modelo: string | null }
  /** Repetición detectada al abrir el análisis (null o ausente = no se repite). */
  repeticion?: { eventoIds: string[]; resumen: string } | null
}

export interface RespuestasAcr {
  queSeRompio: string
  porQue: string
  queHacemos: string
  /** Porqués 2..5 de la cadena «¿Y por qué?» (máx. 4). Opcional: los ACR guardados no lo tienen. */
  porQues?: string[]
}

export type OrigenPropuesta = 'ia' | 'manual'

/** Lo que el ACR necesita de un evento de la Bitácora (el evento completo lo cumple). */
export interface EventoRefAcr {
  id: string
  /** Tipo del evento (`TipoEvento`): decide si aplica el análisis (R1). */
  tipo: string
  turnoId: string
  fechaTurno: string
  equipo: string
  descripcion: string
  minutosParada: number | null
  fotos: ReadonlyArray<{ url: string; path: string; etiqueta: EtiquetaFoto; thumbUrl?: string }>
}

export const ETIQUETA_NIVEL: Record<NivelCausa, string> = {
  fisica: 'Física',
  humana: 'Humana',
  latente: 'Latente',
}

export const ETIQUETA_FUERZA: Record<FuerzaAccion, string> = {
  debil: 'Débil',
  media: 'Media',
  fuerte: 'Fuerte',
}

export const ETIQUETA_6M: Record<Categoria6M, string> = {
  maquina: 'Máquina',
  metodo: 'Método',
  mano_obra: 'Mano de obra',
  material: 'Material',
  medicion: 'Medición',
  medio_ambiente: 'Medio ambiente',
}

export const ETIQUETA_RESULTADO: Record<ResultadoVerificacion, string> = {
  pendiente: 'Pendiente',
  eficaz: 'Eficaz',
  no_eficaz: 'No eficaz',
}

/** Ayuda bajo el selector de fuerza (texto del spec, sin cambios). */
export const AYUDA_FUERZA =
  'Débil: depende de la memoria (capacitar, avisar). Media: checklist o alerta. Fuerte: poka-yoke, rediseño o eliminar la tarea.'

/** Tonos de la Pill (los de `components/piel/Pill.tsx`). */
export const TONO_NIVEL = { fisica: 'info', humana: 'warning', latente: 'critical' } as const
export const TONO_FUERZA = { debil: 'critical', media: 'warning', fuerte: 'ok' } as const

/** Orden de la plantilla 6M en pantalla. */
export const ORDEN_6M: readonly Categoria6M[] = ['maquina', 'metodo', 'mano_obra', 'material', 'medicion', 'medio_ambiente']
