/**
 * El bloque del pronóstico en pantalla.
 *
 * Lo que se protege acá es la honestidad del bloque: el número nunca sale sin
 * su error, el veredicto de la cuota es un conteo (no una probabilidad), y por
 * encima del umbral de error el bloque se calla en vez de arriesgar un número.
 *
 * Sin `jest-dom` en este repo: se asierta sobre el texto renderizado.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { PronosticoCierre } from '../MonitorShiftParts'
import type { ForecastResult } from '@/services/shoplogix/monitorForecast'

afterEach(cleanup)

/** Caso real: Filete a las 5 h del 13-ago (el turno cerró en 4.294). */
const FILETE: ForecastResult = {
  estimate: 4257, low: 3973, high: 4650, mapePct: 4, method: 'proporcional',
  samples: 9, hitsTarget: 0, current: 2945,
  cone: [
    { minutes: 300, low: 2945, mid: 2945, high: 2945 },
    { minutes: 470, low: 3973, mid: 4257, high: 4650 },
  ],
}

const texto = (f: ForecastResult | null, meta: number | null) =>
  render(<PronosticoCierre f={f} meta={meta} />).container.textContent ?? ''

describe('PronosticoCierre', () => {
  it('muestra el cierre estimado y NUNCA sin su error al lado', () => {
    const t = texto(FILETE, 5000)
    expect(t).toContain('4.257')
    expect(t).toMatch(/±4/)
  })

  it('publica la banda de los turnos anteriores', () => {
    const t = texto(FILETE, 5000)
    expect(t).toContain('3.973')
    expect(t).toContain('4.650')
  })

  it('dice que la meta NO entra con un conteo de turnos, sin porcentajes', () => {
    const t = texto(FILETE, 5000)
    expect(t).toMatch(/no entra/i)
    expect(t).toMatch(/ninguno de los 9/)
  })

  it('y que SÍ entra cuando algún turno lo logró desde esta altura', () => {
    const t = texto({ ...FILETE, hitsTarget: 7 }, 3800)
    expect(t).toMatch(/7 de 9 turnos/)
  })

  it('nombra el método y sobre cuántos turnos se midió — es auditable', () => {
    const t = texto(FILETE, 5000)
    expect(t).toContain('proporcional')
    expect(t).toMatch(/menos se\s+equivocó en esta línea/)
  })

  it('con error por encima del umbral se calla en vez de arriesgar un número', () => {
    const t = texto({ ...FILETE, mapePct: 22 }, 5000)
    expect(t).toMatch(/todavía no/i)
    expect(t).not.toContain('4.257')
  })

  it('sin pronóstico no renderiza nada', () => {
    const { container } = render(<PronosticoCierre f={null} meta={5000} />)
    expect(container.innerHTML).toBe('')
  })
})
