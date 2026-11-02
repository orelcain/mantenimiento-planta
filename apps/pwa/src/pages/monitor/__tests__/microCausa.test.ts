import { describe, expect, it } from 'vitest'
import {
  ARRANQUE_PARADA_MIN_S, ARRANQUE_VENTANA_S, CARROS_BAJOS, CAUSAS_MICRO, LINEA_COMUN_TOL_S, TRAS_DETENCION_S,
  clasificarMicros, contarPorCausa, realEstimadoS, type EntradaMicroCausa,
} from '../microCausa'

const T0 = Date.parse('2026-11-02T09:15:00.000Z')
const iso = (seg: number) => new Date(T0 + seg * 1000).toISOString()
const ESP = [18, 16, 16]
const ids = ['a', 'b', 'c']
/** Tres Baader con el esperado de Chonchi (18/16/16) y `n` minutos andando al ritmo dado (por defecto, el esperado). */
const serie = (n = 60, ritmo: (j: number, k: number) => number = (j) => ESP[j]!, nMaq = 3) => ({
  desde: iso(0),
  maquinas: ids.slice(0, nMaq).map((id, j) => ({ id, nombre: `Evisceradora ${j + 1}`, esperado: ESP[j]!, cycles: Array.from({ length: n }, (_, k) => ritmo(j, k)) })),
})
/** r: 0 = «Detencion», 1 = «Micro Detencion». m = índice de la Baader. */
const parada = (seg: number, s: number, m: number) => ({ r: 0, f: iso(seg), s, m })
const micro = (seg: number, s: number, m: number) => ({ r: 1, f: iso(seg), s, m })
const entrada = (stopEvents: EntradaMicroCausa['stopEvents'], serieX = serie(), extra: Partial<EntradaMicroCausa> = {}): EntradaMicroCausa => ({
  serie: serieX,
  stopEvents,
  stopReasons: ['Detencion', 'Micro Detencion'],
  stopMachines: ids.slice(0, serieX.maquinas.length),
  inicioTurnoMs: T0,
  ...extra,
})
/** Todas las micro vienen DESPUÉS de los primeros 10 min: así el arranque no tapa la regla que se prueba. */
const T = 1800

