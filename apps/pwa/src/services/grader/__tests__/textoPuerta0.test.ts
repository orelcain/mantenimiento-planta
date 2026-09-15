import { describe, it, expect } from 'vitest'
import { textoPuerta0 } from '../textoPuerta0'

describe('textoPuerta0', () => {
  it('en una línea con Grader dice de dónde sale el P0', () => {
    expect(textoPuerta0(true)).toMatch(/Excel del Grader/)
  })

  it('en Filete, que no pasa por Grader, no manda a buscar un Excel que no existe', () => {
    const t = textoPuerta0(false)
    expect(t).not.toMatch(/Excel/)
    expect(t).toMatch(/no pasa por Grader/)
  })
})
