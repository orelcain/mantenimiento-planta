import { describe, it, expect } from 'vitest'
import { agregarEquipoARepuesto } from '../asignarEquipo'

describe('agregarEquipoARepuesto', () => {
  it('agrega el id y el código del nodo', () => {
    const rep = { equipos: ['a'], equiposCodigos: ['720'] }
    expect(agregarEquipoARepuesto(rep, { id: 'b', nombre: 'CINTA 3', codigo: ' 999 ' })).toEqual({
      equipos: ['a', 'b'],
      equiposCodigos: ['720', '999'],
    })
  })

  it('sin código usa s/c:<nombre>', () => {
    expect(agregarEquipoARepuesto({}, { id: 'b', nombre: 'CINTA 3' })).toEqual({
      equipos: ['b'],
      equiposCodigos: ['s/c:CINTA 3'],
    })
  })

  it('devuelve null si el equipo ya estaba', () => {
    expect(agregarEquipoARepuesto({ equipos: ['b'], equiposCodigos: ['1'] }, { id: 'b', nombre: 'X' })).toBeNull()
  })
})
