/**
 * Tests para graderTimeFormat.ts — formateadores de tiempo del módulo.
 *
 * Cubre la convención Z-as-wall-clock-local de Marelec/Shoplogix:
 * los ISO con sufijo 'Z' representan hora LOCAL DE PLANTA, no UTC real.
 * Los formateadores leen `getUTCHours/Minutes/Seconds` para devolver
 * el wall-clock tal como fue grabado.
 */

import { describe, it, expect } from 'vitest'
import {
  fmtTime,
  fmtTimeWithSec,
  fmtDateTime,
  fmtDurationSec,
  fmtDurationMin,
  fmtRelativeTime,
} from '../graderTimeFormat'

describe('fmtTime — re-export desde shiftTimelineHelpers', () => {
  it('formatea ISO Z-local como HH:MM en wall-clock', () => {
    expect(fmtTime('2026-04-25T13:27:11.000Z')).toBe('13:27')
    expect(fmtTime('2026-04-25T08:05:00.000Z')).toBe('08:05')
    expect(fmtTime('2026-04-25T00:00:00.000Z')).toBe('00:00')
    expect(fmtTime('2026-04-25T23:59:59.999Z')).toBe('23:59')
  })

  it('preserva minutos exactos sin redondeo', () => {
    expect(fmtTime('2026-04-25T14:59:00.000Z')).toBe('14:59')
    expect(fmtTime('2026-04-25T15:00:00.000Z')).toBe('15:00')
  })

  it('acepta Date como entrada (firma extendida Iter 7)', () => {
    expect(fmtTime(new Date('2026-04-25T13:27:00.000Z'))).toBe('13:27')
    expect(fmtTime(new Date('2026-04-25T08:05:00.000Z'))).toBe('08:05')
  })

  it('acepta number (epoch ms) como entrada (firma extendida Iter 7)', () => {
    const ms = Date.parse('2026-04-25T13:27:00.000Z')
    expect(fmtTime(ms)).toBe('13:27')
    expect(fmtTime(0)).toBe('00:00') // epoch start
  })

  it('las 3 firmas devuelven el mismo resultado para el mismo instante', () => {
    const iso = '2026-04-25T15:42:00.000Z'
    const d = new Date(iso)
    const ms = d.getTime()
    expect(fmtTime(iso)).toBe(fmtTime(d))
    expect(fmtTime(d)).toBe(fmtTime(ms))
  })
})

describe('fmtTimeWithSec', () => {
  it('formatea ISO Z-local como HH:MM:SS preservando segundos', () => {
    expect(fmtTimeWithSec('2026-04-25T13:27:11.000Z')).toBe('13:27:11')
    expect(fmtTimeWithSec('2026-04-25T00:00:00.000Z')).toBe('00:00:00')
    expect(fmtTimeWithSec('2026-04-25T23:59:59.999Z')).toBe('23:59:59')
  })

  it('rellena con ceros a la izquierda', () => {
    expect(fmtTimeWithSec('2026-04-25T01:02:03.000Z')).toBe('01:02:03')
    expect(fmtTimeWithSec('2026-04-25T09:08:07.000Z')).toBe('09:08:07')
  })
})

describe('fmtDateTime', () => {
  it('formatea ISO Z-local como dd/MM HH:MM', () => {
    expect(fmtDateTime('2026-04-25T13:27:00.000Z')).toBe('25/04 13:27')
    expect(fmtDateTime('2026-01-01T00:00:00.000Z')).toBe('01/01 00:00')
    expect(fmtDateTime('2026-12-31T23:59:00.000Z')).toBe('31/12 23:59')
  })

  it('rellena día y mes con ceros a la izquierda', () => {
    expect(fmtDateTime('2026-03-09T05:08:00.000Z')).toBe('09/03 05:08')
  })
})

