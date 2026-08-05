/**
 * `buildPeriodShifts` contra datos REALES de producción.
 *
 * Los tests de `graderShiftPeriod.test.ts` usan casos escritos a mano: prueban
 * que la lógica hace lo que quise. Estos prueban algo distinto y más difícil de
 * conseguir — que los datos vivos tienen la forma que la lógica asume.
 *
 * Esa diferencia ya se cobró un bug: la primera versión pasaba 16/16 tests
 * inventados y fallaba con `2026-07-31_Turno 1`, cuya ventana efectiva cae
 * entera en el día siguiente a su dateKey. Ningún caso imaginado lo cubría.
 *
 * El fixture se regenera con `node scripts/export-shift-period-fixture.js`.
 */
import { describe, it, expect } from 'vitest'
import { buildPeriodShifts, periodShiftRows, formatShiftWindow } from '../graderShiftPeriod'
import type { ShoplogixShiftParent } from '@/services/shoplogix/shoplogixShift.service'
import type { GraderDailySummary } from '@/services/grader/types'
import fixture from './fixtures/shiftPeriod.real.json'

/** El JSON guarda las fechas como ISO; el servicio espera Date. */
function revive(raw: (typeof fixture)['yal_2026_07']['parents']): ShoplogixShiftParent[] {
  const d = (s: string | null) => (s ? new Date(s) : null)
  return raw.map((p) => ({
    ...p,
    scheduledStart: d(p.scheduledStart), scheduledEnd: d(p.scheduledEnd),
    effectiveStart: d(p.effectiveStart), effectiveEnd: d(p.effectiveEnd),
    officialStart: d(p.officialStart), officialEnd: d(p.officialEnd),
    lastSyncAt: null,
    machines: p.machines.map((m) => ({ ...m, stateAggregates: undefined })),
  })) as unknown as ShoplogixShiftParent[]
}

const candidates = (shiftId: string): string[] =>
  shiftId === 'Turno 2' ? ['Turno 2', 'Turno día']
  : shiftId === 'Turno 1' ? ['Turno 1', 'Turno noche']
  : [shiftId]

const buildFor = (k: 'yal_2026_07' | 'chonchi_2026_07', plantSlug: 'yal' | 'chonchi') =>
  buildPeriodShifts({
    parents: revive(fixture[k].parents),
    summaries: fixture[k].summaries as unknown as GraderDailySummary[],
    plantSlug, getCandidates: candidates,
  })

