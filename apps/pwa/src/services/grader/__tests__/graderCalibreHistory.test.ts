/**
 * graderCalibreHistory — la config de gates contra lo que suele venir.
 *
 * Los casos usan los NÚMEROS REALES de producción (6 turnos de Chonchi entre
 * 2026-07-31 y 2026-08-11, y la plantilla "2026-08-03_Turno_noche"), no datos
 * inventados: la tarjeta tiene que acusar el caso que de verdad está pasando —
 * 8-10 lb con 3 de 12 gates para el 56% de la producción.
 */
import { describe, it, expect } from 'vitest'
import {
  calibreKey,
  aggregateCalibreHistory,
  compareGatesVsHistory,
  suggestGateMoves,
  piecesAtRisk,
  MIN_HISTORY_SHIFTS,
} from '../graderCalibreHistory'
import type { GateAssignment, GraderDailySummary } from '../types'

type CalRow = { calibre: string; pieces: number; pct: number }

function turno(id: string, dateKey: string, cal: CalRow[]): GraderDailySummary {
  return {
    id, dateKey, shiftId: id.split('__')[1] ?? 'Turno 1',
    startAt: `${dateKey}T08:00:00`,
    calibreDistribution: cal,
  } as unknown as GraderDailySummary
}

/** Los 6 turnos reales, con la escritura del calibre TAL CUAL viene de Matrix. */
const TURNOS_REALES: GraderDailySummary[] = [
  turno('2026-08-11__Turno 2', '2026-08-11', [
    { calibre: '8-10 lb', pieces: 7703, pct: 59 },
    { calibre: '6-8 lb', pieces: 3028, pct: 23.2 },
    { calibre: '10-12 lb', pieces: 1791, pct: 13.7 },
    { calibre: '4-6 lb', pieces: 454, pct: 3.5 },
    { calibre: '2-4 lb', pieces: 86, pct: 0.7 },
  ]),
  turno('2026-08-10__Turno 2', '2026-08-10', [
    { calibre: '8-10 lb', pieces: 3787, pct: 69.6 },
    { calibre: '6-8 lb', pieces: 1117, pct: 20.5 },
    { calibre: '10-12 lb', pieces: 233, pct: 4.3 },
    { calibre: '4-6 lb', pieces: 228, pct: 4.2 },
    { calibre: '2-4 lb', pieces: 74, pct: 1.4 },
  ]),
  turno('2026-08-10__Turno 1 Lunes', '2026-08-10', [
    { calibre: '8-10 lb', pieces: 1045, pct: 55.8 },
    { calibre: '10-12 lb', pieces: 372, pct: 19.9 },
    { calibre: '6-8 lb', pieces: 346, pct: 18.5 },
    { calibre: '4-6 lb', pieces: 100, pct: 5.3 },
    { calibre: '2-4 lb', pieces: 10, pct: 0.5 },
  ]),
  // Estos tres escriben el calibre DISTINTO — "8 - 10 LB" en vez de "8-10 lb".
  turno('2026-08-03__Turno 2', '2026-08-03', [
    { calibre: '8 - 10 LB', pieces: 3148, pct: 50.7 },
    { calibre: '10 - 12 lb', pieces: 1748, pct: 28.1 },
    { calibre: '6 - 8 LB', pieces: 889, pct: 14.3 },
    { calibre: '4 - 6 LB', pieces: 281, pct: 4.5 },
    { calibre: '2 - 4 LB', pieces: 146, pct: 2.4 },
  ]),
  turno('2026-08-03__Turno 1', '2026-08-03', [
    { calibre: '8 - 10 LB', pieces: 4522, pct: 50.3 },
    { calibre: '10 - 12 lb', pieces: 2867, pct: 31.9 },
    { calibre: '6 - 8 LB', pieces: 1166, pct: 13 },
    { calibre: '4 - 6 LB', pieces: 294, pct: 3.3 },
    { calibre: '2 - 4 LB', pieces: 137, pct: 1.5 },
  ]),
  turno('2026-07-31__Turno 1', '2026-07-31', [
    { calibre: '8-10 lb', pieces: 669, pct: 47 },
    { calibre: '10-12 lb', pieces: 485, pct: 34.1 },
    { calibre: '6-8 lb', pieces: 180, pct: 12.6 },
    { calibre: '4-6 lb', pieces: 63, pct: 4.4 },
    { calibre: '2-4 lb', pieces: 27, pct: 1.9 },
  ]),
]