describe('fmtDurationSec', () => {
  it('< 60s → "X s"', () => {
    expect(fmtDurationSec(0)).toBe('0 s')
    expect(fmtDurationSec(1)).toBe('1 s')
    expect(fmtDurationSec(59)).toBe('59 s')
    expect(fmtDurationSec(59.4)).toBe('59 s')
  })

  it('60s ≤ d < 3600s → "X min" (redondea al entero más cercano)', () => {
    expect(fmtDurationSec(60)).toBe('1 min')
    expect(fmtDurationSec(89)).toBe('1 min') // round(89/60) = round(1.48) = 1
    expect(fmtDurationSec(90)).toBe('2 min') // round(90/60) = round(1.5) = 2
    expect(fmtDurationSec(1800)).toBe('30 min')
    expect(fmtDurationSec(3540)).toBe('59 min') // 59 min exactos
  })

  it('borde 3599-3600s: round empuja a 60min → "1 h" (escala al bracket horas)', () => {
    // round(3599/60) = round(59.98) = 60 → cae en rama >=60min como "1 h".
    // Comportamiento intencional: cuando el redondeo cruza el bracket, escala.
    expect(fmtDurationSec(3599)).toBe('1 h')
  })

  it('≥ 3600s → "X h Y min" omitiendo Y cuando es 0', () => {
    expect(fmtDurationSec(3600)).toBe('1 h')
    expect(fmtDurationSec(3660)).toBe('1 h 1 min')
    expect(fmtDurationSec(7200)).toBe('2 h')
    expect(fmtDurationSec(7320)).toBe('2 h 2 min')
    expect(fmtDurationSec(15300)).toBe('4 h 15 min') // 4h 15min — caso Planned Downtime Shoplogix
  })

  it('valores inválidos → "—"', () => {
    expect(fmtDurationSec(-5)).toBe('—')
    expect(fmtDurationSec(NaN)).toBe('—')
    expect(fmtDurationSec(Infinity)).toBe('—')
  })
})

describe('fmtDurationMin', () => {
  it('< 60min → "X min"', () => {
    expect(fmtDurationMin(0)).toBe('0 min')
    expect(fmtDurationMin(30)).toBe('30 min')
    expect(fmtDurationMin(59)).toBe('59 min')
    expect(fmtDurationMin(59.4)).toBe('59 min')
  })

  it('borde 59.5-60min: round empuja a 60 → "1 h" (escala al bracket horas)', () => {
    expect(fmtDurationMin(59.6)).toBe('1 h')
  })

  it('≥ 60min → "X h Y min" omitiendo Y cuando es 0', () => {
    expect(fmtDurationMin(60)).toBe('1 h')
    expect(fmtDurationMin(61)).toBe('1 h 1 min')
    expect(fmtDurationMin(120)).toBe('2 h')
    expect(fmtDurationMin(135)).toBe('2 h 15 min')
    expect(fmtDurationMin(255)).toBe('4 h 15 min')
  })

  it('valores inválidos → "—"', () => {
    expect(fmtDurationMin(-1)).toBe('—')
    expect(fmtDurationMin(NaN)).toBe('—')
  })
})

describe('fmtRelativeTime', () => {
  const NOW = Date.parse('2026-04-25T15:00:00.000Z')

  it('< 60s → "hace un momento"', () => {
    expect(fmtRelativeTime(NOW, NOW)).toBe('hace un momento')
    expect(fmtRelativeTime(NOW - 30_000, NOW)).toBe('hace un momento')
    expect(fmtRelativeTime(NOW - 59_000, NOW)).toBe('hace un momento')
  })

  it('1min ≤ d < 1h → "hace X min"', () => {
    expect(fmtRelativeTime(NOW - 60_000, NOW)).toBe('hace 1 min')
    expect(fmtRelativeTime(NOW - 15 * 60_000, NOW)).toBe('hace 15 min')
    expect(fmtRelativeTime(NOW - 59 * 60_000, NOW)).toBe('hace 59 min')
  })

  it('1h ≤ d < 24h → "hace X h"', () => {
    expect(fmtRelativeTime(NOW - 60 * 60_000, NOW)).toBe('hace 1 h')
    expect(fmtRelativeTime(NOW - 5 * 60 * 60_000, NOW)).toBe('hace 5 h')
    expect(fmtRelativeTime(NOW - 23 * 60 * 60_000, NOW)).toBe('hace 23 h')
  })

  it('≥ 24h → "hace X d"', () => {
    expect(fmtRelativeTime(NOW - 24 * 60 * 60_000, NOW)).toBe('hace 1 d')
    expect(fmtRelativeTime(NOW - 7 * 24 * 60 * 60_000, NOW)).toBe('hace 7 d')
  })

  it('clamp a 0 cuando el evento es futuro (clock skew tolerable)', () => {
    expect(fmtRelativeTime(NOW + 5_000, NOW)).toBe('hace un momento')
  })

  it('valores inválidos → "—"', () => {
    expect(fmtRelativeTime(NaN, NOW)).toBe('—')
    expect(fmtRelativeTime(NOW, NaN)).toBe('—')
  })
})
