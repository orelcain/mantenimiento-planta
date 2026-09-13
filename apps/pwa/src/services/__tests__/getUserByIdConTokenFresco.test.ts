/**
 * Caso real 2026-09-05: `mantencion.plantach` autenticaba bien y la lectura de
 * `users/{uid}` fallaba con permission-denied porque la conexión Firestore de
 * una pestaña dormida seguía con la credencial vieja. La garantía: un
 * permission-denied justo tras autenticar fuerza `getIdToken(true)` y
 * reintenta UNA vez; cualquier otro error (o un segundo rechazo) se propaga
 * sin tocar el token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {}, auth: {}, storage: {}, rtdb: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

const signInWithEmailAndPassword = vi.fn()
vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...a: unknown[]) => signInWithEmailAndPassword(...a),
  createUserWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
  onAuthStateChanged: vi.fn(),
  updateProfile: vi.fn(),
  GoogleAuthProvider: { credential: vi.fn() },
  signInWithCredential: vi.fn(),
  setPersistence: vi.fn(),
  browserLocalPersistence: {},
  browserSessionPersistence: {},
}))

const getDoc = vi.fn()
vi.mock('@/services/firestoreTracked', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ __ref: `${col}/${id}` })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
}))

const { getUserByIdConTokenFresco, signIn } = await import('../auth')

const denegado = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
const perfil = { exists: () => true, id: 'uid-1', data: () => ({ email: 'x@y.cl', rol: 'tecnico', activo: true }) }
const usuarioFirebase = () => ({ uid: 'uid-1', getIdToken: vi.fn().mockResolvedValue('token-nuevo') })

beforeEach(() => {
  getDoc.mockReset()
  signInWithEmailAndPassword.mockReset()
})

describe('getUserByIdConTokenFresco', () => {
  it('permission-denied → refresca el token una vez y reintenta con éxito', async () => {
    getDoc.mockRejectedValueOnce(denegado()).mockResolvedValueOnce(perfil)
    const fu = usuarioFirebase()
    const user = await getUserByIdConTokenFresco(fu as never)
    expect(user?.rol).toBe('tecnico')
    expect(fu.getIdToken).toHaveBeenCalledTimes(1)
    expect(fu.getIdToken).toHaveBeenCalledWith(true)
    expect(getDoc).toHaveBeenCalledTimes(2)
  })

  it('otro error → se propaga sin tocar el token', async () => {
    getDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }))
    const fu = usuarioFirebase()
    await expect(getUserByIdConTokenFresco(fu as never)).rejects.toThrow('offline')
    expect(fu.getIdToken).not.toHaveBeenCalled()
    expect(getDoc).toHaveBeenCalledTimes(1)
  })

  it('segundo permission-denied → se propaga, sin bucle', async () => {
    getDoc.mockRejectedValue(denegado())
    const fu = usuarioFirebase()
    await expect(getUserByIdConTokenFresco(fu as never)).rejects.toMatchObject({ code: 'permission-denied' })
    expect(fu.getIdToken).toHaveBeenCalledTimes(1)
    expect(getDoc).toHaveBeenCalledTimes(2)
  })

  it('sin error → una sola lectura y ningún refresco', async () => {
    getDoc.mockResolvedValueOnce(perfil)
    const fu = usuarioFirebase()
    await getUserByIdConTokenFresco(fu as never)
    expect(fu.getIdToken).not.toHaveBeenCalled()
    expect(getDoc).toHaveBeenCalledTimes(1)
  })
})

describe('signIn usa el reintento', () => {
  it('login con perfil rechazado la primera vez termina con sesión válida', async () => {
    const fu = usuarioFirebase()
    signInWithEmailAndPassword.mockResolvedValue({ user: fu })
    getDoc.mockRejectedValueOnce(denegado()).mockResolvedValue(perfil)
    const user = await signIn('x@y.cl', 'clave')
    expect(user.id).toBe('uid-1')
    expect(fu.getIdToken).toHaveBeenCalledWith(true)
  })
})
