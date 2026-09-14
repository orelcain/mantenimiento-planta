import { describe, it, expect } from 'vitest'
import { codigosEnConsulta, esTerminoNumerico, materialesPorCodigo, plantaSubiendo, listarEquiposConPlanta } from '../busquedaMaestro'

const MAESTRO = [
  { id: 'bendix', sap: '3300100386', fab: '' },
  { id: 'cil2a', sap: '3300138386', fab: '999 0571' },
  { id: 'cil2b', sap: '3300138387', fab: '' },
]

describe('codigosEnConsulta', () => {
  it('saca el código de una pregunta conversacional', () => {
    expect(codigosEnConsulta('en que equipos se usa el repuesto sap 3300138386')).toEqual(['3300138386'])
  })
  it('no confunde cantidades cortas con códigos', () => {
    expect(codigosEnConsulta('cuantos cilindros de 32 mm hay, necesito 12')).toEqual([])
  })
})

describe('materialesPorCodigo', () => {
  it('encuentra EXACTO el cilindro, no el bendix que difiere en dos dígitos', () => {
    // El caso real: ARIA dijo que 3300138386 no existía y ofreció 3300100386.
    expect(materialesPorCodigo(MAESTRO, ['3300138386']).map((m) => m.id)).toEqual(['cil2a'])
  })
  it('también por código de fabricante escrito sin espacios', () => {
    expect(materialesPorCodigo(MAESTRO, ['9990571']).map((m) => m.id)).toEqual(['cil2a'])
  })
  it('sin códigos no devuelve nada (sigue la búsqueda por palabras)', () => {
    expect(materialesPorCodigo(MAESTRO, [])).toEqual([])
  })
})

describe('esTerminoNumerico', () => {
  it('distingue números de palabras', () => {
    expect(esTerminoNumerico('3300138386')).toBe(true)
    expect(esTerminoNumerico('crhd')).toBe(false)
    expect(esTerminoNumerico('32x50')).toBe(false)
  })
})

describe('planta de cada equipo', () => {
  const padre = new Map<string, string | null>([
    ['raiz', null],
    ['pch', 'raiz'],
    ['pyal', 'raiz'],
    ['proc1', 'pch'],
    ['proc2', 'pyal'],
    ['kn1ch', 'proc1'],
    ['kn1yal', 'proc2'],
    ['huerfano', null],
  ])
  const nombre = new Map([
    ['raiz', 'Aquachile Antarfood'],
    ['pch', 'PLANTA CHONCHI'],
    ['pyal', 'PLANTA YAL'],
    ['proc1', 'PROCESO'],
    ['proc2', 'PROCESO'],
    ['kn1ch', 'KNURO N1'],
    ['kn1yal', 'KNURO N1'],
    ['huerfano', 'BOMBA SUELTA'],
  ])

  it('sube hasta la planta', () => {
    expect(plantaSubiendo('kn1yal', padre, nombre)).toBe('YAL')
    expect(plantaSubiendo('huerfano', padre, nombre)).toBeUndefined()
  })

  it('lista TODOS los equipos con su planta, no «KNURO N1 +1»', () => {
    expect(listarEquiposConPlanta(['kn1yal', 'kn1ch', 'huerfano'], padre, nombre)).toBe(
      'BOMBA SUELTA, KNURO N1 (CHONCHI), KNURO N1 (YAL)',
    )
  })

  it('una cadena con ciclo no cuelga', () => {
    const ciclo = new Map([['a', 'b'], ['b', 'a']])
    expect(plantaSubiendo('a', ciclo, new Map())).toBeUndefined()
  })
})
