import { describe, expect, it } from 'vitest'
import { nombreEquipoLegible } from '../nombreEquipo'

describe('nombre del equipo legible', () => {
  it('pasa las MAYÚSCULAS de SAP a frase, conservando siglas, modelos y marcas', () => {
    expect(nombreEquipoLegible('DESPLAZADOR AUTOMATICO 1')).toBe('Desplazador automático 1')
    expect(nombreEquipoLegible('TOLVA GENERAL RILES')).toBe('Tolva general RILES')
    expect(nombreEquipoLegible('EVISCERADORA BAADER 142 N1')).toBe('Evisceradora Baader 142 N1')
    expect(nombreEquipoLegible('CINTA ALIMENTACION GEA')).toBe('Cinta alimentación GEA')
    expect(nombreEquipoLegible('CINTAS FILETE Y HG')).toBe('Cintas filete y HG')
    expect(nombreEquipoLegible('EMPACADORA E-PACK')).toBe('Empacadora E-PACK')
    expect(nombreEquipoLegible('CELDA CARGA AK300 MARELEC STATIC GRADER')).toBe('Celda carga AK300 Marelec static grader')
  })

  it('respeta lo escrito a mano y lo vacío', () => {
    expect(nombreEquipoLegible('Grader MS4/12')).toBe('Grader MS4/12')
    expect(nombreEquipoLegible('Sala de bombas NH₃')).toBe('Sala de bombas NH₃')
    expect(nombreEquipoLegible('  ')).toBe('')
    expect(nombreEquipoLegible(null)).toBe('')
  })
})
