/**
 * Carpeta de Matrix — lógica PURA de la carga automática del Excel del grader.
 *
 * Sin DOM, sin IndexedDB, sin Firestore: decide qué archivos de la carpeta se
 * procesan, cuándo un Pieza a pieza está cortado en 10.000 registros y qué estado
 * muestra la línea de Análisis de turno. La persistencia vive en
 * `carpetaMatrixStore.ts` y el recorrido/guardado en `carpetaMatrixCarga.ts`.
 */
import type { MatrixFileKind } from './types'

/** Solo se consideran archivos modificados en las últimas 48 h. */
export const CM_VENTANA_MS = 48 * 3_600_000
/** Un archivo que cambió hace menos de esto puede seguir escribiéndose: se espera. */
export const CM_ESTABLE_MS = 30_000
/** Un Pieza a pieza más viejo que esto es «dato viejo». */
export const CM_DATO_VIEJO_MS = 3 * 86_400_000
/** Matrix corta el informe en exactamente 10.000 registros cuando el límite está marcado. */
export const CM_REGISTROS_CORTE = 10_000
/** Cada cuánto revisa el vigilante mientras la pestaña está abierta. */
export const CM_INTERVALO_MS = 5 * 60_000
/** Cuántos archivos ya procesados se recuerdan (los más viejos se olvidan). */
export const CM_MAX_PROCESADOS = 500

export interface CandidatoCarpeta {
  /** Ruta relativa a la carpeta elegida, con "/". */
  ruta: string
  tamano: number
  /** epoch ms. */
  modificado: number
}

/** Clave estable para «ya procesado»: ruta + tamaño + fecha. Cambiar el archivo la cambia. */
export function claveArchivo(c: CandidatoCarpeta): string {
  return `${c.ruta}|${c.tamano}|${c.modificado}`
}

/** Mismo criterio que el parser: el nombre con «pieza» o «piece» es Pieza a pieza. */
export function esNombrePiezaAPieza(nombre: string): boolean {
  return /pieza|piece/i.test(nombre)
}

/**
 * Qué archivos procesar: en la ventana de 48 h, estables (modificados hace más de
 * 30 s) y no procesados antes. Más nuevo primero. No muta la entrada.
 */
export function seleccionarCandidatos(
  entradas: readonly CandidatoCarpeta[],
  ahora: number,
  procesados: ReadonlySet<string>,
): CandidatoCarpeta[] {
  return entradas
    .filter(
      (c) =>
        c.modificado >= ahora - CM_VENTANA_MS &&
        ahora - c.modificado > CM_ESTABLE_MS &&
        !procesados.has(claveArchivo(c)),
    )
    .sort((a, b) => b.modificado - a.modificado || a.ruta.localeCompare(b.ruta))
}

/** Un Pieza a pieza con exactamente 10.000 registros viene cortado por Matrix. */
export function esExporteCortado(tipo: MatrixFileKind, registros: number): boolean {
  return tipo === 'PIEZA_PIEZA' && registros === CM_REGISTROS_CORTE
}

/** El Pieza a pieza más nuevo de la carpeta tiene más de 3 días (o no hay ninguno). */
export function esDatoViejo(ultimoPiezaAPieza: number | null, ahora: number): boolean {
  return ultimoPiezaAPieza !== null && ahora - ultimoPiezaAPieza > CM_DATO_VIEJO_MS
}

export type EstadoCarpeta =
  | 'sin-autorizar'
  | 'vigilando'
  | 'permiso'
  | 'cargado'
  | 'cortado'
  | 'viejo'
  | 'error'

export type UltimoResultado =
  | { tipo: 'cargado'; archivo: string; piezas: number; desde: number | null; hasta: number | null; cargadoEn: number }
  | { tipo: 'cortado'; archivo: string; registros: number; detectadoEn: number }

export interface HechosCarpeta {
  /** Hay un handle de carpeta guardado (el usuario la eligió). */
  autorizada: boolean
  /** El navegador confirma permiso de lectura ahora mismo. */
  permisoConcedido: boolean
  ultimoResultado: UltimoResultado | null
  /** epoch ms del Pieza a pieza más nuevo que hay en la carpeta, o null. */
  ultimoPiezaAPieza: number | null
  /** Hubo un error de lectura o guardado en la última revisión. */
  errorReciente: boolean
  ahora: number
}

/**
 * Prioridad: sin autorizar > permiso > cortado > error > viejo > cargado > vigilando.
 * El cortado manda sobre el dato viejo: decir «falta el completo» es lo que hay que hacer.
 */
export function derivarEstado(h: HechosCarpeta): EstadoCarpeta {
  if (!h.autorizada) return 'sin-autorizar'
  if (!h.permisoConcedido) return 'permiso'
  if (h.ultimoResultado?.tipo === 'cortado') return 'cortado'
  if (h.errorReciente) return 'error'
  if (esDatoViejo(h.ultimoPiezaAPieza, h.ahora)) return 'viejo'
  if (h.ultimoResultado?.tipo === 'cargado') return 'cargado'
  return 'vigilando'
}

/** Recorta la lista de procesados a los últimos `max` (los más recientes van al final). */
export function recortarProcesados(claves: readonly string[], max: number = CM_MAX_PROCESADOS): string[] {
  return claves.length <= max ? [...claves] : claves.slice(claves.length - max)
}
