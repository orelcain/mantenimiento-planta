/**
 * Caso real 2026-09-05: el listener de `users/{uid}` murió con permission-denied
 * en dos pestañas del mismo PC (token compartido vencido) y la app quedaba con
 * permisos por defecto hasta recargar. Garantía: un permission-denied refresca
 * el token con `getIdToken(true)` y re-suscribe UNA vez; un segundo rechazo u
 * otro error caen al fallback, y cancelar la suscripción corta todo.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const authMock: { currentUser: { uid: string; getIdToken: ReturnType<typeof vi.fn> } | null } = { currentUser: null }
vi.mock('@/services/firebase', () => ({ db: {}, auth: authMock, storage: {}, rtdb: {} }))
vi.mock('@/lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }))

type Handlers = { onNext: (snap: unknown) => void; onError: (e: unknown) => void; unsub: ReturnType<typeof vi.fn> }
const suscripciones: Handlers[] = []
const getDoc = vi.fn()
vi.mock('@/services/firestoreTracked', () => ({
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ __ref: `${col}/${id}` })),
  getDoc: (...a: unknown[]) => getDoc(...a),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  collection: vi.fn(),
  getDocs: vi.fn(),
  serverTimestamp: vi.fn(),
  onSnapshot: (_ref: unknown, onNext: Handlers['onNext'], onError: Handlers['onError']) => {
    const h: Handlers = { onNext, onError, unsub: vi.fn() }
    suscripciones.push(h)
    return h.unsub
  },
}))

const { subscribeToUserPermissions } = await import('../permissions')

const denegado = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
const snapPerfil = { exists: () => true, data: () => ({ rol: 'tecnico', activo: true }) }
const tick = () => new Promise((r) => setTimeout(r, 0))
const sub = (i: number): Handlers => {
  const h = suscripciones[i]
  if (!h) throw new Error(`no hay suscripción #${i}`)
  return h
}

beforeEach(() => {
  suscripciones.length = 0
  getDoc.mockReset()
  // getRolePermissions lee roles/{rol}: sin doc → permisos por defecto del rol
  getDoc.mockResolvedValue({ exists: () => false })
  authMock.currentUser = { uid: 'uid-1', getIdToken: vi.fn().mockResolvedValue('token-nuevo') }
})

describe('subscribeToUserPermissions con reintento', () => {
  it('permission-denied → refresca token, re-suscribe y entrega permisos desde firestore', async () => {
    const cb = vi.fn()
    subscribeToUserPermissions('uid-1', 'tecnico', cb)
    expect(suscripciones).toHaveLength(1)

    sub(0).onError(denegado())
    await tick()

    expect(authMock.currentUser!.getIdToken).toHaveBeenCalledWith(true)
    expect(suscripciones).toHaveLength(2)
    expect(cb).not.toHaveBeenCalled() // no cayó a default en el primer rechazo

    sub(1).onNext(snapPerfil)
    await tick()
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ cargadoDesde: 'firestore' }))
  })

  it('segundo permission-denied → cae a default sin volver a refrescar', async () => {
    const cb = vi.fn()
    subscribeToUserPermissions('uid-1', 'tecnico', cb)
    sub(0).onError(denegado())
    await tick()
    sub(1).onError(denegado())
    await tick()

    expect(authMock.currentUser!.getIdToken).toHaveBeenCalledTimes(1)
    expect(suscripciones).toHaveLength(2)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ cargadoDesde: 'default' }))
  })

  it('otro error → cae a default sin tocar el token', async () => {
    const cb = vi.fn()
    subscribeToUserPermissions('uid-1', 'tecnico', cb)
    sub(0).onError(Object.assign(new Error('offline'), { code: 'unavailable' }))
    await tick()

    expect(authMock.currentUser!.getIdToken).not.toHaveBeenCalled()
    expect(suscripciones).toHaveLength(1)
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ cargadoDesde: 'default' }))
  })

  it('sin usuario en Auth (o uid distinto) → cae a default', async () => {
    authMock.currentUser = { uid: 'otro', getIdToken: vi.fn() }
    const cb = vi.fn()
    subscribeToUserPermissions('uid-1', 'tecnico', cb)
    sub(0).onError(denegado())
    await tick()
    expect(authMock.currentUser!.getIdToken).not.toHaveBeenCalled()
    expect(cb).toHaveBeenLastCalledWith(expect.objectContaining({ cargadoDesde: 'default' }))
  })

  it('cancelar la suscripción mientras se refresca el token evita re-suscribir', async () => {
    let resolverToken: (v: string) => void = () => {}
    authMock.currentUser = { uid: 'uid-1', getIdToken: vi.fn(() => new Promise<string>((r) => { resolverToken = r })) }
    const cb = vi.fn()
    const unsub = subscribeToUserPermissions('uid-1', 'tecnico', cb)
    sub(0).onError(denegado())
    await tick()
    unsub()
    resolverToken('token-nuevo')
    await tick()

    expect(sub(0).unsub).toHaveBeenCalledTimes(1)
    expect(suscripciones).toHaveLength(1)
    expect(cb).not.toHaveBeenCalled()
  })

  it('cancelar tras re-suscribir corta la segunda suscripción', async () => {
    const unsub = subscribeToUserPermissions('uid-1', 'tecnico', vi.fn())
    sub(0).onError(denegado())
    await tick()
    unsub()
    expect(sub(1).unsub).toHaveBeenCalledTimes(1)
  })
})
