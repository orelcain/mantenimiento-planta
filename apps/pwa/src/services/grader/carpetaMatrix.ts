/**
 * Carpeta de Matrix — lógica PURA de la carga automática del Excel del grader.
 *
 * Sin DOM, sin IndexedDB, sin Firestore. Cada regla de la carga automática es
 * una función pura con su prueba en __tests__/carpetaMatrix.test.ts. La
 * persistencia vive en `carpetaMatrixStore.ts` y la revisión en `carpetaMatrixCarga.ts`.
 */
import type { MatrixFileKind } from './types'

/** Solo se consideran archivos modificados en las últimas 48 h. */
export const CM_VENTANA_MS = 48 * 3_600_000
/** Un archivo que cambió hace menos de esto puede seguir escribiéndose: se espera. */
export const CM_ESTABLE_MS = 30_000
/** Un Pieza a pieza más viejo que esto no cuenta como «al día». */
export const CM_DATO_VIEJO_MS = 3 * 86_400_000
/** Matrix corta el informe en exactamente 10.000 registros cuando el límite está marcado. */
export const CM_REGISTROS_CORTE = 10_000
/** Cada cuánto revisa el vigilante mientras la pestaña está abierta. */
export const CM_INTERVALO_MS = 5 * 60_000
/** Cuántos archivos ya procesados se recuerdan (los más viejos se olvidan). */
export const CM_MAX_PROCESADOS = 500
/** Intentos por archivo antes de darlo por fallido (no se reintenta más). */
export const CM_MAX_INTENTOS = 3

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

/**
 * Regla 2. Total de registros del Pieza a pieza: piezas + «No aplicable» + lo que
 * el parser separa en gate0. Es el número que Matrix cuenta en su límite.
 */
export function contarRegistrosPiezaAPieza(p: {
  pieceRecords?: readonly unknown[]
  notApplicableRecords?: readonly unknown[]
  gate0Records?: readonly unknown[]
}): number {
  return (p.pieceRecords?.length ?? 0) + (p.notApplicableRecords?.length ?? 0) + (p.gate0Records?.length ?? 0)
}

/** Un Pieza a pieza con exactamente 10.000 registros viene cortado por Matrix. */
export function esExporteCortado(tipo: MatrixFileKind, totalRegistros: number): boolean {
  return tipo === 'PIEZA_PIEZA' && totalRegistros === CM_REGISTROS_CORTE
}

/** Regla 3. Sin registros o sin segmentos no hay nada que guardar: nunca es «cargado». */
export function esSinDatos(totalRegistros: number, segmentos: number): boolean {
  return totalRegistros === 0 || segmentos === 0
}

/** Regla 4. Si el tamaño o la fecha cambiaron entre el listado y la lectura, el archivo se está escribiendo. */
export function archivoEstable(
  listado: { tamano: number; modificado: number },
  leido: { size: number; lastModified: number },
): boolean {
  return listado.tamano === leido.size && listado.modificado === leido.lastModified
}

/** Regla 1. El segmento nuevo NO se escribe si Matrix ya tiene MÁS piezas guardadas para ese turno. */
export function debeOmitirPorDatosMasCompletos(piezasExistentes: number | null, piezasNuevas: number): boolean {
  return piezasExistentes !== null && piezasExistentes > piezasNuevas
}

/** Regla 5. Solo se marca «procesado» si todo el guardado salió bien. */
export function decidirMarcado(fallos: readonly string[]): boolean {
  return fallos.length === 0
}

/** Regla 6. Cuenta un intento fallido; al llegar al máximo el archivo queda como fallido. */
export function decidirReintento(intentosPrevios: number): { intentos: number; fallido: boolean } {
  const intentos = intentosPrevios + 1
  return { intentos, fallido: intentos >= CM_MAX_INTENTOS }
}

