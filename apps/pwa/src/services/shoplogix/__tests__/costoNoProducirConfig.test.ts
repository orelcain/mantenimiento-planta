import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/firestoreTracked', () => ({
  doc: vi.fn((...args: unknown[]) => ({ ruta: args.slice(1).join('/') })),
  getDoc: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  serverTimestamp: vi.fn(() => 'TS'),
}))
vi.mock('../../firebase', () => ({ db: {} }))

import { doc, getDoc, setDoc } from '@/services/firestoreTracked'
import {
  configVacia,
  guardarMargen,
  leerConfigCostoNoProducir,
  normalizarConfigCostoNoProducir,
  validarMargen,
  type ArgsGuardarMargen,
} from '../costoNoProducirConfig'

const BASE: ArgsGuardarMargen = {
  lineId: 'filete',
  margenPorKg: 500,
  moneda: 'CLP',
  vigenteDesde: '2026-11-19',
  tipoCambioClpPorUsd: null,
  autor: 'admin@test',
}

describe('normalizarConfigCostoNoProducir', () => {
  it('un documento que no existe o viene vacío da la config vacía', () => {
    expect(normalizarConfigCostoNoProducir(undefined)).toEqual(configVacia())
    expect(normalizarConfigCostoNoProducir(null)).toEqual(configVacia())
    expect(normalizarConfigCostoNoProducir('basura')).toEqual(configVacia())
    expect(normalizarConfigCostoNoProducir({})).toEqual({ tipoCambioClpPorUsd: null, lineas: {} })
  })

  it('un tipo de cambio que no es número positivo queda en null', () => {
    expect(normalizarConfigCostoNoProducir({ tipoCambioClpPorUsd: 0 }).tipoCambioClpPorUsd).toBeNull()
    expect(normalizarConfigCostoNoProducir({ tipoCambioClpPorUsd: '950' }).tipoCambioClpPorUsd).toBeNull()
    expect(normalizarConfigCostoNoProducir({ tipoCambioClpPorUsd: 950 }).tipoCambioClpPorUsd).toBe(950)
  })

  it('descarta las entradas mal formadas y conserva las buenas, sin tumbar la lectura', () => {
    const cfg = normalizarConfigCostoNoProducir({
      tipoCambioClpPorUsd: 950,
      lineas: {
        filete: [
          { margenPorKg: 500, moneda: 'CLP', vigenteDesde: '2026-11-01', autor: 'a', guardadoEn: '2026-11-01T10:00:00.000Z' },
          { margenPorKg: -1, moneda: 'CLP', vigenteDesde: '2026-11-01' },
          { margenPorKg: 5, moneda: 'EUR', vigenteDesde: '2026-11-01' },
          { margenPorKg: 5, moneda: 'CLP', vigenteDesde: '01-11-2026' },
          { margenPorKg: 'mucho', moneda: 'CLP', vigenteDesde: '2026-11-01' },
          null,
        ],
        yal: 'no es un arreglo',
        '': [{ margenPorKg: 1, moneda: 'CLP', vigenteDesde: '2026-11-01' }],
        vacia: [{ margenPorKg: 1 }],
      },
    })
    expect(Object.keys(cfg.lineas)).toEqual(['filete'])
    expect(cfg.lineas.filete).toEqual([
      { margenPorKg: 500, moneda: 'CLP', vigenteDesde: '2026-11-01', autor: 'a', guardadoEn: '2026-11-01T10:00:00.000Z' },
    ])
  })
})

