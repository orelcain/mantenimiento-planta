import { describe, it, expect } from 'vitest'
import { apodosCambiaron, apodosDesdeTexto } from '../apodosDeRepuesto'

describe('apodosCambiaron', () => {
  it('abrir y cerrar sin escribir NO es un cambio (el ANILLO 35310055 quedó escrito por eso)', () => {
    expect(apodosCambiaron(undefined, apodosDesdeTexto(''))).toBe(false)
    expect(apodosCambiaron([], apodosDesdeTexto('   '))).toBe(false)
  })

  it('el mismo valor re-guardado tampoco', () => {
    const cilindro = ['Cilindro 2B Herramienta 2 knuro']
    expect(apodosCambiaron(cilindro, apodosDesdeTexto(cilindro.join(', ')))).toBe(false)
    expect(apodosCambiaron(['a', 'b'], apodosDesdeTexto(' a ,b, '))).toBe(false)
  })

  it('agregar, quitar, reordenar o corregir mayúsculas SÍ es un cambio', () => {
    expect(apodosCambiaron(undefined, ['resorte carros'])).toBe(true)
    expect(apodosCambiaron(['a', 'b'], ['a'])).toBe(true)
    expect(apodosCambiaron(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(apodosCambiaron(['knuro'], ['Knuro'])).toBe(true)
  })
})
