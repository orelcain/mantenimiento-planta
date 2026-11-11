import { describe, expect, it } from 'vitest'
import { causaLegible } from '../ritmoVivo'

describe('causaLegible · la causa de la parada como se lee en pantalla', () => {
  it('la detención sin clasificar dice que no tiene causa anotada, con tilde', () => {
    expect(causaLegible('Detencion')).toBe('Detención, sin causa anotada')
    expect(causaLegible(' DETENCIÓN ')).toBe('Detención, sin causa anotada')
    expect(causaLegible('Micro detencion')).toBe('Micro detención, sin causa anotada')
  })
  it('una causa anotada pasa intacta; vacía o nula, no hay causa', () => {
    expect(causaLegible('Falta MMPP')).toBe('Falta MMPP')
    expect(causaLegible('Detención programada')).toBe('Detención programada')
    expect(causaLegible('  ')).toBeNull()
    expect(causaLegible(null)).toBeNull()
  })
})