/** Regla 7. Listado con más entradas que el tope o con elementos no leídos: no se puede decir «al día». */
export function listadoIncompleto(truncado: boolean, elementosNoLeidos: number): boolean {
  return truncado || elementosNoLeidos > 0
}

/** Regla 9. El cortado se limpia solo con un Pieza a pieza completo más nuevo que el cortado. */
export function debeLimpiarCortado(cortado: { modificado: number } | null, cargadoModificado: number): boolean {
  return cortado !== null && cargadoModificado > cortado.modificado
}

/**
 * Regla 10. «Al día» solo con un Pieza a pieza procesado de los últimos 3 días
 * y sin ningún Pieza a pieza nuevo que haya quedado fuera de la ventana sin procesar.
 */
export function calcularAlDia(p: {
  ultimoPiezaProcesado: number | null
  piezaPendienteFueraVentana: boolean
  ahora: number
}): boolean {
  return (
    p.ultimoPiezaProcesado !== null &&
    p.ahora - p.ultimoPiezaProcesado <= CM_DATO_VIEJO_MS &&
    !p.piezaPendienteFueraVentana
  )
}

/** Regla 11. Candado en memoria: una sola revisión a la vez dentro de la pestaña. */
export function crearCandado(): { tomar(): boolean; soltar(): void } {
  let ocupado = false
  return {
    tomar() {
      if (ocupado) return false
      ocupado = true
      return true
    },
    soltar() {
      ocupado = false
    },
  }
}

export type UltimoResultado =
  | {
      tipo: 'cargado'
      archivo: string
      tamano: number
      /** epoch ms de la última modificación del archivo cargado. */
      modificado: number
      piezas: number
      desde: number | null
      hasta: number | null
      /** `${fecha}__${turno}` del turno a abrir (o null si son varios). */
      turnoDocId: string | null
      cargadoEn: number
    }
  | { tipo: 'omitido'; archivo: string; detectadoEn: number }
  | { tipo: 'fallo'; archivo: string; mensaje: string; detectadoEn: number }

export interface CortadoInfo {
  archivo: string
  registros: number
  /** epoch ms: el cortado se limpia con un Pieza a pieza completo más nuevo que esto. */
  modificado: number
  detectadoEn: number
}

export type EstadoCarpeta =
  | 'sin-autorizar'
  | 'vigilando'
  | 'permiso'
  | 'cargado'
  | 'cortado'
  | 'viejo'
  | 'demasiados'
  | 'error'

export interface HechosCarpeta {
  /** Hay un handle de carpeta guardado (el usuario la eligió). */
  autorizada: boolean
  /** El navegador confirma permiso de lectura ahora mismo. */
  permisoConcedido: boolean
  ultimo: UltimoResultado | null
  cortado: CortadoInfo | null
  /** Listado incompleto (ver `listadoIncompleto`). */
  demasiados: boolean
  /** Ver `calcularAlDia`. */
  alDia: boolean
  /** Hubo un error de lectura o guardado en la última revisión. */
  errorReciente: boolean
}

/**
 * Precedencia: sin autorizar > permiso > error > cortado > demasiados > viejo
 * (no está al día) > cargado > vigilando.
 */
export function derivarEstado(h: HechosCarpeta): EstadoCarpeta {
  if (!h.autorizada) return 'sin-autorizar'
  if (!h.permisoConcedido) return 'permiso'
  if (h.errorReciente || h.ultimo?.tipo === 'fallo') return 'error'
  if (h.cortado !== null) return 'cortado'
  if (h.demasiados) return 'demasiados'
  if (!h.alDia) return 'viejo'
  if (h.ultimo?.tipo === 'cargado') return 'cargado'
  return 'vigilando'
}

/** Recorta la lista de procesados a los últimos `max` (los más recientes van al final). */
export function recortarProcesados(claves: readonly string[], max: number = CM_MAX_PROCESADOS): string[] {
  return claves.length <= max ? [...claves] : claves.slice(claves.length - max)
}
