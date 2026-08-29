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
    expect(r.detalle).toBe('70 t a 4.600 g')
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

import { toneladasPorTramos } from '../cuotaEnToneladas'

describe('toneladasPorTramos', () => {
  const wall = (h: number, m: number) => new Date(Date.UTC(2026, 7, 28, h, m)).toISOString()
  const serie = [
    { t: wall(8, 0), pieces: 1000 },
    { t: wall(9, 0), pieces: 1000 },
    { t: wall(11, 0), pieces: 2000 },
  ]

  it('cada peso rige desde su hora hasta el siguiente — la suma es por tramos', () => {
    // Peso 5 kg registrado 08:30 (retro: cubre también las 08:00) y 4 kg a las 10:00.
    const r = toneladasPorTramos(serie, [
      { atWall: wall(8, 30), pesoKg: 5 },
      { atWall: wall(10, 0), pesoKg: 4 },
    ])!
    // Tramo 1: 2.000 pz × 5 kg = 10 t · Tramo 2: 2.000 pz × 4 kg = 8 t.
    expect(r.tramos.map((t) => t.piezas)).toEqual([2000, 2000])
    expect(r.total).toBeCloseTo(18, 10)
  })

  it('⚠ lo anterior al primer registro se valoriza con ESE peso, no se pierde', () => {
    const r = toneladasPorTramos(serie, [{ atWall: wall(12, 0), pesoKg: 5 }])!
    expect(r.tramos[0]!.piezas).toBe(4000)
    expect(r.total).toBeCloseTo(20, 10)
  })

  it('con UN registro equivale al cálculo plano de siempre', () => {
    const r = toneladasPorTramos(serie, [{ atWall: wall(7, 0), pesoKg: 4.5 }])!
    expect(r.total).toBeCloseTo((4000 * 4.5) / 1000, 10)
  })

  it('sin registros devuelve null: quien llama cae al cálculo plano', () => {
    expect(toneladasPorTramos(serie, [])).toBeNull()
  })
})
