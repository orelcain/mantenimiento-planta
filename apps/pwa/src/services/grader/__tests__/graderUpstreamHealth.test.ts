/**
 * Tests para graderUpstreamHealth.ts — helpers puros.
 *
 * Cubren:
 *   - reachedStatusFromPct: 3 zonas + bordes exactos
 *   - color/label helpers: cobertura completa
 *   - detectMicroAnomalies: casos típicos + bordes (umbral absoluto, ratio,
 *     1 sola máquina, todas iguales)
 *   - isStaleSync: bordes + null syncedAt
 *   - varianceDirection: 3 zonas + banda neutra
 */

import { describe, it, expect } from 'vitest'
import {
  REACHED_PCT_THRESHOLDS,
  reachedStatusFromPct,
  reachedStatusColor,
  reachedStatusLabel,
  MICRO_ANOMALY_THRESHOLDS,
  detectMicroAnomalies,
  SYNC_STALE_MINUTES,
  isStaleSync,
  VARIANCE_NEUTRAL_BAND,
  varianceDirection,
  varianceLabel,
  varianceColor,
} from '../graderUpstreamHealth'

describe('REACHED_PCT_THRESHOLDS', () => {
  it('healthyAbove=0.85 y criticalBelow=0.65', () => {
    expect(REACHED_PCT_THRESHOLDS.healthyAbove).toBe(0.85)
    expect(REACHED_PCT_THRESHOLDS.criticalBelow).toBe(0.65)
  })
})

describe('reachedStatusFromPct', () => {
  it('healthy en >= 0.85', () => {
    expect(reachedStatusFromPct(0.85)).toBe('healthy')
    expect(reachedStatusFromPct(1.0)).toBe('healthy')
    expect(reachedStatusFromPct(1.5)).toBe('healthy')  // por encima de 100% sigue saludable
  })
  it('attention en [0.65, 0.85)', () => {
    expect(reachedStatusFromPct(0.65)).toBe('attention')
    expect(reachedStatusFromPct(0.75)).toBe('attention')
    expect(reachedStatusFromPct(0.84999)).toBe('attention')
  })
  it('critical en < 0.65', () => {
    expect(reachedStatusFromPct(0.64999)).toBe('critical')
    expect(reachedStatusFromPct(0.5)).toBe('critical')
    expect(reachedStatusFromPct(0)).toBe('critical')
  })
})

describe('reachedStatusColor + reachedStatusLabel', () => {
  it('cubre los 3 status', () => {
    expect(reachedStatusColor('healthy')).toContain('emerald')
    expect(reachedStatusColor('attention')).toContain('amber')
    expect(reachedStatusColor('critical')).toContain('rose')

    expect(reachedStatusLabel('healthy')).toBe('saludable')
    expect(reachedStatusLabel('attention')).toBe('bajo objetivo')
    expect(reachedStatusLabel('critical')).toBe('crítico')
  })
})

describe('MICRO_ANOMALY_THRESHOLDS', () => {
  it('minAbsolute=15 y overAvgRatio=1.25', () => {
    expect(MICRO_ANOMALY_THRESHOLDS.minAbsolute).toBe(15)
    expect(MICRO_ANOMALY_THRESHOLDS.overAvgRatio).toBe(1.25)
  })
})

describe('detectMicroAnomalies', () => {
  it('detecta máquina con conteo máximo Y sobre umbral absoluto Y sobre ratio promedio', () => {
    const machines = [
      { machineid: 'a', microCount: 10 },
      { machineid: 'b', microCount: 12 },
      { machineid: 'c', microCount: 30 },  // máximo + sobre 15 + sobre 1.25 × 17.3
    ]
    const set = detectMicroAnomalies(machines)
    expect(set.has('c')).toBe(true)
    expect(set.has('a')).toBe(false)
    expect(set.has('b')).toBe(false)
  })

  it('NO detecta cuando el máximo está bajo MIN_ABSOLUTE (evita FP en turnos vacíos)', () => {
    const machines = [
      { machineid: 'a', microCount: 5 },
      { machineid: 'b', microCount: 14 },  // menor a 15 absoluto
      { machineid: 'c', microCount: 8 },
    ]
    expect(detectMicroAnomalies(machines).size).toBe(0)
  })

  it('NO detecta cuando el máximo no supera el ratio (todas iguales)', () => {
    const machines = [
      { machineid: 'a', microCount: 20 },
      { machineid: 'b', microCount: 20 },
      { machineid: 'c', microCount: 20 },
    ]
    // max = avg = 20 → no supera 1.25 × 20 = 25
    expect(detectMicroAnomalies(machines).size).toBe(0)
  })

  it('NO detecta con menos de 2 máquinas', () => {
    expect(detectMicroAnomalies([{ machineid: 'a', microCount: 100 }]).size).toBe(0)
    expect(detectMicroAnomalies([]).size).toBe(0)
  })

  it('puede detectar empate (2 máquinas con mismo max si supera el ratio)', () => {
    const machines = [
      { machineid: 'a', microCount: 5 },
      { machineid: 'b', microCount: 30 },
      { machineid: 'c', microCount: 30 },
    ]
    // max=30, avg=21.67, threshold=27. 30 > 27 → ambas marcadas
    const set = detectMicroAnomalies(machines)
    expect(set.has('b')).toBe(true)
    expect(set.has('c')).toBe(true)
    expect(set.has('a')).toBe(false)
  })
})

describe('isStaleSync', () => {
  it('false si syncedAt es null/undefined', () => {
    expect(isStaleSync(null)).toBe(false)
    expect(isStaleSync(undefined)).toBe(false)
  })
  it('false si la edad es <= SYNC_STALE_MINUTES', () => {
    const now = new Date('2026-04-25T12:00:00Z')
    const recent = new Date(now.getTime() - SYNC_STALE_MINUTES * 60_000)  // exactamente al borde
    expect(isStaleSync(recent, now)).toBe(false)
  })
  it('true si edad > SYNC_STALE_MINUTES', () => {
    const now = new Date('2026-04-25T12:00:00Z')
    const old = new Date(now.getTime() - (SYNC_STALE_MINUTES + 1) * 60_000)
    expect(isStaleSync(old, now)).toBe(true)
  })
})

describe('varianceDirection + label + color', () => {
  it('better cuando variance >= VARIANCE_NEUTRAL_BAND', () => {
    expect(varianceDirection(VARIANCE_NEUTRAL_BAND)).toBe('better')
    expect(varianceDirection(0.05)).toBe('better')
    expect(varianceDirection(1.0)).toBe('better')
  })
  it('worse cuando variance <= -VARIANCE_NEUTRAL_BAND', () => {
    expect(varianceDirection(-VARIANCE_NEUTRAL_BAND)).toBe('worse')
    expect(varianceDirection(-0.5)).toBe('worse')
  })
  it('as_expected en banda neutra (-VARIANCE_NEUTRAL_BAND, +VARIANCE_NEUTRAL_BAND)', () => {
    expect(varianceDirection(0)).toBe('as_expected')
    expect(varianceDirection(0.01)).toBe('as_expected')
    expect(varianceDirection(-0.019)).toBe('as_expected')
  })
  it('labels y colors cubren los 3 niveles', () => {
    expect(varianceLabel('better')).toBe('mejor que esperado')
    expect(varianceLabel('as_expected')).toBe('como esperado')
    expect(varianceLabel('worse')).toBe('peor que esperado')

    expect(varianceColor('better')).toContain('emerald')
    expect(varianceColor('as_expected')).toContain('slate')
    expect(varianceColor('worse')).toContain('rose')
  })
})