describe('microCausa · una regla por caso', () => {
  it('arranque: hasta 600 s después del fin de una parada de 600 s o más de esa Baader', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S, 0), micro(T + 600 + 599, 15, 0)]))
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ causa: 'arranque', fila: 0, duracionS: 15 })
    expect(r[0]!.porque).toContain('10 min')
  })

  it('arranque: una parada de menos de 600 s no abre el arranque', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S - 1, 0), micro(T + 599 + 300, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: 600 s o más después del fin de la pausa ya no lo es', () => {
    const r = clasificarMicros(entrada([parada(T, ARRANQUE_PARADA_MIN_S, 0), micro(T + 600 + ARRANQUE_VENTANA_S, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: la pausa de otra Baader no cuenta', () => {
    const r = clasificarMicros(entrada([parada(T, 900, 1), micro(T + 900 + 60, 15, 0)]))
    expect(r[0]!.causa).not.toBe('arranque')
  })

  it('arranque: los primeros 600 s del turno', () => {
    const r = clasificarMicros(entrada([micro(ARRANQUE_VENTANA_S - 15, 15, 2)]))
    expect(r[0]).toMatchObject({ causa: 'arranque', fila: 2 })
    expect(r[0]!.porque).toContain('primeros 10 min del turno')
    expect(clasificarMicros(entrada([micro(ARRANQUE_VENTANA_S, 15, 2)]))[0]!.causa).not.toBe('arranque')
  })

  it('línea común: otra Baader marca micro con inicio a ±15 s (las dos quedan marcadas)', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S, 30, 2)]))
    expect(r.map((x) => x.causa)).toEqual(['linea', 'linea'])
    expect(r[0]!.porque).toContain('Ev 3')
    expect(r[1]!.porque).toContain('Ev 1')
  })

  it('línea común: a más de 15 s ya no coincide', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 0), micro(T + LINEA_COMUN_TOL_S + 1, 15, 2)]))
    expect(r.map((x) => x.causa)).not.toContain('linea')
  })

  it('tras detención: hasta 120 s después del fin de una detención (no micro) de esa Baader', () => {
    const r = clasificarMicros(entrada([parada(T, 200, 1), micro(T + 200 + TRAS_DETENCION_S - 1, 15, 1)]))
    expect(r[0]).toMatchObject({ causa: 'paro', fila: 1 })
    expect(clasificarMicros(entrada([parada(T, 200, 1), micro(T + 200 + TRAS_DETENCION_S, 15, 1)]))[0]!.causa).not.toBe('paro')
  })

  it('tras detención: otra micro anterior no abre la ventana (solo las detenciones que no son micro)', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 1), micro(T + 15 + 30, 15, 1)]))
    expect(r.map((x) => x.causa)).toEqual(['sin', 'sin'])
  })

  it('carros vacíos: el minuto anterior anduvo ≥ 30 s y dio menos de 0,75 × esperado', () => {
    /* Ev 2 (esperado 16) da 11 en el minuto 29; la micro cae en el 30. 11 < 0,75 × 16 = 12. Las otras vienen normales. */
    const s = serie(60, (j, k) => (j === 1 && k === 29 ? 11 : ESP[j]!))
    const r = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)], s))
    expect(r[0]).toMatchObject({ causa: 'carros', fila: 1 })
    expect(r[0]!.porque).toContain('11 de 16')
    expect(r[0]!.porque).not.toContain('falta de pescado')
    expect(CARROS_BAJOS).toBe(0.75)
  })

  it('carros vacíos: justo en 0,75 × esperado no cuenta; sin esperado tampoco', () => {
    const justo = serie(60, (j, k) => (j === 1 && k === 29 ? 12 : ESP[j]!))
    expect(clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)], justo))[0]!.causa).toBe('sin')
    const sinEsp = serie(60, (j, k) => (j === 1 && k === 29 ? 2 : ESP[j]!))
    sinEsp.maquinas[1]!.esperado = null as unknown as number
    expect(clasificarMicros(entrada([micro(30 * 60 + 5, 15, 1)], sinEsp))[0]!.causa).toBe('sin')
  })

  it('carros vacíos: la vara es lo que daba ANDANDO (30 s parada en el minuto anterior bajan el listón a la mitad)', () => {
    /* Ev 2 tuvo una micro de 30 s en el minuto 29 (anduvo 30 s): la vara es 0,75 × 16 × 30/60 = 6. 7 piezas no es bajo; 5 sí. */
    const con = (piezas: number) => clasificarMicros(entrada([micro(29 * 60 + 10, 30, 1), micro(30 * 60 + 40, 15, 1)], serie(60, (j, k) => (j === 1 && k === 29 ? piezas : ESP[j]!)))).slice(-1)[0]!
    expect(con(7).causa).toBe('sin')
    expect(con(5).causa).toBe('carros')
  })

  it('carros vacíos: si las tres venían bajas, el texto dice «falta de pescado en la línea»', () => {
    const s = serie(60, (j, k) => (k === 29 ? Math.floor(ESP[j]! * 0.5) : ESP[j]!))
    const r = clasificarMicros(entrada([micro(30 * 60 + 5, 15, 0)], s))
    expect(r[0]!.causa).toBe('carros')
    expect(r[0]!.porque).toContain('las tres Baader venían bajas: falta de pescado en la línea')
  })

  it('sin contexto: el resto', () => {
    const r = clasificarMicros(entrada([micro(T, 15, 0)]))
    expect(r[0]).toMatchObject({ causa: 'sin', porque: 'ningún contexto de Shoplogix la explica' })
  })
})

describe('microCausa · precedencia', () => {
  it('arranque gana a línea común, tras detención y carros vacíos', () => {
    /* Parada larga de Ev 1; 2 min después, micro de Ev 1 y de Ev 2 a la vez, con el minuto anterior bajo. */
    const s = serie(60, (j, k) => (k === 31 ? 3 : ESP[j]!))
    const r = clasificarMicros(entrada([parada(T, 700, 0), micro(T + 700 + 100, 15, 0), micro(T + 700 + 100, 15, 1)], s))
    expect(r.find((x) => x.fila === 0)!.causa).toBe('arranque')
  })

  it('línea común gana a tras detención y a carros vacíos', () => {
    const s = serie(60, (j, k) => (k === 29 ? 3 : ESP[j]!))
    const r = clasificarMicros(entrada([parada(T - 100, 60, 1), micro(T, 15, 1), micro(T + 15, 15, 2)], s))
    expect(r.find((x) => x.fila === 1)!.causa).toBe('linea')
  })

  it('tras detención gana a carros vacíos', () => {
    const s = serie(60, (j, k) => (k === 29 ? 3 : ESP[j]!))
    const r = clasificarMicros(entrada([parada(T - 200, 100, 0), micro(T, 15, 0)], s))
    expect(r[0]!.causa).toBe('paro')
  })
})