/** La plantilla real: 3 gates al 8-10, 3 al 6-8, 2 al 10-12, 2 al 4-6, 2 al 2-4. */
const GATES_REALES: GateAssignment[] = [
  { gateNumber: 1, assignedCalibre: '2-4 lb', assignedQuality: 'Industrial', active: true },
  { gateNumber: 2, assignedCalibre: '4-6 lb', assignedQuality: 'Industrial', active: true },
  { gateNumber: 3, assignedCalibre: '6-8 lb', assignedQuality: 'Industrial', active: true },
  { gateNumber: 4, assignedCalibre: '2-4 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 5, assignedCalibre: '4-6 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 6, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 7, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 8, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 9, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 10, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 11, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
  { gateNumber: 12, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
] as unknown as GateAssignment[]

describe('calibreKey', () => {
  it('unifica la MISMA escritura distinta que manda Matrix', () => {
    expect(calibreKey('8 - 10 LB')).toBe(calibreKey('8-10 lb'))
    expect(calibreKey('10 - 12 lb')).toBe(calibreKey('10-12 lb'))
  })

  it('no confunde calibres distintos', () => {
    expect(calibreKey('8-10 lb')).not.toBe(calibreKey('10-12 lb'))
  })
})

describe('aggregateCalibreHistory', () => {
  it('reproduce el reparto real de los 6 turnos', () => {
    const h = aggregateCalibreHistory(TURNOS_REALES)!
    expect(h).not.toBeNull()
    expect(h.shiftIds).toHaveLength(6)
    expect(h.fromDateKey).toBe('2026-07-31')
    expect(h.toDateKey).toBe('2026-08-11')
    // 5 calibres, no 10: sin normalizar serían el doble.
    expect(h.rows).toHaveLength(5)
    expect(h.rows[0]!.key).toBe('8-10lb')
    expect(h.rows[0]!.pct).toBeCloseTo(56.4, 1)
    expect(h.rows[0]!.pieces).toBe(7703 + 3787 + 1045 + 3148 + 4522 + 669)
  })

  it('pondera por piezas, no promedia porcentajes', () => {
    // Un turno chico con 100% de un calibre no puede empatarle a uno grande.
    const chico = turno('2026-08-12__Turno 1', '2026-08-12', [{ calibre: '2-4 lb', pieces: 10, pct: 100 }])
    const h = aggregateCalibreHistory([...TURNOS_REALES.slice(0, 3), chico])!
    const dosCuatro = h.rows.find((r) => r.key === '2-4lb')!
    expect(dosCuatro.pct).toBeLessThan(5)
  })

  it('usa el label del turno más reciente cuando la escritura cambió', () => {
    const h = aggregateCalibreHistory(TURNOS_REALES)!
    expect(h.rows.find((r) => r.key === '8-10lb')!.label).toBe('8-10 lb')
  })

  it('devuelve null con menos turnos que el mínimo', () => {
    expect(aggregateCalibreHistory(TURNOS_REALES.slice(0, MIN_HISTORY_SHIFTS - 1))).toBeNull()
  })

  it('ignora turnos sin calibreDistribution (Yal llega con el array vacío)', () => {
    const yal = turno('yal__2026-08-09__Turno 2', '2026-08-09', [])
    const h = aggregateCalibreHistory([...TURNOS_REALES, yal])!
    expect(h.shiftIds).not.toContain('yal__2026-08-09__Turno 2')
  })
})

describe('compareGatesVsHistory', () => {
  const history = aggregateCalibreHistory(TURNOS_REALES)!
  const fits = compareGatesVsHistory(GATES_REALES, history)

  it('acusa el caso real: 8-10 lb saturado con 3 de 12 gates', () => {
    const f = fits.find((x) => x.key === '8-10lb')!
    expect(f.gates).toEqual([8, 9, 10])
    expect(f.productionPct).toBeCloseTo(56.4, 1)
    expect(f.gatesPct).toBeCloseTo(25, 1)
    expect(f.ratio).toBeCloseTo(2.26, 2)
    expect(f.status).toBe('saturado')
  })

  it('acusa el 2-4 lb sobredimensionado: 2 gates para el 1,3%', () => {
    const f = fits.find((x) => x.key === '2-4lb')!
    expect(f.gates).toEqual([1, 4])
    expect(f.ratio).toBeLessThan(0.5)
    expect(f.status).toBe('sobredimensionado')
  })

  it('deja el 10-12 lb como óptimo — no todo es un problema', () => {
    expect(fits.find((x) => x.key === '10-12lb')!.status).toBe('optimo')
  })

  it('ordena por producción: primero lo que más pesa', () => {
    expect(fits.map((f) => f.key)).toEqual(['8-10lb', '10-12lb', '6-8lb', '4-6lb', '2-4lb'])
  })

  it('un calibre con producción y CERO gates es el peor caso, no un borde', () => {
    const sinOchoDiez = GATES_REALES.filter((g) => calibreKey(g.assignedCalibre) !== '8-10lb')
    const f = compareGatesVsHistory(sinOchoDiez, history).find((x) => x.key === '8-10lb')!
    expect(f.gates).toEqual([])
    expect(f.ratio).toBe(Infinity)
    expect(f.status).toBe('saturado')
  })

  it('no cuenta las gates inactivas', () => {
    const conApagada = GATES_REALES.map((g) => (g.gateNumber === 10 ? { ...g, active: false } : g))
    const f = compareGatesVsHistory(conApagada, history).find((x) => x.key === '8-10lb')!
    expect(f.gates).toEqual([8, 9])
  })
})

describe('suggestGateMoves', () => {
  const history = aggregateCalibreHistory(TURNOS_REALES)!
  const fits = compareGatesVsHistory(GATES_REALES, history)

  it('mueve del más sobredimensionado al más saturado', () => {
    const [primero] = suggestGateMoves(fits, 12)
    expect(primero!.fromKey).toBe('2-4lb')
    expect(primero!.toKey).toBe('8-10lb')
    expect(primero!.fromGates).toEqual([1, 4])
  })

  it('mejora el ratio del saturado en cada paso', () => {
    const moves = suggestGateMoves(fits, 12)
    expect(moves.length).toBeGreaterThan(0)
    for (const m of moves) expect(m.afterRatio).toBeLessThan(m.beforeRatio)
  })

  it('recalcula entre movimientos en vez de proponer el mismo dos veces', () => {
    const moves = suggestGateMoves(fits, 12)
    // El segundo movimiento parte del ratio que dejó el primero.
    if (moves.length >= 2) expect(moves[1]!.beforeRatio).toBeCloseTo(moves[0]!.afterRatio, 4)
  })

  it('NUNCA deja un calibre en 0 gates aunque el ratio lo justifique', () => {
    // 2-4 lb con UNA sola gate: sobredimensionado, pero si la cede el pescado
    // de ese calibre no tiene dónde caer.
    const unaSola = GATES_REALES.filter((g) => g.gateNumber !== 4)
    const f = compareGatesVsHistory(unaSola, history)
    const moves = suggestGateMoves(f, 11)
    expect(moves.every((m) => m.fromKey !== '2-4lb')).toBe(true)
  })

  it('no propone nada cuando la config ya está equilibrada', () => {
    // Gates repartidas siguiendo la producción real: 7 al 8-10, 2 al 10-12…
    const equilibrada: GateAssignment[] = [
      ...Array.from({ length: 7 }, (_, i) => ({ gateNumber: i + 1, assignedCalibre: '8-10 lb', assignedQuality: 'Premium', active: true })),
      { gateNumber: 8, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 9, assignedCalibre: '10-12 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 10, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 11, assignedCalibre: '6-8 lb', assignedQuality: 'Premium', active: true },
      { gateNumber: 12, assignedCalibre: '4-6 lb', assignedQuality: 'Industrial', active: true },
    ] as unknown as GateAssignment[]
    const f = compareGatesVsHistory(equilibrada, history)
    expect(f.find((x) => x.key === '8-10lb')!.status).toBe('optimo')
    expect(suggestGateMoves(f, 12)).toEqual([])
  })

  it('no cambia un cuello de botella por otro', () => {
    const moves = suggestGateMoves(fits, 12)
    // Ningún donante queda saturado después de ceder.
    const finales = new Map(compareGatesVsHistory(GATES_REALES, history).map((f) => [f.key, f.gates.length]))
    for (const m of moves) {
      finales.set(m.fromKey, finales.get(m.fromKey)! - 1)
      finales.set(m.toKey, finales.get(m.toKey)! + 1)
    }
    for (const [key, count] of finales) {
      const prod = history.rows.find((r) => r.key === key)?.pct ?? 0
      const ratio = count > 0 ? prod / ((count / 12) * 100) : Infinity
      if (prod > 0) expect(ratio).toBeLessThanOrEqual(2.26)
    }
  })

  it('sin gates activas no inventa movimientos', () => {
    expect(suggestGateMoves(fits, 0)).toEqual([])
  })
})

describe('piecesAtRisk', () => {
  it('suma las piezas de los calibres saturados', () => {
    const history = aggregateCalibreHistory(TURNOS_REALES)!
    const fits = compareGatesVsHistory(GATES_REALES, history)
    expect(piecesAtRisk(fits, history)).toBe(7703 + 3787 + 1045 + 3148 + 4522 + 669)
  })

  it('es 0 cuando nada está saturado', () => {
    const history = aggregateCalibreHistory(TURNOS_REALES)!
    expect(piecesAtRisk([], history)).toBe(0)
  })
})
