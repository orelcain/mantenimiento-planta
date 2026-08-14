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

  it('y que SÍ entra cuando lo logró un tercio de los turnos o más', () => {
    const t = texto({ ...FILETE, hitsTarget: 7 }, 3800)
    expect(t).toMatch(/entra: 7 de 9 turnos/)
  })

  it('⚠ con UNO de diez no dice "entra": dice que es difícil', () => {
    /*
     * Visto en vivo el 14-08: con 1 de 10 la pantalla decía "la meta entra"
     * mientras la tarjeta del ritmo decía "no se alcanza" — juntas se leían
     * como una contradicción. Un caso entre diez es que se pudo una vez.
     */
    const t = texto({ ...FILETE, hitsTarget: 1, samples: 10 }, 5000)
    expect(t).toMatch(/es difícil: solo 1 de 10 turnos la superó/)
    expect(t).not.toMatch(/entra/)
  })

  it('el borde del tercio cuenta como "entra"', () => {
    expect(texto({ ...FILETE, hitsTarget: 3, samples: 9 }, 4000)).toMatch(/entra: 3 de 9/)
    expect(texto({ ...FILETE, hitsTarget: 2, samples: 9 }, 4000)).toMatch(/difícil: solo 2 de 9/)
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