describe('microCausa · el ritmo alrededor', () => {
  it('trae el minuto anterior, el de la micro y el siguiente de esa Baader y las otras en ese minuto', () => {
    const s = serie(60, (j, k) => (j === 0 ? 100 + k : ESP[j]!))
    const [m] = clasificarMicros(entrada([micro(T + 13, 15, 0), micro(T + 14, 15, 1)], s)).filter((x) => x.fila === 0)
    expect(m!.minuto).toBe(30)
    expect(m!.ritmo).toEqual({ anterior: 129, micro: 130, siguiente: 131, esperado: 18 })
    expect(m!.otras.map((o) => [o.nombre, o.piezas, o.esperado])).toEqual([['Evisceradora 2', 16, 16], ['Evisceradora 3', 16, 16]])
  })

  it('en los bordes de la serie el minuto que no existe es null', () => {
    const s = serie(31)
    const r = clasificarMicros(entrada([micro(T, 15, 0)], s))
    expect(r[0]!.ritmo.siguiente).toBeNull()
    expect(clasificarMicros(entrada([micro(5, 15, 0)], serie(5)))[0]!.ritmo.anterior).toBeNull()
  })

  it('«real estimado» = lo anotado + ~20 s', () => {
    expect(realEstimadoS(15)).toBe(35)
  })
})

describe('microCausa · Filete (una sola Baader) y sin datos', () => {
  it('con una Baader la línea común no aplica; el resto de las reglas sí', () => {
    const s = serie(60, (j, k) => (k === 29 ? 5 : ESP[j]!), 1)
    const r = clasificarMicros(entrada([micro(T, 15, 0), micro(T + 15, 15, 0), micro(5, 15, 0)], s))
    const porSeg = r.map((x) => x.causa)
    expect(porSeg).toEqual(['arranque', 'carros', 'carros'])
    expect(r.every((x) => x.otras.length === 0)).toBe(true)
  })

  it('con una Baader baja no dice «falta de pescado» (no hay con quién compararla)', () => {
    const s = serie(60, (j, k) => (k === 29 ? 5 : ESP[j]!), 1)
    const r = clasificarMicros(entrada([micro(T, 15, 0)], s))
    expect(r[0]!.causa).toBe('carros')
    expect(r[0]!.porque).not.toContain('falta de pescado')
  })

  it('sin serie, sin stopMachines, sin eventos o con un evento sin máquina: lista vacía', () => {
    expect(clasificarMicros({ serie: null, stopEvents: [micro(T, 15, 0)], stopMachines: ids, stopReasons: ['Detencion', 'Micro Detencion'], inicioTurnoMs: T0 })).toEqual([])
    expect(clasificarMicros(entrada([micro(T, 15, 0)], serie(), { stopMachines: [] }))).toEqual([])
    expect(clasificarMicros(entrada([]))).toEqual([])
    expect(clasificarMicros(entrada(null))).toEqual([])
    expect(clasificarMicros(entrada([{ r: 1, f: iso(T), s: 15 }]))).toEqual([])
  })

  it('ignora lo que no es micro y los eventos de 0 s; el nombre de la razón llega con acentos inconsistentes', () => {
    const e = entrada([parada(T, 100, 0), { r: 1, f: iso(T + 500), s: 0, m: 0 }, micro(T + 900, 15, 0)])
    e.stopReasons = ['Detención', 'Micro Detención']
    const r = clasificarMicros(e)
    expect(r).toHaveLength(1)
    expect(r[0]!.duracionS).toBe(15)
  })

  it('cuenta por causa en el orden de las chips', () => {
    const r = clasificarMicros(entrada([micro(5, 15, 0), micro(T, 15, 0), micro(T + 600, 15, 1)]))
    expect(contarPorCausa(r)).toEqual({ arranque: 1, linea: 0, paro: 0, carros: 0, sin: 2 })
    expect([...CAUSAS_MICRO]).toEqual(['arranque', 'linea', 'paro', 'carros', 'sin'])
  })
})
