/**
 * Orel (26-08): «están pidiendo TONELADAS, no cantidad de piezas… para hacer
 * 70 toneladas depende del peso promedio del pescado, entonces a veces la hacen
 * con 15.000 o más». Y las toneladas reales salen del Excel del Grader, que no
 * es en vivo: Shoplogix cuenta ciclos y no manda un solo kilo.
 */
import { describe, it, expect } from 'vitest'
import { piezasDeToneladas, toneladasDePiezas, PESO_MIN_KG, PESO_MAX_KG } from '../cuotaEnToneladas'

describe('piezasDeToneladas', () => {
  it('70 t con pescado de 4,6 kg son ~15.200 piezas', () => {
    const r = piezasDeToneladas(70, 4.6)
    expect(r.piezas).toBe(15_217)
    expect(r.detalle).toBe('70 t a 4,6 kg')
  })

  it('el mismo pedido con pescado más chico son más piezas', () => {
    expect(piezasDeToneladas(70, 4).piezas).toBe(17_500)
    expect(piezasDeToneladas(70, 5.5).piezas).toBe(12_727)
  })

  it('rechaza pesos que no son de un salmón', () => {
    expect(() => piezasDeToneladas(70, 0.1)).toThrow(/peso promedio/i)
    expect(() => piezasDeToneladas(70, 40)).toThrow(/peso promedio/i)
    expect(() => piezasDeToneladas(70, PESO_MIN_KG)).not.toThrow()
    expect(() => piezasDeToneladas(70, PESO_MAX_KG)).not.toThrow()
  })

  it('rechaza toneladas vacías', () => {
    expect(() => piezasDeToneladas(0, 4.6)).toThrow(/toneladas/i)
  })
})

describe('toneladasDePiezas', () => {
  it('estima las toneladas que van con lo producido', () => {
    expect(toneladasDePiezas(8000, 4.6)).toBeCloseTo(36.8, 1)
  })

  it('sin peso no inventa', () => {
    expect(toneladasDePiezas(8000, 0)).toBeNull()
  })

  it('ida y vuelta cierra', () => {
    const piezas = piezasDeToneladas(70, 4.6).piezas
    expect(toneladasDePiezas(piezas, 4.6)).toBeCloseTo(70, 1)
  })
})
