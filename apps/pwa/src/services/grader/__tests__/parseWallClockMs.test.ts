/**
 * `parseWallClockMs` — leer los timestamps del módulo sin que el navegador les
 * aplique su zona horaria.
 *
 * El módulo mezcla dos formatos: los ISO completos llevan `Z`
 * ("2026-08-01T01:34:00.000Z") pero los `tsMin` de los TimelineBucket son
 * `ts.slice(0, 16)` y quedan SIN zona ("2026-08-01T01:34"). `Date.parse` de una
 * fecha-hora sin offset la interpreta como hora LOCAL, así que en Chile (UTC-4)
 * los buckets se corrían 4 horas contra cualquier valor con `Z`.
 *
 * Este test corre en la zona del que lo ejecuta; por eso compara contra el
 * mismo instante expresado con `Z`, en vez de contra un epoch fijo.
 */
import { describe, it, expect } from 'vitest'
import { parseWallClockMs } from '../graderTimeFormat'

describe('parseWallClockMs', () => {
  it('un tsMin sin zona se lee como hora de planta, no como local', () => {
    expect(parseWallClockMs('2026-08-01T01:34'))
      .toBe(Date.parse('2026-08-01T01:34:00.000Z'))
  })

  it('respeta el sufijo Z cuando ya viene', () => {
    expect(parseWallClockMs('2026-08-01T01:34:00.000Z'))
      .toBe(Date.parse('2026-08-01T01:34:00.000Z'))
  })

  it('acepta segundos y milisegundos sin zona', () => {
    expect(parseWallClockMs('2026-08-01T01:34:56'))
      .toBe(Date.parse('2026-08-01T01:34:56Z'))
    expect(parseWallClockMs('2026-08-01T01:34:56.789'))
      .toBe(Date.parse('2026-08-01T01:34:56.789Z'))
  })

  it('no pisa un offset explícito', () => {
    // Si alguien guarda un timestamp con zona real, se respeta.
    expect(parseWallClockMs('2026-08-01T01:34:00-04:00'))
      .toBe(Date.parse('2026-08-01T05:34:00.000Z'))
  })

  it('vacío o inválido devuelve NaN, para que el caller lo descarte', () => {
    expect(Number.isNaN(parseWallClockMs(null))).toBe(true)
    expect(Number.isNaN(parseWallClockMs(undefined))).toBe(true)
    expect(Number.isNaN(parseWallClockMs(''))).toBe(true)
    expect(Number.isNaN(parseWallClockMs('no es una fecha'))).toBe(true)
  })

  it('dos formatos distintos del MISMO instante dan el mismo ms', () => {
    // Es la comparación que fallaba: ventana del turno con Z contra buckets sin Z.
    expect(parseWallClockMs('2026-07-31T21:30'))
      .toBe(parseWallClockMs('2026-07-31T21:30:00.000Z'))
  })
})
