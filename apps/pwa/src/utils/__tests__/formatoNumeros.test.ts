import { describe, it, expect } from 'vitest'
import { dec1 } from '../formatoNumeros'

describe('dec1', () => {
  it('usa coma decimal, como el resto de la app', () => {
    expect(dec1(87.3)).toBe('87,3')
    expect(dec1(10.65)).toBe('10,7')
  })

  it('siempre muestra el decimal, para que la columna quede pareja', () => {
    expect(dec1(0)).toBe('0,0')
    expect(dec1(100)).toBe('100,0')
  })

  it('los miles llevan su separador', () => {
    expect(dec1(1234.5)).toBe('1.234,5')
  })

  it('un número que no existe no se escribe como «NaN»', () => {
    expect(dec1(NaN)).toBe('—')
    expect(dec1(Infinity)).toBe('—')
  })
})
