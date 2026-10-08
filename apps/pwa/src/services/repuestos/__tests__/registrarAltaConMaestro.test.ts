/**
 * `registrarAltaConMaestro`: maestro + alta en UNA transacción. Firestore va simulado con un almacén en
 * memoria (docs, consultas `==`/`in`, transacciones que aplican las escrituras solo si no se lanza nada) para
 * poder probar las carreras: el segundo operador, y un doc `repuestos/{SAP}` que aparece entre la consulta y la
 * transacción.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Datos = Record<string, unknown>
const f = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  /** se ejecuta justo antes de abrir la transacción (para simular que otro escribe entremedio). */
  antesDeTx: null as null | (() => void),
  cache: null as null | { repuesto: { id: string; codigoFabricante?: string } }[],
  /** cada escritura aplicada, en orden. */
  escrituras: [] as { op: string; path: string; data: Record<string, unknown> }[],
}))

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('@/hooks/repuestos/useGlobalSearch', () => ({ getGlobalRepuestosCache: () => f.cache }))
vi.mock('firebase/firestore', () => {
  const snapDe = (path: string) => {
    const d = f.store.get(path)
    return { id: path.split('/').pop()!, exists: () => !!d, data: () => ({ ...(d ?? {}) }) }
  }
  return {
    collection: (_db: unknown, path: string) => ({ kind: 'col', path }),
    doc: (_db: unknown, col: string, id: string) => ({ kind: 'doc', path: `${col}/${id}` }),
    where: (field: string, op: string, value: unknown) => ({ field, op, value }),
    limit: (n: number) => ({ limit: n }),
    query: (col: { path: string }, ...cs: { field?: string; op?: string; value?: unknown; limit?: number }[]) => ({ col, cs }),
    getDoc: async (ref: { path: string }) => snapDe(ref.path),
    getDocs: async (q: { col: { path: string }; cs: { field?: string; op?: string; value?: unknown }[] }) => {
      const w = q.cs.find((c) => c.field)
      const docs = [...f.store.entries()]
        .filter(([p]) => p.startsWith(`${q.col.path}/`))
        .filter(([, d]) => {
          if (!w) return true
          const v = d[w.field!]
          return w.op === 'in' ? (w.value as unknown[]).includes(v) : v === w.value
        })
        .map(([p]) => snapDe(p))
      return { docs, size: docs.length }
    },
    serverTimestamp: () => 'TS',
    Timestamp: { now: () => 'NOW' },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      f.antesDeTx?.()
      const pendientes: { op: string; path: string; data: Record<string, unknown> }[] = []
      const tx = {
        get: async (ref: { path: string }) => snapDe(ref.path),
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          if (f.store.has(ref.path)) throw new Error(`set sobre un doc que existe: ${ref.path}`)
          pendientes.push({ op: 'set', path: ref.path, data })
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          if (!f.store.has(ref.path)) throw new Error(`update de un doc inexistente: ${ref.path}`)
          pendientes.push({ op: 'update', path: ref.path, data })
        },
      }
      const r = await fn(tx) // si lanza, no se aplica nada (atomicidad)
      for (const p of pendientes) {
        f.store.set(p.path, p.op === 'set' ? { ...p.data } : { ...(f.store.get(p.path) ?? {}), ...p.data })
        f.escrituras.push(p)
      }
      return r
    },
  }
})

import { ErrorAltaSap, registrarAltaConMaestro, variantesDeCodigo } from '../asignarSapMaestro'

const ALTA = 'solicitudes_repuestos/alta_42203183'
const sembrarAlta = (extra: Datos = {}) =>
  f.store.set(ALTA, { tipo: 'alta_codigo', estado: 'pendiente', codigoFabricante: '42203183', textoBreve: 'Relé en miniatura 24V DC', ...extra })
const args = (sap = '3300112345', uid = 'u1') => ({ altaId: 'alta_42203183', sap, origen: 'nuevo' as const, userId: uid, userName: `Op ${uid}` })

beforeEach(() => {
  f.store.clear()
  f.escrituras.length = 0
  f.antesDeTx = null
  f.cache = null
  sembrarAlta()
})

