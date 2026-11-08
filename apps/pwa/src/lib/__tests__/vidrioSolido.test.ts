import { describe, expect, it, vi } from 'vitest'
import { esGamaBaja, marcarVidrioSolido } from '../vidrioSolido'

describe('esGamaBaja (vidrio sólido en gama baja)', () => {
  it('deviceMemory ≤ 4 GB marca vidrio sólido', () => {
    expect(esGamaBaja({ deviceMemory: 4 })).toBe(true)
    expect(esGamaBaja({ deviceMemory: 2 })).toBe(true)
  })

  it('hardwareConcurrency ≤ 4 marca vidrio sólido', () => {
    expect(esGamaBaja({ hardwareConcurrency: 4 })).toBe(true)
    expect(esGamaBaja({ hardwareConcurrency: 2 })).toBe(true)
  })

  it('equipo con 8 GB y 8 núcleos conserva el vidrio', () => {
    expect(esGamaBaja({ deviceMemory: 8, hardwareConcurrency: 8 })).toBe(false)
  })

  it('basta que uno de los dos sea bajo', () => {
    expect(esGamaBaja({ deviceMemory: 8, hardwareConcurrency: 4 })).toBe(true)
    expect(esGamaBaja({ deviceMemory: 4, hardwareConcurrency: 12 })).toBe(true)
  })

  it('sin datos (navegadores que no exponen deviceMemory) no marca nada', () => {
    expect(esGamaBaja({})).toBe(false)
    expect(esGamaBaja(null)).toBe(false)
    expect(esGamaBaja(undefined)).toBe(false)
  })
})

describe('marcarVidrioSolido', () => {
  function raizFalsa() {
    const toggle = vi.fn()
    return { raiz: { classList: { toggle } } as unknown as Pick<HTMLElement, 'classList'>, toggle }
  }

  it('deviceMemory 4 agrega la clase vidrio-solido a la raíz', () => {
    const { raiz, toggle } = raizFalsa()
    expect(marcarVidrioSolido(raiz, { deviceMemory: 4 })).toBe(true)
    expect(toggle).toHaveBeenCalledWith('vidrio-solido', true)
  })

  it('equipo de gama alta quita la clase (no la deja pegada de una carga anterior)', () => {
    const { raiz, toggle } = raizFalsa()
    expect(marcarVidrioSolido(raiz, { deviceMemory: 16, hardwareConcurrency: 8 })).toBe(false)
    expect(toggle).toHaveBeenCalledWith('vidrio-solido', false)
  })
})
