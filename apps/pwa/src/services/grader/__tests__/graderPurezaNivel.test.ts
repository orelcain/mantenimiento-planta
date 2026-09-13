import { describe, it, expect } from 'vitest'
import { nivelDePureza, bloqueDeCaida, promedioHasta , puertaQueAbreSola } from '../graderPurezaNivel'

describe('nivelDePureza', () => {
  it('aplica los umbrales 95 / 85 y trata null como sin asignación', () => {
    expect(nivelDePureza(100)).toBe('ok')
    expect(nivelDePureza(95)).toBe('ok')
    expect(nivelDePureza(94.9)).toBe('warn')
    expect(nivelDePureza(85)).toBe('warn')
    expect(nivelDePureza(84.9)).toBe('crit')
    expect(nivelDePureza(null)).toBe('none')
    expect(nivelDePureza(undefined)).toBe('none')
  })
})

describe('bloqueDeCaida', () => {
  it('encuentra el bloque desde el que la puerta no se recupera', () => {
    expect(bloqueDeCaida([96, 97, 95, 96, 94, 96, 88, 62, 55, 58, 61])).toBe(7)
  })

  it('ignora un bloque malo aislado si después vuelve a estar bien', () => {
    expect(bloqueDeCaida([96, 40, 97, 96, 98])).toBeNull()
  })

  it('salta los bloques sin piezas', () => {
    expect(bloqueDeCaida([null, 96, null, 60, null, 55])).toBe(3)
  })

  it('devuelve 0 si estuvo mezclada desde el inicio y null si nunca cayó', () => {
    expect(bloqueDeCaida([60, 55, 70])).toBe(0)
    expect(bloqueDeCaida([96, 99, 95])).toBeNull()
    expect(bloqueDeCaida([])).toBeNull()
  })
})

describe('promedioHasta', () => {
  it('promedia solo los bloques con dato anteriores al índice', () => {
    expect(promedioHasta([96, null, 94, 60], 3)).toBe(95)
    expect(promedioHasta([null, null], 2)).toBeNull()
  })
})

describe('puertaQueAbreSola', () => {
  const p = (gate: number, pct: number | null) => ({ gate, pct })

  it('no abre nada si todas las puertas están puras', () => {
    // El caso mayoritario. El detalle mide 1.288 px a 375 px: desplegarlo para
    // decir que está todo bien es el 39 % de la pestaña gastado en nada.
    expect(puertaQueAbreSola([p(1, 100), p(2, 99), p(3, 95)])).toBeNull()
  })

  it('abre en la peor puerta cuando hay mezcla real', () => {
    expect(puertaQueAbreSola([p(1, 100), p(2, 72), p(3, 88)])).toBe(2)
  })

  it('95 % está puro y 94,9 % no: la frontera se prueba', () => {
    expect(puertaQueAbreSola([p(7, 95)])).toBeNull()
    expect(puertaQueAbreSola([p(7, 94.9)])).toBe(7)
  })

  it('una puerta con seteo distinto ya NO abre el detalle sola', () => {
    // Hasta el 10-09 abría también acá: «seteo distinto» es un aviso de
    // configuración que la grilla ya marca, no un problema de proceso.
    expect(puertaQueAbreSola([p(1, 100), p(4, 100)], new Set([4]))).toBeNull()
  })

  it('la puerta con seteo distinto no puede ser elegida como la peor', () => {
    // Su porcentaje se mide contra un seteo que no es el de la máquina, así
    // que sería baja por una razón que no es mezcla.
    expect(puertaQueAbreSola([p(1, 100), p(4, 30), p(9, 80)], new Set([4]))).toBe(9)
  })

  it('ignora las puertas sin dato y no abre si no queda ninguna', () => {
    expect(puertaQueAbreSola([p(1, null), p(2, null)])).toBeNull()
    expect(puertaQueAbreSola([p(1, null), p(2, 60)])).toBe(2)
  })
})