describe('registrarAltaConMaestro · camino feliz', () => {
  it('sin nada en el maestro: crea repuestos/{SAP} y cierra la alta, todo junto', async () => {
    const r = await registrarAltaConMaestro(args())
    expect(r).toEqual({ plan: 'crear', id: '3300112345' })
    expect(f.store.get('repuestos/3300112345')).toMatchObject({ codigoSAP: '3300112345', codigoFabricante: '42203183', tieneSap: true, origen: 'alta_codigo', solicitudAltaId: 'alta_42203183' })
    expect(f.store.get(ALTA)).toMatchObject({ estado: 'creada', sapCreado: '3300112345', codigoSAP: '3300112345', origenSap: 'nuevo', creadaPor: 'u1', creadaPorNombre: 'Op u1' })
  })

  it('un doc del maestro con ese fabricante y sin SAP: se le asigna el SAP (no se crea otro)', async () => {
    f.store.set('repuestos/despiece1', { codigoFabricante: '42203183', codigoSAP: '', fotosReales: ['a'] })
    const r = await registrarAltaConMaestro(args())
    expect(r).toEqual({ plan: 'asignar-sap', id: 'despiece1' })
    expect(f.store.get('repuestos/despiece1')).toMatchObject({ codigoSAP: '3300112345', tieneSap: true, fotosReales: ['a'] })
    expect(f.store.has('repuestos/3300112345')).toBe(false)
  })

  it('encuentra «4220 3183» y «4220-3183» (variantes con separador)', async () => {
    f.store.set('repuestos/x', { codigoFabricante: '4220 3183', codigoSAP: '' })
    expect((await registrarAltaConMaestro(args())).id).toBe('x')
  })

  it('con la caché global tibia encuentra un formato que la consulta no enumera («42.203.183»)', async () => {
    f.store.set('repuestos/y', { codigoFabricante: '42.203.183', codigoSAP: '' })
    f.cache = [{ repuesto: { id: 'y', codigoFabricante: '42.203.183' } }]
    expect((await registrarAltaConMaestro(args())).id).toBe('y')
  })
})

describe('registrarAltaConMaestro · P1-1: nunca pisa un doc que existe', () => {
  it('si repuestos/{SAP} aparece entre la consulta y la transacción, lo COMPLETA: conserva fotos y equipos', async () => {
    f.antesDeTx = () => {
      f.store.set('repuestos/3300112345', { codigoSAP: '3300112345', codigoFabricante: '', textoBreve: 'RELE', fotosReales: ['foto1'], equipos: ['e1'] })
    }
    const r = await registrarAltaConMaestro(args())
    expect(r).toEqual({ plan: 'completar-fabricante', id: '3300112345' })
    expect(f.store.get('repuestos/3300112345')).toMatchObject({ codigoFabricante: '42203183', fotosReales: ['foto1'], equipos: ['e1'], textoBreve: 'RELE' })
    expect(f.escrituras.some((e) => e.op === 'set' && e.path.startsWith('repuestos/'))).toBe(false)
  })

  it('si en ese intervalo el doc del SAP es de OTRO repuesto, aborta sin escribir nada', async () => {
    f.antesDeTx = () => {
      f.store.set('repuestos/3300112345', { codigoSAP: '3300112345', codigoFabricante: '42203310', textoBreve: 'MODULO RELE 42203310' })
    }
    await expect(registrarAltaConMaestro(args())).rejects.toMatchObject({ name: 'ErrorAltaSap', codigo: 'sap-de-otro-repuesto' })
    expect(f.escrituras).toHaveLength(0)
    expect(f.store.get(ALTA)).toMatchObject({ estado: 'pendiente' })
  })

  it('el doc del fabricante que otro operador ya llenó con OTRO SAP no se pisa: se crea el del SAP nuevo', async () => {
    f.store.set('repuestos/despiece1', { codigoFabricante: '42203183', codigoSAP: '3300000099' })
    const r = await registrarAltaConMaestro(args())
    expect(r.plan).toBe('crear')
    expect(f.store.get('repuestos/despiece1')).toMatchObject({ codigoSAP: '3300000099' })
  })
})

