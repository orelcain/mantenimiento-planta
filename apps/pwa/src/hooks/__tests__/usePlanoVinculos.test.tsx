// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useAuthStore } from '@/store/authStore'
import { usePlanoVinculos } from '../usePlanoVinculos'

const fb = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  setDoc: vi.fn(async () => {}),
  /** callback de la suscripción, para empujar docs. */
  emitir: null as null | ((docs: { id: string; data: Record<string, unknown> }[]) => void),
}))

vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, c: string) => ({ c }),
  doc: (_db: unknown, c: string, id: string) => ({ c, id }),
  query: (...a: unknown[]) => a,
  where: (...a: unknown[]) => a,
  serverTimestamp: () => 'TS',
  setDoc: fb.setDoc,
  onSnapshot: (_q: unknown, ok: (s: unknown) => void) => {
    fb.onSnapshot()
    fb.emitir = docs => ok({ forEach: (f: (d: unknown) => void) => docs.forEach(d => f({ id: d.id, data: () => d.data })) })
    return () => {}
  },
}))
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getDownloadURL: vi.fn() }))
vi.mock('@/services/firebase', () => ({
  db: {},
  storage: {},
  auth: { currentUser: { uid: 'u1', displayName: 'Ana', email: 'a@b.c' } },
}))

beforeEach(() => {
  fb.onSnapshot.mockClear()
  fb.setDoc.mockClear()
  fb.emitir = null
  useAuthStore.setState({ isAuthenticated: true })
})
afterEach(cleanup)

describe('usePlanoVinculos', () => {
  it('sin sesión no se suscribe', () => {
    useAuthStore.setState({ isAuthenticated: false })
    renderHook(() => usePlanoVinculos('baader-142-888', 'baader-n2'))
    expect(fb.onSnapshot).not.toHaveBeenCalled()
  })

  it('888: guarda en <slug>__<aparato>__<maquina> con el campo maquina y sin undefined', async () => {
    const { result } = renderHook(() => usePlanoVinculos('baader-142-888', 'baader-n3'))
    await result.current.confirmar({ aparato: 'B5', estado: 'confirmado', codigo: '42303109', nota: undefined, foto: undefined })
    expect(fb.setDoc).toHaveBeenCalledTimes(1)
    const [ref, datos, opts] = fb.setDoc.mock.calls[0] as unknown as [{ id: string }, Record<string, unknown>, unknown]
    expect(ref.id).toBe('baader-142-888__B5__baader-n3')
    expect(datos).toMatchObject({ plantId: 'chonchi', planoSlug: 'baader-142-888', aparato: 'B5', maquina: 'baader-n3', estado: 'confirmado', codigo: '42303109', confirmadoPor: 'u1' })
    expect(Object.values(datos)).not.toContain(undefined)
    expect(opts).toEqual({ merge: true })
  })

  it('888 sin máquina elegida: no guarda y avisa', async () => {
    const { result } = renderHook(() => usePlanoVinculos('baader-142-888', null))
    await expect(result.current.confirmar({ aparato: 'B5', estado: 'confirmado' })).rejects.toThrow(/Elige primero la máquina/)
    expect(fb.setDoc).not.toHaveBeenCalled()
  })

  it('888 con una máquina que el plano no tiene: no guarda', async () => {
    const { result } = renderHook(() => usePlanoVinculos('baader-142-888', 'baader-n1'))
    await expect(result.current.confirmar({ aparato: 'B5', estado: 'confirmado' })).rejects.toThrow()
    expect(fb.setDoc).not.toHaveBeenCalled()
  })

  it('860 y planos sin máquinas: el id y el doc no cambian (sin campo maquina)', async () => {
    const a = renderHook(() => usePlanoVinculos('baader-142-860', 'baader-n1'))
    await a.result.current.confirmar({ aparato: 'B1', estado: 'no_aplica' })
    const b = renderHook(() => usePlanoVinculos('gea-50520184'))
    await b.result.current.confirmar({ aparato: 'K1', estado: 'confirmado' })
    const [r1, d1] = fb.setDoc.mock.calls[0] as unknown as [{ id: string }, Record<string, unknown>]
    const [r2, d2] = fb.setDoc.mock.calls[1] as unknown as [{ id: string }, Record<string, unknown>]
    expect(r1.id).toBe('baader-142-860__B1')
    expect(r2.id).toBe('gea-50520184__K1')
    expect('maquina' in d1).toBe(false)
    expect('maquina' in d2).toBe(false)
  })

  it('lee por máquina: vinculos filtra a la elegida, porAparato trae las dos y el viejo va aparte', () => {
    const { result, rerender } = renderHook(({ m }: { m: 'baader-n2' | 'baader-n3' | null }) => usePlanoVinculos('baader-142-888', m), {
      initialProps: { m: 'baader-n2' as 'baader-n2' | 'baader-n3' | null },
    })
    const base = { planoSlug: 'baader-142-888', confirmadoPor: 'u1' }
    act(() =>
      fb.emitir?.([
        { id: 'baader-142-888__B5__baader-n2', data: { ...base, aparato: 'B5', maquina: 'baader-n2', estado: 'confirmado', codigo: '1' } },
        { id: 'baader-142-888__B5__baader-n3', data: { ...base, aparato: 'B5', maquina: 'baader-n3', estado: 'corregido', codigo: '2' } },
        { id: 'baader-142-888__B6', data: { ...base, aparato: 'B6', estado: 'confirmado' } },
      ]),
    )
    expect(result.current.vinculos.get('B5')?.codigo).toBe('1')
    expect(result.current.vinculos.has('B6')).toBe(false)
    expect(result.current.porAparato.get('B6')?.sinMaquina?.estado).toBe('confirmado')
    rerender({ m: 'baader-n3' })
    expect(result.current.vinculos.get('B5')?.codigo).toBe('2')
    rerender({ m: null })
    expect(result.current.vinculos.size).toBe(0)
    expect(result.current.porAparato.get('B5')?.porMaquina['baader-n2']?.codigo).toBe('1')
  })
})