describe('validarMargen', () => {
  it('acepta un margen CLP bien formado', () => {
    expect(validarMargen(BASE)).toBeNull()
  })

  it('rechaza un margen de cero o negativo', () => {
    expect(validarMargen({ ...BASE, margenPorKg: 0 })).toMatch(/mayor que cero/)
    expect(validarMargen({ ...BASE, margenPorKg: -3 })).toMatch(/mayor que cero/)
    expect(validarMargen({ ...BASE, margenPorKg: Number.NaN })).toMatch(/mayor que cero/)
  })

  it('en USD exige un tipo de cambio mayor que cero', () => {
    expect(validarMargen({ ...BASE, moneda: 'USD', margenPorKg: 2, tipoCambioClpPorUsd: null })).toMatch(/tipo de cambio/)
    expect(validarMargen({ ...BASE, moneda: 'USD', margenPorKg: 2, tipoCambioClpPorUsd: 0 })).toMatch(/tipo de cambio/)
    expect(validarMargen({ ...BASE, moneda: 'USD', margenPorKg: 2, tipoCambioClpPorUsd: 950 })).toBeNull()
  })

  it('el equivalente en CLP tiene que caber en el rango', () => {
    expect(validarMargen({ ...BASE, margenPorKg: 0.5 })).toMatch(/entre \$1 y \$100\.000/)
    expect(validarMargen({ ...BASE, margenPorKg: 150_000 })).toMatch(/entre \$1 y \$100\.000/)
    // 2 USD × 950 = 1.900 CLP: dentro del rango aunque el número en USD sea chico.
    expect(validarMargen({ ...BASE, moneda: 'USD', margenPorKg: 2, tipoCambioClpPorUsd: 950 })).toBeNull()
    // 200 USD × 950 = 190.000 CLP: fuera.
    expect(validarMargen({ ...BASE, moneda: 'USD', margenPorKg: 200, tipoCambioClpPorUsd: 950 })).toMatch(/entre/)
  })

  it('la fecha tiene que ser AAAA-MM-DD', () => {
    expect(validarMargen({ ...BASE, vigenteDesde: '19-11-2026' })).toMatch(/AAAA-MM-DD/)
    expect(validarMargen({ ...BASE, vigenteDesde: '' })).toMatch(/AAAA-MM-DD/)
  })

  it('sin línea no se guarda', () => {
    expect(validarMargen({ ...BASE, lineId: '' })).toMatch(/línea/)
  })
})

describe('leerConfigCostoNoProducir y guardarMargen', () => {
  beforeEach(() => {
    vi.mocked(getDoc).mockReset()
    vi.mocked(setDoc).mockClear()
  })

  it('si la lectura falla (permiso) devuelve null, no una config inventada', async () => {
    vi.mocked(getDoc).mockRejectedValueOnce(new Error('permission-denied'))
    await expect(leerConfigCostoNoProducir()).resolves.toBeNull()
  })

  it('sin documento devuelve la config vacía', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never)
    await expect(leerConfigCostoNoProducir()).resolves.toEqual(configVacia())
  })

  it('agrega el margen al historial de su línea sin pisar lo anterior ni el tipo de cambio', async () => {
    const previo = { margenPorKg: 450, moneda: 'CLP', vigenteDesde: '2026-10-01', autor: 'x', guardadoEn: null }
    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ tipoCambioClpPorUsd: 950, lineas: { filete: [previo], yal: [{ ...previo, margenPorKg: 300 }] } }),
    } as never)

    const nueva = await guardarMargen({ ...BASE, margenPorKg: 500, vigenteDesde: '2026-11-19' })

    expect(doc).toHaveBeenCalled()
    expect(setDoc).toHaveBeenCalledTimes(1)
    const [, payload, opciones] = vi.mocked(setDoc).mock.calls[0] as unknown as [unknown, Record<string, unknown>, unknown]
    expect(opciones).toEqual({ merge: true })
    expect(payload.updatedAt).toBe('TS')
    expect(payload.tipoCambioClpPorUsd).toBe(950)
    const lineas = payload.lineas as Record<string, Array<Record<string, unknown>>>
    const filete = lineas.filete ?? []
    expect(filete).toHaveLength(2)
    expect(filete[0]).toEqual(previo)
    expect(filete[1]).toMatchObject({ margenPorKg: 500, moneda: 'CLP', vigenteDesde: '2026-11-19', autor: 'admin@test' })
    expect(typeof filete[1]?.guardadoEn).toBe('string')
    expect(lineas.yal ?? []).toHaveLength(1)
    expect(nueva.lineas.filete ?? []).toHaveLength(2)
  })

  it('un tipo de cambio mayor que cero sí se guarda; sin él (CLP) no se pisa el que había', async () => {
    vi.mocked(getDoc).mockResolvedValueOnce({ exists: () => false, data: () => undefined } as never)
    await guardarMargen({ ...BASE, tipoCambioClpPorUsd: 900 })
    const primero = vi.mocked(setDoc).mock.calls[0]?.[1] as Record<string, unknown> | undefined
    expect(primero?.tipoCambioClpPorUsd).toBe(900)

    vi.mocked(getDoc).mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ tipoCambioClpPorUsd: 950, lineas: {} }),
    } as never)
    await guardarMargen({ ...BASE, tipoCambioClpPorUsd: null })
    const segundo = vi.mocked(setDoc).mock.calls[1]?.[1] as Record<string, unknown> | undefined
    expect(segundo?.tipoCambioClpPorUsd).toBe(950)
  })

  it('una validación que falla no toca Firestore y lanza en español', async () => {
    await expect(guardarMargen({ ...BASE, margenPorKg: 0 })).rejects.toThrow(/mayor que cero/)
    expect(getDoc).not.toHaveBeenCalled()
    expect(setDoc).not.toHaveBeenCalled()
  })
})
