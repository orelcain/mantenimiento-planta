/**
 * Carpeta de Matrix — persistencia en IndexedDB (base propia, no toca la cola
 * de subida offline). Guarda tres cosas: el handle de la carpeta elegida (es
 * clonable), las claves de los archivos ya procesados y el último resultado
 * (para que el estado «cortado» o «cargado» sobreviva a recargar la página).
 */
import type { CarpetaHandle } from './diagnosticoMatrix'
import {
  CM_MAX_PROCESADOS,
  recortarProcesados,
  recortarResultados,
  type CortadoInfo,
  type ResultadoArchivo,
  type UltimoOtro,
  type UltimoResultado,
} from './carpetaMatrix'

const DB_NOMBRE = 'carpeta-matrix-grader'
const TIENDA = 'kv'

type Clave = 'handle' | 'procesados' | 'ultimo' | 'cortado' | 'intentos' | 'resultados' | 'ultimoOtro' | 'generacion'

/** Handle de la File System Access API con los métodos de permiso que usamos. */
export interface HandleCarpeta extends CarpetaHandle {
  queryPermission(opts: { mode: 'read' }): Promise<PermisoEstado>
  requestPermission(opts: { mode: 'read' }): Promise<PermisoEstado>
}
export type PermisoEstado = 'granted' | 'denied' | 'prompt'

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NOMBRE, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(TIENDA)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error ?? new Error('No se pudo abrir IndexedDB'))
  })
}

async function leer<T>(clave: Clave): Promise<T | undefined> {
  const db = await abrirDb()
  return new Promise<T | undefined>((resolve, reject) => {
    const req = db.transaction(TIENDA, 'readonly').objectStore(TIENDA).get(clave)
    req.onsuccess = () => {
      db.close()
      resolve(req.result as T | undefined)
    }
    req.onerror = () => {
      db.close()
      reject(req.error ?? new Error('Error al leer IndexedDB'))
    }
  })
}

async function escribir(clave: Clave, valor: unknown): Promise<void> {
  const db = await abrirDb()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(TIENDA, 'readwrite')
    const almacen = tx.objectStore(TIENDA)
    if (valor === undefined) almacen.delete(clave)
    else almacen.put(valor, clave)
    tx.oncomplete = () => {
      db.close()
      resolve()
    }
    tx.onerror = () => {
      db.close()
      reject(tx.error ?? new Error('Error al escribir IndexedDB'))
    }
  })
}

export const carpetaMatrixStore = {
  leerHandle: () => leer<HandleCarpeta>('handle'),
  guardarHandle: (handle: HandleCarpeta) => escribir('handle', handle),
  borrarHandle: () => escribir('handle', undefined),

  leerProcesados: async (): Promise<string[]> => (await leer<string[]>('procesados')) ?? [],
  marcarProcesado: async (clave: string): Promise<void> => {
    const actuales = (await leer<string[]>('procesados')) ?? []
    const sin = actuales.filter((c) => c !== clave)
    await escribir('procesados', recortarProcesados([...sin, clave], CM_MAX_PROCESADOS))
  },

  leerUltimo: () => leer<UltimoResultado>('ultimo'),
  guardarUltimo: (ultimo: UltimoResultado) => escribir('ultimo', ultimo),

  /** Último archivo que no es Pieza a pieza (p. ej. Puerta 0) cargado sin fallos. */
  leerUltimoOtro: () => leer<UltimoOtro>('ultimoOtro'),
  guardarUltimoOtro: (u: UltimoOtro) => escribir('ultimoOtro', u),

  /** Contador que cambia en cada reemplazo de carpeta: una revisión vieja lo compara antes de escribir. */
  leerGeneracion: async (): Promise<number> => (await leer<number>('generacion')) ?? 0,

  /**
   * Cambiar de carpeta, en UNA transacción: guarda el handle nuevo, sube la
   * generación y olvida todo lo de la anterior (avisos, resultados, procesados).
   */
  reemplazarCarpeta: async (handle: HandleCarpeta): Promise<void> => {
    const db = await abrirDb()
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(TIENDA, 'readwrite')
      const almacen = tx.objectStore(TIENDA)
      const actual = almacen.get('generacion')
      actual.onsuccess = () => {
        almacen.put(((actual.result as number | undefined) ?? 0) + 1, 'generacion')
        almacen.put(handle, 'handle')
        for (const clave of ['ultimo', 'ultimoOtro', 'cortado', 'resultados', 'intentos', 'procesados'] as const) almacen.delete(clave)
      }
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => {
        db.close()
        reject(tx.error ?? new Error('Error al escribir IndexedDB'))
      }
    })
  },

  /** Exporte cortado: persiste hasta que cargue un Pieza a pieza completo más nuevo (regla 9). */
  leerCortado: () => leer<CortadoInfo>('cortado'),
  guardarCortado: (c: CortadoInfo) => escribir('cortado', c),
  borrarCortado: () => escribir('cortado', undefined),

  /** Resultado por archivo (regla 5): cargado, omitido, cortado, vacio o fallido. */
  leerResultados: async (): Promise<Record<string, ResultadoArchivo>> => (await leer<Record<string, ResultadoArchivo>>('resultados')) ?? {},
  guardarResultado: async (clave: string, r: ResultadoArchivo): Promise<void> => {
    const actuales = (await leer<Record<string, ResultadoArchivo>>('resultados')) ?? {}
    const nuevo = recortarResultados({ ...actuales, [clave]: r })
    await escribir('resultados', nuevo)
  },

  /** Intentos fallidos por clave de archivo (regla 6). */
  leerIntentos: async (): Promise<Record<string, number>> => (await leer<Record<string, number>>('intentos')) ?? {},
  guardarIntentos: (mapa: Record<string, number>) => escribir('intentos', Object.keys(mapa).length ? mapa : undefined),
}