describe('Yal · julio 2026 (datos reales)', () => {
  const shifts = buildFor('yal_2026_07', 'yal')

  it('descarta el ruido y deja los turnos productivos', () => {
    // 80 docs padre en el mes; la mayoría son turnos vacíos (<50 ciclos).
    expect(fixture.yal_2026_07.parents.length).toBe(80)
    expect(shifts.length).toBeGreaterThan(40)
    expect(shifts.length).toBeLessThan(60)
  })

  it('la matriz cabe: pocas filas y a lo sumo 3 turnos por día', () => {
    const rows = periodShiftRows(shifts)
    // El layout de la vista asume que las filas entran sin scroll vertical.
    expect(rows.length).toBeLessThanOrEqual(5)
    expect(rows).toContain('Unscheduled')   // se muestra, no se esconde

    const porDia = new Map<string, number>()
    for (const s of shifts) porDia.set(s.dateKey, (porDia.get(s.dateKey) ?? 0) + 1)
    expect(Math.max(...porDia.values())).toBeLessThanOrEqual(3)
  })

  it('cada turno ocupa UNA sola celda: no hay claves repetidas', () => {
    const keys = shifts.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('la ventana efectiva es la fuente en casi todos los turnos', () => {
    const efectivos = shifts.filter((s) => s.windowSource === 'effective').length
    expect(efectivos / shifts.length).toBeGreaterThan(0.9)
  })

  it('los turnos que terminan 00:00 en punto NO se marcan como cruce', () => {
    // Hallazgo de la validación: en Yal julio 2026 los 5 candidatos a "cruce"
    // terminaban todos exactamente a las 00:00 (`14:54 → 00:00`). Ninguno
    // invadió el día siguiente, así que ninguno debe llevar marcador.
    const terminanEnPunto = shifts.filter(
      (s) => s.end && s.end.getUTCHours() === 0 && s.end.getUTCMinutes() === 0,
    )
    expect(terminanEnPunto.length).toBeGreaterThan(0)
    for (const s of terminanEnPunto) {
      expect(s.crossesMidnight).toBe(false)
      expect(s.endDateKey).toBeNull()
      expect(formatShiftWindow(s)).not.toMatch(/⁺/)
    }
  })

  it('todo turno ocupa una sola celda, cruce o no cruce', () => {
    for (const s of shifts) {
      expect(shifts.filter((x) => x.key === s.key)).toHaveLength(1)
      if (s.crossesMidnight) {
        expect(s.endDateKey).not.toBeNull()
        expect(s.endDateKey).not.toBe(s.dateKey)
      }
    }
  })

  it('ninguna ventana da duración negativa ni absurda', () => {
    for (const s of shifts) {
      if (s.durationMin == null) continue
      expect(s.durationMin).toBeGreaterThan(0)
      expect(s.durationMin).toBeLessThanOrEqual(24 * 60)
    }
  })

  it('el uptime nunca supera 100% (la trampa de sumar las 3 Baaders)', () => {
    for (const s of shifts) {
      if (s.uptimePct == null) continue
      expect(s.uptimePct).toBeGreaterThanOrEqual(0)
      expect(s.uptimePct).toBeLessThanOrEqual(100)
    }
  })

  it('toda ventana cuyo día no coincide con la columna lleva marcador', () => {
    for (const s of shifts) {
      if (!s.start || !s.end) continue
      const txt = formatShiftWindow(s)
      if (s.startDayOffset > 0 || s.endDayOffset > 0) {
        expect(txt).toMatch(/⁺\d/)
      } else {
        expect(txt).not.toMatch(/⁺/)
      }
    }
  })
})

describe('Chonchi · julio 2026 (datos reales)', () => {
  const shifts = buildFor('chonchi_2026_07', 'chonchi')

  it('el turno de 1.533 piezas del 31-jul conserva su día y avisa el corrimiento', () => {
    // Caso que motivó el fix: dateKey 31-jul, producción real 01:34→05:11 del 1-ago.
    const s = shifts.find((x) => x.key === '2026-07-31__Turno 1')
    expect(s).toBeDefined()
    expect(s!.dateKey).toBe('2026-07-31')
    expect(s!.startDayOffset).toBe(1)
    expect(s!.crossesMidnight).toBe(false)   // transcurre entero dentro del 1-ago
    expect(formatShiftWindow(s!)).toBe('⁺1 01:19 → 05:06')
    // El summary del Grader quedó adjunto al mismo turno, sin duplicarlo.
    expect(s!.pieces).toBe(1533)
    expect(s!.hasSlx && s!.hasGrader).toBe(true)
    expect(shifts.filter((x) => x.pieces === 1533)).toHaveLength(1)
  })

  it('la ventana mostrada es la de Shoplogix, NO la del Excel del Grader', () => {
    // Son dos mediciones distintas del mismo turno, y difieren de verdad:
    //   Shoplogix (uptime de las Baaders, eviscerado): 01:19:49 → 05:06:48
    //   Grader    (registros de pieza, clasificación): 01:34:00 → 05:11:25
    // La Grader arranca ~14 min después porque está aguas abajo del eviscerado.
    //
    // Se elige Shoplogix porque es la fuente de verdad de los turnos en este
    // proyecto y porque cubre la línea entera, no solo la clasificadora. La UI
    // debe poder decirlo: por eso `windowSource` se expone en vez de esconderse.
    //
    // OJO: el panel del Grader en la app muestra la ventana del Excel, así que
    // esta vista mostrará ~15 min de diferencia sobre el mismo turno. Es real,
    // no un bug — pero si alguien "corrige" la preferencia de fuente sin querer,
    // este test lo canta.
    const s = shifts.find((x) => x.key === '2026-07-31__Turno 1')!
    expect(s.windowSource).toBe('effective')
    const graderStart = fixture.chonchi_2026_07.summaries[0]!.startAt
    expect(s.start!.toISOString()).not.toBe(graderStart)
  })

  it('los turnos viejos sin effective* degradan sin romperse', () => {
    const degradados = shifts.filter((s) => s.windowSource !== 'effective')
    for (const s of degradados) {
      expect(['official', 'scheduled', 'grader', 'none']).toContain(s.windowSource)
    }
  })
})
