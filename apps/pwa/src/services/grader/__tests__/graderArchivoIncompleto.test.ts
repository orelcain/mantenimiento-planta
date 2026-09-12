import { describe, it, expect } from 'vitest'
import { avisoDeArchivoIncompleto } from '../graderArchivoIncompleto'

describe('avisoDeArchivoIncompleto', () => {
  it('el caso medido: la hoja declara 308.539 filas y no trajo ninguna celda', () => {
    const a = avisoDeArchivoIncompleto('A1:K308539', 0)
    expect(a).toContain('308.539 filas')
    expect(a).toContain('volvé a exportarlo')
  })

  it('no dice nada si la hoja trajo celdas', () => {
    expect(avisoDeArchivoIncompleto('A1:K169704', 169704 * 11)).toBeNull()
  })

  it('no dice nada con una hoja genuinamente vacía', () => {
    expect(avisoDeArchivoIncompleto('A1', 0)).toBeNull()
    expect(avisoDeArchivoIncompleto(undefined, 0)).toBeNull()
  })
})
