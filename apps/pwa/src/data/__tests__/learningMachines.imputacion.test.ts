import { describe, it, expect } from 'vitest'
import {
  LEARNING_MACHINES,
  CAPACITACION_AREA,
  findMachineBySlug,
  groupMachinesByArea,
  isCourseMachine,
} from '../learningMachines'

/**
 * El curso de imputacion es el primer tema de capacitacion SIN numero de modulo
 * (no pertenece al Programa de Electricidad). Estos tests fijan lo que eso
 * implica en el hub: que se agrupe como curso, que ordene al final y que la
 * tarjeta tenga un `programa` que mostrar en lugar del "Modulo N".
 */
describe('curso Imputacion de Fallas en el catalogo', () => {
  const curso = findMachineBySlug('imputacion-fallas')

  it('esta en el catalogo y es un curso', () => {
    expect(curso).toBeDefined()
    expect(curso!.area).toBe(CAPACITACION_AREA)
    expect(isCourseMachine(curso!)).toBe(true)
  })

  it('tiene las 4 secciones habilitadas', () => {
    expect(curso!.sections).toEqual({ manual: true, procedures: true, flows: true, diagnosis: true })
  })

  it('no tiene numero de modulo pero si programa (la tarjeta muestra el programa)', () => {
    expect(curso!.modulo).toBeUndefined()
    expect(curso!.programa).toBeTruthy()
  })

  it('queda al final del area de capacitacion, despues de los modulos numerados', () => {
    const cursos = groupMachinesByArea()[CAPACITACION_AREA]!
    expect(cursos[cursos.length - 1]!.slug).toBe('imputacion-fallas')
    const numerados = cursos.filter(c => c.modulo != null).map(c => c.modulo!)
    expect(numerados).toEqual([...numerados].sort((a, b) => a - b))
  })

  it('no colisiona con el color ni el slug de otro tema', () => {
    const slugs = LEARNING_MACHINES.map(m => m.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    const otros = LEARNING_MACHINES.filter(m => m.slug !== 'imputacion-fallas')
    expect(otros.some(m => m.color === curso!.color)).toBe(false)
  })
})
