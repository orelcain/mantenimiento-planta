import { describe, it, expect } from 'vitest'
import {
  tendenciaDelPeriodo,
  hayMejorSemana,
  MIN_DIAS_POR_MITAD,
} from '../graderTendenciaPeriodo'

/** Serie de `n` días con un valor fijo por mitad. */
const serie = (primeraMitad: number[], segundaMitad: number[]) => [...primeraMitad, ...segundaMitad]

describe('tendenciaDelPeriodo', () => {
  it('las dos mitades NO comparten días', () => {
    // El defecto viejo: `slice(0,7)` contra `slice(-7)` con 8 días compartía 6.
    // Acá la primera mitad vale 5 y la segunda 1: si se solaparan, el delta
    // saldría diluido en vez de −4.
    const t = tendenciaDelPeriodo(serie([5, 5, 5, 5], [1, 1, 1, 1]))!
    expect(t.inicioPct).toBe(5)
    expect(t.finPct).toBe(1)
    expect(t.deltaPp).toBe(-4)
    expect(t.direccion).toBe('better')
    expect(t.diasPorMitad).toBe(4)
  })

  it('con longitud impar el día del medio no entra en ninguna mitad', () => {
    // 7 días: mitades de 3. El día 4 (valor 99) quedaría fuera; si entrara en
    // alguna, movería su promedio.
    const t = tendenciaDelPeriodo([2, 2, 2, 99, 4, 4, 4])!
    expect(t.diasPorMitad).toBe(3)
    expect(t.inicioPct).toBe(2)
    expect(t.finPct).toBe(4)
  })

  it('el período de 8 días que hoy hay en producción se puede medir', () => {
    // Con el cálculo viejo, 8 días daban 86 % de solape. Ahora son 4 contra 4.
    const t = tendenciaDelPeriodo([3.9, 4.1, 3.8, 3.9, 3.1, 3.2, 3.1, 3.2])!
    expect(t.diasPorMitad).toBe(4)
    expect(t.direccion).toBe('better')
  })

  it('calla cuando no hay base para dos mitades', () => {
    expect(tendenciaDelPeriodo([])).toBeNull()
    expect(tendenciaDelPeriodo([3, 3, 3])).toBeNull()          // mitad = 1
    expect(tendenciaDelPeriodo([3, 3, 3, 3, 3])).toBeNull()    // mitad = 2
    expect(tendenciaDelPeriodo([3, 3, 3, 3, 3, 3])).not.toBeNull() // mitad = 3
    expect(MIN_DIAS_POR_MITAD).toBe(3)
  })

  it('la frontera de ±0,3 pp se prueba por los dos lados', () => {
    const con = (delta: number) =>
      tendenciaDelPeriodo(serie([3, 3, 3], [3 + delta, 3 + delta, 3 + delta]))!.direccion
    expect(con(0.3)).toBe('stable')
    expect(con(0.31)).toBe('worse')
    expect(con(-0.3)).toBe('stable')
    expect(con(-0.31)).toBe('better')
  })
})

describe('hayMejorSemana', () => {
  it('no se elige «la mejor semana» entre dos ventanas que comparten 6 días', () => {
    expect(hayMejorSemana(8)).toBe(false)
    expect(hayMejorSemana(12)).toBe(false)
    expect(hayMejorSemana(13)).toBe(false)
    expect(hayMejorSemana(14)).toBe(true)
    expect(hayMejorSemana(30)).toBe(true)
  })
})