describe('registrarAltaConMaestro · P1-3: SAP de otro repuesto es un error del servicio', () => {
  it('el SAP ya es un repuesto con otro código de fabricante: error claro y nada escrito', async () => {
    f.store.set('repuestos/3300080929', { codigoSAP: '3300080929', codigoFabricante: '42203310', textoBreve: 'MODULO RELE 42203310' })
    const e = await registrarAltaConMaestro(args('3300080929')).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorAltaSap)
    expect(e.codigo).toBe('sap-de-otro-repuesto')
    expect(e.message).toContain('«MODULO RELE 42203310»')
    expect(f.escrituras).toHaveLength(0)
    expect(f.store.get(ALTA)).toMatchObject({ estado: 'pendiente' })
  })

  it('también si el doc con ese SAP tiene otro id (campo codigoSAP)', async () => {
    f.store.set('repuestos/auto1', { codigoSAP: '3300080929', codigoFabricante: '42203310', textoBreve: 'OTRO' })
    await expect(registrarAltaConMaestro(args('3300080929'))).rejects.toMatchObject({ codigo: 'sap-de-otro-repuesto' })
  })

  it('el SAP ya es el MISMO repuesto (mismo fabricante): cierra sin tocar el maestro', async () => {
    f.store.set('repuestos/3300112345', { codigoSAP: '3300112345', codigoFabricante: '4220 3183' })
    const r = await registrarAltaConMaestro(args())
    expect(r.plan).toBe('completar-fabricante')
    expect(f.escrituras.filter((e) => e.path.startsWith('repuestos/'))).toHaveLength(0)
    expect(f.store.get(ALTA)).toMatchObject({ estado: 'creada' })
  })

  it('un SAP que no son 10 dígitos ni se intenta', async () => {
    await expect(registrarAltaConMaestro(args('330011234'))).rejects.toMatchObject({ codigo: 'sap-invalido' })
    expect(f.escrituras).toHaveLength(0)
  })
})

describe('registrarAltaConMaestro · P1-2: el segundo operador', () => {
  it('el primero cierra con su SAP; el segundo (otro SAP) NO escribe el maestro ni la alta', async () => {
    await registrarAltaConMaestro(args('3300112345', 'u1'))
    const antes = new Map(f.store)
    f.escrituras.length = 0
    const e = await registrarAltaConMaestro(args('3300999999', 'u2')).catch((x) => x)
    expect(e).toBeInstanceOf(ErrorAltaSap)
    expect(e.codigo).toBe('alta-no-pendiente')
    // ni un doc nuevo en el maestro con el SAP del segundo, ni cambios en la alta
    expect(f.escrituras).toHaveLength(0)
    expect(f.store.has('repuestos/3300999999')).toBe(false)
    expect(f.store.get(ALTA)).toEqual(antes.get(ALTA))
    expect(f.store.get(ALTA)).toMatchObject({ sapCreado: '3300112345', creadaPor: 'u1' })
  })

  it('si el otro operador la cerró DESPUÉS de la comprobación previa pero antes de la transacción, tampoco escribe', async () => {
    f.antesDeTx = () => { f.store.set(ALTA, { ...f.store.get(ALTA)!, estado: 'creada', sapCreado: '3300112345', creadaPor: 'u1' }) }
    await expect(registrarAltaConMaestro(args('3300999999', 'u2'))).rejects.toMatchObject({ codigo: 'alta-no-pendiente' })
    expect(f.escrituras).toHaveLength(0)
    expect(f.store.has('repuestos/3300999999')).toBe(false)
  })

  it('una alta rechazada o inexistente tampoco se cierra', async () => {
    f.store.set(ALTA, { ...f.store.get(ALTA)!, estado: 'rechazada' })
    await expect(registrarAltaConMaestro(args())).rejects.toMatchObject({ codigo: 'alta-no-pendiente' })
    f.store.delete(ALTA)
    await expect(registrarAltaConMaestro(args())).rejects.toMatchObject({ codigo: 'alta-inexistente' })
    expect(f.escrituras).toHaveLength(0)
  })
})

describe('variantesDeCodigo', () => {
  it('tal cual, normalizado y con un espacio o guion en cada posición, sin pasar de 30', () => {
    const v = variantesDeCodigo('9990608')
    expect(v).toContain('9990608')
    expect(v).toContain('999 0608')
    expect(v).toContain('999-0608')
    expect(v.length).toBeLessThanOrEqual(30)
    expect(variantesDeCodigo('999 0608')).toContain('999 0608')
    expect(variantesDeCodigo('999 0608')).toContain('9990608')
  })
  it('un código largo no explota el `in` de Firestore', () => {
    expect(variantesDeCodigo('1234567890123456789012345').length).toBeLessThanOrEqual(30)
  })
})
