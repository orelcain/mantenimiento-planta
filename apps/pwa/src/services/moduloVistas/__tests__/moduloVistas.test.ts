import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/services/firebase', () => ({ db: {} }))

import { moduloDeRuta, MODULOS_VISTAS } from '../moduloDeRuta'
import {
  armarPayloadVista,
  diaChile,
  hashUsuario,
  normalizarDocVistas,
  registrarVistaModulo,
} from '../moduloVistas.service'

describe('moduloDeRuta', () => {
  const casos: Array<[string, string]> = [
    ['/', 'inicio'],
    ['', 'inicio'],
    ['/dashboard', 'inicio'],
    ['/incidents', 'incidencias'],
    ['/bitacora', 'bitacora'],
    ['/bitacora/historial', 'bitacora'],
    ['/repuestos', 'repuestos'],
    ['/bodega', 'bodega'],
    ['/analisis-grader', 'analisis-turno'],
    ['/analisis-grader/turno/abc', 'analisis-turno'],
    ['/analisis-grader/periodo', 'analisis-turno'],
    ['/monitor/tok123', 'monitor'],
    ['/aprendizaje', 'aprendizaje'],
    ['/aprendizaje/', 'aprendizaje'],
    ['/aprendizaje/hmi-knuro', 'aprendizaje-hmi-knuro'],
    ['/aprendizaje/hmi-knuro/preset1', 'aprendizaje-hmi-knuro'],
    ['/aprendizaje/hmi-grader', 'aprendizaje-hmi-grader'],
    ['/aprendizaje/hmi-bombeo-s2', 'aprendizaje-hmi-bombeo-s2'],
    ['/aprendizaje/perilla-5', 'aprendizaje-perilla-5'],
    ['/aprendizaje/baader-142/tarjeta-a3c', 'aprendizaje-tarjeta-a3c'],
    ['/aprendizaje/baader-142/tarjeta-a3c/por-confirmar', 'aprendizaje-tarjeta-a3c'],
    ['/aprendizaje/variadores', 'aprendizaje-variadores'],
    ['/aprendizaje/planos', 'aprendizaje-planos'],
    ['/aprendizaje/planos/baader-142-888', 'aprendizaje-planos'],
    ['/aprendizaje/maquina/grader', 'aprendizaje-maquina'],
    ['/aprendizaje/baader-200/terreno/x', 'aprendizaje-baader-200'],
    ['/aprendizaje/algo-nuevo', 'aprendizaje'],
    ['/aprendizaje/admin', 'admin'],
    ['/aprendizaje/admin/grader', 'admin'],
    ['/baader-200/learn/intro', 'aprendizaje-baader-200'],
    ['/hmi/learn/p1', 'aprendizaje-hmi-knuro'],
    ['/baader-200', 'otro'],
    ['/inspections', 'inspecciones'],
    ['/equipment', 'equipos'],
    ['/aria-actions', 'aria'],
    ['/admin', 'admin'],
    ['/admin/permissions', 'admin'],
    ['/gantt', 'otro'],
    ['/ruta-que-no-existe', 'otro'],
    ['/Bitacora?x=1#y', 'bitacora'],
  ]
  it.each(casos)('%s -> %s', (ruta, esperado) => {
    expect(moduloDeRuta(ruta)).toBe(esperado)
  })

  it('siempre devuelve una clave del conjunto cerrado', () => {
    for (const [ruta] of casos) expect(MODULOS_VISTAS).toContain(moduloDeRuta(ruta))
  })

  it('la lista cerrada coincide con moduloVistasClaves() de firestore.rules', () => {
    const rules = readFileSync(resolve(__dirname, '../../../../../../firestore.rules'), 'utf8')
    const cuerpo = /function moduloVistasClaves\(\)\s*\{\s*return \[([^\]]+)\]/.exec(rules)?.[1] ?? ''
    const enReglas = [...cuerpo.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort()
    expect(enReglas).toEqual([...MODULOS_VISTAS].sort())
  })
})

describe('diaChile', () => {
  it('usa la hora de Chile, no UTC', () => {
    // 01:30 UTC del 9-oct es 22:30 del 8-oct en Chile (UTC-3 en verano austral, UTC-4 en invierno).
    expect(diaChile(new Date('2026-10-09T01:30:00Z'))).toBe('2026-10-08')
    expect(diaChile(new Date('2026-10-09T12:00:00Z'))).toBe('2026-10-09')
  })
  it('tiene forma YYYY-MM-DD', () => {
    expect(diaChile(new Date('2026-01-05T15:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('armarPayloadVista', () => {
  const inc = (n: number) => ({ __inc: n })
  it('arma módulo, intensidad, dispositivo y usuario hasheado, y declara ultimo', () => {
    expect(armarPayloadVista('bitacora', { intensidad: 'oscuro', dispositivo: 'cel' }, 'abc123abc123', inc)).toEqual({
      ultimo: 'bitacora',
      bitacora: { vistas: { __inc: 1 }, oscuro: { __inc: 1 }, cel: { __inc: 1 }, u: { abc123abc123: true } },
    })
  })
  it('u siempre va incluido y NO hay undefined en ningún nivel', () => {
    const p = armarPayloadVista('inicio', { intensidad: 'claro', dispositivo: 'pc' }, 'abc123abc123', inc)
    expect(Object.keys(p.inicio as object).sort()).toEqual(['claro', 'pc', 'u', 'vistas'])
    const sinUndefined = (o: unknown): boolean =>
      o !== undefined && (typeof o !== 'object' || o === null || Object.values(o).every(sinUndefined))
    expect(sinUndefined(p)).toBe(true)
  })
})

describe('hashUsuario', () => {
  it('son 12 hex en minúscula, deterministas y sin el uid', async () => {
    const h = await hashUsuario('u1')
    expect(h).toMatch(/^[0-9a-f]{12}$/)
    expect(await hashUsuario('u1')).toBe(h)
    expect(h).not.toContain('u1')
    expect(await hashUsuario('u2')).not.toBe(h)
  })
})

describe('registrarVistaModulo', () => {
  const memoria = () => {
    const m = new Map<string, string>()
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m }
  }
  const base = () => ({
    escribir: vi.fn(async () => undefined),
    storage: memoria(),
    memoria: new Set<string>(),
    entorno: { intensidad: 'claro', dispositivo: 'pc' } as const,
    hash: async () => 'aaaaaaaaaaaa',
    ahora: new Date('2026-10-08T15:00:00Z'),
  })
  const usuario = { id: 'u1', activo: true }

  it('escribe una vez en el doc del día de Chile', async () => {
    const d = base()
    expect(await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario })).toBe(true)
    expect(d.escribir).toHaveBeenCalledTimes(1)
    const [dia, payload] = d.escribir.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(dia).toBe('2026-10-08')
    expect(payload.ultimo).toBe('bitacora')
  })

  it('dedupe: mismo módulo, misma sesión y día -> una sola escritura (aunque cambie la subruta)', async () => {
    const d = base()
    await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario })
    await registrarVistaModulo({ ...d, pathname: '/bitacora/historial', usuario })
    await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario })
    expect(d.escribir).toHaveBeenCalledTimes(1)
  })

  it('otro módulo en la misma sesión escribe de nuevo', async () => {
    const d = base()
    await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario })
    await registrarVistaModulo({ ...d, pathname: '/repuestos', usuario })
    expect(d.escribir).toHaveBeenCalledTimes(2)
  })

  it('al cambiar el día (Chile) el mismo módulo vuelve a contar', async () => {
    const d = base()
    await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario })
    await registrarVistaModulo({ ...d, ahora: new Date('2026-10-09T15:00:00Z'), pathname: '/bitacora', usuario })
    expect(d.escribir).toHaveBeenCalledTimes(2)
  })

  it('sin sesión (null/undefined), o sin uid, no escribe nada', async () => {
    const d = base()
    expect(await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario: null })).toBe(false)
    expect(await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario: undefined })).toBe(false)
    expect(await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario: { id: '', activo: true } })).toBe(false)
    expect(d.escribir).not.toHaveBeenCalled()
  })

  it('usuario inactivo no escribe', async () => {
    const d = base()
    expect(await registrarVistaModulo({ ...d, pathname: '/bitacora', usuario: { id: 'u1', activo: false } })).toBe(false)
    expect(d.escribir).not.toHaveBeenCalled()
  })

  it('sin hash (sin crypto.subtle) no escribe', async () => {
    const d = base()
    expect(await registrarVistaModulo({ ...d, hash: async () => null, pathname: '/bitacora', usuario })).toBe(false)
    expect(d.escribir).not.toHaveBeenCalled()
  })

  it('si sessionStorage falla, el Set en memoria igual evita la segunda escritura', async () => {
    const d = base()
    const roto = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    await registrarVistaModulo({ ...d, storage: roto, pathname: '/bitacora', usuario })
    await registrarVistaModulo({ ...d, storage: null, pathname: '/bitacora/historial', usuario })
    expect(d.escribir).toHaveBeenCalledTimes(1)
  })

  it('un rechazo de la regla se traga en silencio', async () => {
    const d = base()
    d.escribir.mockRejectedValueOnce(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }))
    await expect(registrarVistaModulo({ ...d, pathname: '/repuestos', usuario })).resolves.toBe(false)
  })

  it('no falla si sessionStorage lanza o no existe', async () => {
    const d = base()
    const roto = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
    await expect(registrarVistaModulo({ ...d, storage: roto, pathname: '/bitacora', usuario })).resolves.toBe(true)
    await expect(registrarVistaModulo({ ...d, storage: null, pathname: '/repuestos', usuario })).resolves.toBe(true)
  })

  it('no lanza si la escritura falla, y tampoco reintenta en el siguiente cambio de ruta', async () => {
    const d = base()
    d.escribir.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(registrarVistaModulo({ ...d, pathname: '/bitacora', usuario })).resolves.toBe(false)
    await registrarVistaModulo({ ...d, pathname: '/bitacora/historial', usuario })
    expect(d.escribir).toHaveBeenCalledTimes(1)
  })
})

describe('normalizarDocVistas', () => {
  it('cuenta usuarios únicos por la cantidad de hashes y ignora `ultimo`', () => {
    expect(
      normalizarDocVistas({ ultimo: 'inicio', inicio: { vistas: 3, claro: 2, oscuro: 1, cel: 1, pc: 2, u: { a: true, b: true } } }),
    ).toEqual({ inicio: { vistas: 3, claro: 2, oscuro: 1, cel: 1, pc: 2, usuarios: 2 } })
  })
  it('tolera campos faltantes', () => {
    expect(normalizarDocVistas({ aria: { vistas: 1 } })).toEqual({ aria: { vistas: 1, claro: 0, oscuro: 0, cel: 0, pc: 0, usuarios: 0 } })
  })
})
