/**
 * Tests de `uploadModel3D` — la garantía es una sola: **no quedan huérfanos**.
 *
 * Un huérfano es un `.glb` en Storage sin documento en Firestore. La app solo
 * conoce los modelos que tienen documento, así que un huérfano es invisible:
 * no se lista, no se abre y no se puede borrar desde la interfaz. Queda ocupando
 * espacio para siempre. Así apareció `models3d/862bb7b2-.../test.glb` (4,7 MB,
 * 22-05-2026), que hubo que borrar a mano con credenciales de administrador.
 *
 * El orden de la subida lo hace posible: primero el archivo, después el
 * documento. Si el segundo paso falla, el primero ya ocurrió.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {}, storage: {}, rtdb: {} }))

const setDoc = vi.fn()
const deleteObject = vi.fn()
const getDownloadURL = vi.fn()

vi.mock('@/services/firestoreTracked', () => ({
  collection: vi.fn(),
  doc: vi.fn(() => ({})),
  setDoc: (...args: unknown[]) => setDoc(...args),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  deleteDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => 'ts'),
  onSnapshot: vi.fn(),
  Timestamp: class {},
}))

/** Simula `uploadBytesResumable`: dispara progreso y termina OK o con error. */
let uploadOutcome: { ok: true } | { ok: false; error: unknown } = { ok: true }

vi.mock('firebase/storage', () => ({
  ref: vi.fn((_s: unknown, path: string) => ({ path })),
  getDownloadURL: (...args: unknown[]) => getDownloadURL(...args),
  deleteObject: (...args: unknown[]) => deleteObject(...args),
  uploadBytesResumable: vi.fn(() => ({
    on: (
      _event: string,
      onProgress: (s: { bytesTransferred: number; totalBytes: number }) => void,
      onError: (e: unknown) => void,
      onDone: () => void,
    ) => {
      onProgress({ bytesTransferred: 50, totalBytes: 100 })
      if (uploadOutcome.ok) onDone()
      else onError(uploadOutcome.error)
    },
  })),
}))

import { uploadModel3D } from '../models3d'

function fakeGlb(name = 'bomba.glb'): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type: 'model/gltf-binary' })
}

/** Error de Firebase: lo que importa es el `code`. */
function firebaseError(code: string, message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code })
}

beforeEach(() => {
  vi.clearAllMocks()
  uploadOutcome = { ok: true }
  getDownloadURL.mockResolvedValue('https://example.test/bomba.glb')
  setDoc.mockResolvedValue(undefined)
  deleteObject.mockResolvedValue(undefined)
})

describe('uploadModel3D — camino feliz', () => {
  it('sube, registra el documento y NO borra nada', async () => {
    const model = await uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1')

    expect(setDoc).toHaveBeenCalledTimes(1)
    expect(deleteObject).not.toHaveBeenCalled()
    expect(model.name).toBe('Bomba Sihi')
    expect(model.format).toBe('glb')
    expect(model.storagePath).toContain('bomba.glb')
  })

  it('reporta el progreso de la subida', async () => {
    const onProgress = vi.fn()
    await uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1', onProgress)
    expect(onProgress).toHaveBeenCalledWith(50)
  })
})

describe('uploadModel3D — el documento falla: NO puede quedar huérfano', () => {
  it('borra de Storage el archivo recién subido', async () => {
    setDoc.mockRejectedValue(firebaseError('permission-denied', 'Missing or insufficient permissions.'))

    await expect(uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1')).rejects.toThrow()

    expect(deleteObject).toHaveBeenCalledTimes(1)
    expect(deleteObject.mock.calls[0]?.[0]).toMatchObject({ path: expect.stringContaining('bomba.glb') })
  })

  it('explica que falta rol de administrador, no "insufficient permissions"', async () => {
    setDoc.mockRejectedValue(firebaseError('permission-denied', 'Missing or insufficient permissions.'))

    await expect(uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1')).rejects.toThrow(
      /rol de administrador/i,
    )
  })

  it('avisa que el archivo se descartó, para que nadie lo busque después', async () => {
    setDoc.mockRejectedValue(firebaseError('permission-denied', 'nope'))
    await expect(uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1')).rejects.toThrow(/se descartó/i)
  })

  it('también revierte ante un fallo cualquiera, no solo de permisos', async () => {
    setDoc.mockRejectedValue(new Error('network request failed'))

    await expect(uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1')).rejects.toThrow(
      /network request failed/,
    )
    expect(deleteObject).toHaveBeenCalledTimes(1)
  })

  it('si la limpieza TAMBIÉN falla, propaga el error original y no el de la limpieza', async () => {
    // Quien sube necesita saber por qué se rechazó su modelo. Que además no se
    // pudiera limpiar es problema nuestro, y queda en el log.
    setDoc.mockRejectedValue(firebaseError('permission-denied', 'denegado'))
    deleteObject.mockRejectedValue(new Error('storage/retry-limit-exceeded'))

    await expect(uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1')).rejects.toThrow(
      /rol de administrador/i,
    )
  })
})

describe('uploadModel3D — la subida misma falla', () => {
  it('traduce storage/unauthorized a un mensaje con el rol, y no promete limpieza', async () => {
    uploadOutcome = { ok: false, error: firebaseError('storage/unauthorized', 'User does not have permission.') }

    const err = await uploadModel3D(fakeGlb(), 'Bomba Sihi', 'user-1').catch((e: Error) => e)

    expect((err as Error).message).toMatch(/rol de administrador/i)
    // No se subió nada: prometer "se descartó" sería mentira.
    expect((err as Error).message).not.toMatch(/se descartó/i)
    expect(setDoc).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})

describe('uploadModel3D — validaciones previas', () => {
  it('rechaza un formato no soportado sin tocar Storage', async () => {
    await expect(uploadModel3D(fakeGlb('plano.pdf'), 'Plano', 'user-1')).rejects.toThrow(
      /Formato no soportado/,
    )
    expect(setDoc).not.toHaveBeenCalled()
    expect(deleteObject).not.toHaveBeenCalled()
  })
})
