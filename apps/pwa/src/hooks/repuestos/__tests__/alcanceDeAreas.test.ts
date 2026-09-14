import { describe, it, expect } from 'vitest'
import { areaContenedora, conteosConfiables } from '../alcanceDeAreas'

// Cadena real (hierarchy, 14-09): BOMBA VACIO EN SECO N1 ← EVISCERADORA BAADER 142 N2 ← EVISCERADO.
const PADRE_DE_EQUIPO = new Map<string, string | null>([
  ['bombaVacioSeco', 'kRbjM6jI0bD60l5ABNPD'],
  ['kRbjM6jI0bD60l5ABNPD', 'evisceradoYal'],
])

describe('areaContenedora', () => {
  it('un subequipo sube hasta el área, no se queda en el equipo padre', () => {
    expect(areaContenedora('bombaVacioSeco', PADRE_DE_EQUIPO)).toBe('evisceradoYal')
  })

  it('el id guardado de un equipo (lo que dejaba el hub en localStorage) se corrige al área', () => {
    expect(areaContenedora('kRbjM6jI0bD60l5ABNPD', PADRE_DE_EQUIPO)).toBe('evisceradoYal')
  })

  it('un área queda como está', () => {
    expect(areaContenedora('aq-in-cho-pyal', PADRE_DE_EQUIPO)).toBe('aq-in-cho-pyal')
  })

  it('sin nodo, o equipo sin padre, no hay área', () => {
    expect(areaContenedora(null, PADRE_DE_EQUIPO)).toBeNull()
    expect(areaContenedora('suelto', new Map([['suelto', null]]))).toBeNull()
  })

  it('un ciclo en la jerarquía no cuelga', () => {
    expect(areaContenedora('a', new Map([['a', 'b'], ['b', 'a']]))).toBeNull()
  })
})

describe('conteosConfiables', () => {
  const conteos = { chonchi: 1961, yal: 1961, evisceradoYal: 1803, patio: 0 }
  const debajo = (n: string, a: string) => n === 'evisceradoYal' && a === 'yal'

  it('con solo PLANTA YAL cargada, Chonchi NO muestra un 1961 que en realidad es 4.409', () => {
    expect(conteosConfiables(conteos, false, ['yal'], debajo)).toEqual({ yal: 1961, evisceradoYal: 1803 })
  })

  it('con el catálogo completo se muestran todos', () => {
    expect(conteosConfiables(conteos, true, [], debajo)).toEqual(conteos)
  })

  it('sin nada cargado no se muestra ningún número', () => {
    expect(conteosConfiables(conteos, false, [], debajo)).toEqual({})
  })
})
