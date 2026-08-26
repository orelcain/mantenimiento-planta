/**
 * El turno real del 25-08 de noche en Eviscerado de Planta Principal, tal como
 * lo mostraba «Hora por hora» — sin ninguna marca en la hora que se hundió.
 */
import { describe, it, expect } from 'vitest'
import { horaMasFloja } from '../horaMasFloja'
import type { HoraDelTurno, ParadaConHora } from '../horaMasFloja'

/** Las ocho filas reales. `from`/`to` en la convención wall-clock del monitor. */
const HORAS: HoraDelTurno[] = [
  { index: 1, from: '2026-08-25T21:25:00Z', to: '2026-08-25T22:25:00Z', pieces: 2389 },
  { index: 2, from: '2026-08-25T22:25:00Z', to: '2026-08-25T23:25:00Z', pieces: 2616 },
  { index: 3, from: '2026-08-25T23:25:00Z', to: '2026-08-26T00:25:00Z', pieces: 2099 },
  { index: 4, from: '2026-08-26T00:25:00Z', to: '2026-08-26T01:25:00Z', pieces: 1781 },
  { index: 5, from: '2026-08-26T01:25:00Z', to: '2026-08-26T02:25:00Z', pieces: 379 },
  { index: 6, from: '2026-08-26T02:25:00Z', to: '2026-08-26T03:25:00Z', pieces: 2048 },
  { index: 7, from: '2026-08-26T03:25:00Z', to: '2026-08-26T04:25:00Z', pieces: 1883 },
  { index: 8, from: '2026-08-26T04:25:00Z', to: '2026-08-26T04:45:00Z', pieces: 447, partial: true },
]

/** Las paradas medidas del payload, con su hora de planta sin fecha. */
const PARADAS: ParadaConHora[] = [
  { reason: 'Detencion', hora: '01:34:18', hasta: '02:33:48', min: 59.5 },
  { reason: 'AJUSTE MANTENIMIENTO', hora: '00:24:18', hasta: '01:13:48', min: 49.5 },
  { reason: 'AJUSTE MANTENIMIENTO', hora: '22:34:30', hasta: '22:38:30', min: 4 },
  { reason: 'Detencion', hora: '21:15:00', hasta: '21:25:45', min: 10.75 },
]

describe('horaMasFloja', () => {
  it('encuentra la hora que se hundió: h5, con 379 pz', () => {
    const r = horaMasFloja(HORAS, PARADAS)!
    expect(r.index).toBe(5)
    expect(r.pieces).toBe(379)
    expect(Math.round(r.caidaPct)).toBe(82)
  })

  it('⚠ le pone la causa que de verdad cae dentro de esa hora', () => {
    const r = horaMasFloja(HORAS, PARADAS)!
    expect(r.culpable?.reason).toBe('Detencion')
    expect(r.culpable?.hora).toBe('01:34:18')
    // Solapamiento, no la parada entera: de 01:34 a 02:25 son 51 min, no 59,5.
    expect(Math.round(r.culpable!.min)).toBe(51)
  })

  it('⚠ la hora que CRUZA la medianoche no pierde su parada', () => {
    /*
     * Las paradas traen hora de planta SIN fecha ("00:10:00"). La hora 3 va de
     * las 23:25 del 25 a las 00:25 del 26: si "00:10" se ubicara en el día del
     * `from`, caería 23 horas antes y la parada desaparecería justo en el
     * turno de noche, que es cuando más se usa el monitor.
     *
     * Este test fue escrito primero de otra forma y NO cazaba la rotura: pasaba
     * igual con la corrección puesta o sacada. Este sí falla sin ella.
     */
    const horas: HoraDelTurno[] = [
      { index: 1, from: '2026-08-25T21:25:00Z', to: '2026-08-25T22:25:00Z', pieces: 2400 },
      { index: 2, from: '2026-08-25T22:25:00Z', to: '2026-08-25T23:25:00Z', pieces: 2400 },
      { index: 3, from: '2026-08-25T23:25:00Z', to: '2026-08-26T00:25:00Z', pieces: 300 },
      { index: 4, from: '2026-08-26T00:25:00Z', to: '2026-08-26T01:25:00Z', pieces: 2400 },
    ]
    const r = horaMasFloja(horas, [
      { reason: 'Detencion', hora: '23:50:00', hasta: '00:20:00', min: 30 },
    ])!
    expect(r.index).toBe(3)
    expect(r.culpable?.reason).toBe('Detencion')
    expect(Math.round(r.culpable!.min)).toBe(30)
  })

  it('la hora incompleta no compite aunque tenga menos piezas', () => {
    // h8 tiene 447 pz, más que h5 no — pero es parcial y quedaría siempre
    // señalada en cualquier turno que corte a mitad de hora.
    expect(horaMasFloja(HORAS, PARADAS)!.index).not.toBe(8)
  })

  it('un turno parejo no señala nada', () => {
    const parejo = HORAS.slice(0, 4).map((h, i) => ({ ...h, pieces: 2000 + i * 30 }))
    expect(horaMasFloja(parejo, PARADAS)).toBeNull()
  })

  it('con menos de tres horas no hay con qué comparar', () => {
    expect(horaMasFloja(HORAS.slice(0, 2), PARADAS)).toBeNull()
    expect(horaMasFloja([], PARADAS)).toBeNull()
  })

  it('sin una parada que la explique, señala la hora pero no acusa a nadie', () => {
    const r = horaMasFloja(HORAS, [])!
    expect(r.index).toBe(5)
    expect(r.culpable).toBeNull()
  })

  it('una parada de dos minutos no carga con una hora hundida', () => {
    const r = horaMasFloja(HORAS, [{ reason: 'Micro Detencion', hora: '01:40:00', hasta: '01:42:00', min: 2 }])!
    expect(r.culpable).toBeNull()
  })
})
