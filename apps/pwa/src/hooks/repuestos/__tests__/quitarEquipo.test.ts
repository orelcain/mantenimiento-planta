import { describe, it, expect } from 'vitest'
import { quitarEquipoDeRepuesto } from '../quitarEquipo'

describe('quitarEquipoDeRepuesto', () => {
  // Caso real: válvula 34970060 asignada a seis Baader 142 y a una Baader 200.
  const valvula = {
    equipos: ['b142-n1', 'b142-n2', 'b200'],
    equiposCodigos: ['720004441', '720004447', '720004417'],
  }

  it('quita el equipo y su código por valor', () => {
    expect(quitarEquipoDeRepuesto(valvula, { nodeId: 'b200', codigo: '720004417' })).toEqual({
      equipos: ['b142-n1', 'b142-n2'],
      equiposCodigos: ['720004441', '720004447'],
    })
  })

  it('devuelve null si el repuesto no tenía ese equipo', () => {
    expect(quitarEquipoDeRepuesto(valvula, { nodeId: 'otro', codigo: '1' })).toBeNull()
  })

  it('quita el código s/c:<nombre> de un nodo sin código', () => {
    const r = { equipos: ['a', 'b'], equiposCodigos: ['720', 's/c:CINTA 3'] }
    expect(quitarEquipoDeRepuesto(r, { nodeId: 'b', nombre: 'CINTA 3' })?.equiposCodigos).toEqual(['720'])
  })

  it('sin código conocido, usa la posición solo si los arreglos son paralelos', () => {
    expect(quitarEquipoDeRepuesto(valvula, { nodeId: 'b142-n2' })?.equiposCodigos).toEqual(['720004441', '720004417'])
  })

  it('no toca equiposCodigos si no puede saber cuál es (arreglos desparejos tras una fusión)', () => {
    const r = { equipos: ['a', 'b', 'c'], equiposCodigos: ['1', '2'] }
    expect(quitarEquipoDeRepuesto(r, { nodeId: 'b', codigo: '999' })).toEqual({ equipos: ['a', 'c'], equiposCodigos: ['1', '2'] })
  })

  it('el código de otro equipo con el mismo valor no se pierde dos veces', () => {
    const r = { equipos: ['a', 'b'], equiposCodigos: ['720', '720'] }
    expect(quitarEquipoDeRepuesto(r, { nodeId: 'a', codigo: '720' })?.equiposCodigos).toEqual(['720'])
  })
})
