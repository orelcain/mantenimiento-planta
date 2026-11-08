// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { mostrarEnInicio } from '../MobileHomeGrid'

// «En desarrollo» se oculta en el Inicio móvil para todos menos el admin, que la ve y la libera.
describe('mostrarEnInicio', () => {
  it('oculta una fila en desarrollo para quien no es admin', () => {
    expect(mostrarEnInicio(true, false)).toBe(false)
  })

  it('muestra una fila en desarrollo al admin', () => {
    expect(mostrarEnInicio(true, true)).toBe(true)
  })

  it('muestra una fila sin desarrollo a cualquiera', () => {
    expect(mostrarEnInicio(false, false)).toBe(true)
    expect(mostrarEnInicio(false, true)).toBe(true)
  })
})
