/**
 * Horas extra al inicio o al final: nada del monitor deja de contar en el fin previsto (`plannedEnd`).
 * Orel, 15-11-2026: «no debería dejar de contar a esa hora sino hasta que deje de contar el turno, porque a veces se
 * hacen horas extra… al inicio o al final del turno, y debe contarlas todas». Precedente: PR #878 (barras congeladas).
 */
import { describe, expect, it } from 'vitest'
import { finBarrasMs } from '../aEstaHora'
import { minutosDelTurno } from '../cascadaPerilla'
import { finDelEje } from '../ejeTurno'

const T0 = Date.UTC(2026, 10, 16, 0, 0)
const min = (k: number) => T0 + k * 60_000
const iso = (ms: number) => new Date(ms).toISOString()
/* Turno 00:00 → 07:15 (435 min) con 150 min de hora extra: la serie trae 585 minutos. */
const PREVISTO = 435
const LARGO = 585

describe('hora extra al final', () => {
  it('barras en vivo: llegan al último minuto de la serie aunque haya pasado el fin previsto', () => {
    expect(finBarrasMs({ t0: T0, largo: LARGO, cerrado: false, finPrevistoMs: min(PREVISTO), finRealMs: NaN })).toBe(min(LARGO))
  })

  it('barras cerradas: el tope es el fin REAL (con la hora extra), no el previsto + 30 min', () => {
    const fin = finBarrasMs({ t0: T0, largo: LARGO, cerrado: true, finPrevistoMs: min(PREVISTO), finRealMs: min(LARGO) })
    expect(fin).toBeGreaterThanOrEqual(min(LARGO))
  })

  it('barras cerradas con un corte anticipado: el tope sigue siendo el previsto + 30 min (protege de series ajenas)', () => {
    expect(finBarrasMs({ t0: T0, largo: LARGO, cerrado: true, finPrevistoMs: min(PREVISTO), finRealMs: min(400) })).toBe(min(PREVISTO + 30))
  })

  it('eje de «Ritmo en vivo» en vivo: se estira con el último dato pasado el previsto', () => {
    expect(finDelEje({ finMs: min(PREVISTO), cerrado: false, ultimoDatoMs: min(LARGO) })).toBe(min(LARGO))
    // Antes del previsto, el eje sigue llegando al previsto.
    expect(finDelEje({ finMs: min(PREVISTO), cerrado: false, ultimoDatoMs: min(200) })).toBe(min(PREVISTO))
  })

  it('cascada («hizo N»): cuenta los minutos de la hora extra, en vivo y cerrada', () => {
    const desde = iso(T0)
    expect(minutosDelTurno({ desde, largo: LARGO, plannedEnd: iso(min(PREVISTO)), shiftClosed: false })).toBe(LARGO)
    expect(minutosDelTurno({ desde, largo: LARGO + 20, plannedEnd: iso(min(PREVISTO)), effectiveEnd: iso(min(LARGO)), shiftClosed: true })).toBe(LARGO)
  })
})
