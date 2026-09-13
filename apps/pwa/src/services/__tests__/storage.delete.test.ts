/**
 * Tests de los borrados de Storage por URL — la garantía: **ninguno falla mudo**.
 *
 * Hasta el 08-09-2026 estas funciones tragaban cualquier error con
 * `logger.error`. El caller seguía, quitaba la URL de Firestore y el archivo
 * quedaba huérfano en el bucket sin que nadie lo viera. Ahora todas pasan por
 * `deleteStorageObjectByUrl`, que propaga, con una sola excepción:
 * `storage/object-not-found`, porque si el archivo ya no existe la referencia
 * en Firestore es basura y quitarla es lo correcto.
 *
 * `deleteMapImage` es el caso que más importa: en producción devuelve 403
 * (la ruta real `maps/{fileName}` no matchea ninguna regla de escritura), así
 * que mientras el error se tragaba el botón "Eliminar plano" mentía.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {}, storage: {}, rtdb: {} }))

const deleteObject = vi.fn()
const loggerError = vi.fn()
const loggerWarn = vi.fn()

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  listAll: vi.fn(),
}))

vi.mock('@/lib/logger', () => ({
  logger: {
    error: (...args: unknown[]) => loggerError(...args),
    warn: (...args: unknown[]) => loggerWarn(...args),
    info: vi.fn(),
    debug: vi.fn(),
  },
}))

import {
  deleteRepuestoFoto,
  deleteBodegaPhoto,
  deleteFile,
  deleteMapImage,
} from '../storage'

const URL = 'https://firebasestorage.googleapis.com/v0/b/x/o/repuestos%2Fsin-equipo%2F3300101237%2Ffotos%2Fa.webp?alt=media'

function storageError(code: string): Error & { code: string } {
  return Object.assign(new Error(`Firebase Storage: ${code}`), { code })
}

/** Las cuatro comparten helper: la garantía tiene que valer para todas. */
const BORRADOS: [string, (url: string) => Promise<void>][] = [
  ['deleteRepuestoFoto', deleteRepuestoFoto],
  ['deleteBodegaPhoto', deleteBodegaPhoto],
  ['deleteFile', deleteFile],
  ['deleteMapImage', deleteMapImage],
]

beforeEach(() => {
  deleteObject.mockReset()
  loggerError.mockReset()
  loggerWarn.mockReset()
})

describe.each(BORRADOS)('%s', (_nombre, borrar) => {
  it('borra el objeto por su downloadURL y termina bien', async () => {
    deleteObject.mockResolvedValue(undefined)
    await expect(borrar(URL)).resolves.toBeUndefined()
    expect(deleteObject).toHaveBeenCalledWith({ path: URL })
    expect(loggerError).not.toHaveBeenCalled()
  })

  it('PROPAGA storage/unauthorized (antes moría mudo y dejaba el huérfano)', async () => {
    deleteObject.mockRejectedValue(storageError('storage/unauthorized'))
    await expect(borrar(URL)).rejects.toMatchObject({ code: 'storage/unauthorized' })
    expect(loggerError).toHaveBeenCalledTimes(1)
  })

  it('propaga también un error genérico (red caída, etc.)', async () => {
    deleteObject.mockRejectedValue(new Error('network'))
    await expect(borrar(URL)).rejects.toThrow('network')
  })

  it('object-not-found NO es error: la referencia es basura y se sigue', async () => {
    deleteObject.mockRejectedValue(storageError('storage/object-not-found'))
    await expect(borrar(URL)).resolves.toBeUndefined()
    expect(loggerError).not.toHaveBeenCalled()
    expect(loggerWarn).toHaveBeenCalledTimes(1)
  })
})
