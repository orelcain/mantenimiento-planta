import { describe, it, expect } from 'vitest'
import { enLasMaquinas, sinIntervencion, leyendaReparto } from '../textosPorMaquinas'

describe('frases de Mantención con UNA máquina (Filete)', () => {
  it('no dice «las 1 máquinas»', () => {
    expect(enLasMaquinas(1)).toBe('en la máquina')
    expect(sinIntervencion(1, 1)).toBe('La máquina cerró sin una sola intervención. ')
    expect(leyendaReparto(1)).not.toMatch(/\b1 barras\b|de un vistazo/)
  })

  it('una máquina con fallas no dice nada de intervenciones', () => {
    expect(sinIntervencion(0, 1)).toBe('')
  })
})

describe('frases de Mantención con tres Baader (Chonchi, Yal)', () => {
  it('conserva el texto de siempre', () => {
    expect(enLasMaquinas(3)).toBe('en las 3 máquinas')
    expect(sinIntervencion(3, 3)).toBe('Las 3 máquinas cerraron sin una sola intervención. ')
    expect(sinIntervencion(1, 3)).toBe('1 de 3 máquinas cerró sin una sola intervención. ')
    expect(sinIntervencion(2, 3)).toBe('2 de 3 máquinas cerraron sin una sola intervención. ')
    expect(leyendaReparto(3)).toMatch(/^Las 3 barras miden el mismo turno/)
  })
})
