/**
 * Tests de normalizer.js — foco en los 2 fixes de esta sesión:
 *   1. clipStateToWindow: un state que cruza el límite del turno se recorta
 *      en vez de contarse COMPLETO en los 2 turnos adyacentes (bug real
 *      confirmado: downtime de 7.9h duplicado íntegro en 2 docs de Firestore).
 *   2. normalizeComment/normalizeComments: se preserva start/end/matchField/
 *      matchValue (antes se descartaba todo salvo el texto) y se dedupea por
 *      key/displayId (antes summary+production podían duplicar el mismo comentario).
 *
 * Correr con `node --test` (mismo runner que canonicalShift.test.js).
 */
const { test } = require('node:test')
const assert = require('node:assert')
const {
  clipStateToWindow,
  normalizeComment,
  normalizeComments,
  normalizeState,
  normalizeShift,
  normalizeInterval,
  aggregateScrapReasons,
} = require('../normalizer')

// ── clipStateToWindow ────────────────────────────────────────────────────────

test('clipStateToWindow: state totalmente dentro de la ventana queda sin cambios', () => {
  const s = {
    startAt: new Date('2026-07-07T10:00:00Z'),
    endAt:   new Date('2026-07-07T10:05:00Z'),
    durationSec: 300, type: 'downtime', name: 'Detencion', reason: 'X', color: '#fff', isCurrent: false,
  }
  const clipped = clipStateToWindow(s, new Date('2026-07-07T00:00:00Z'), new Date('2026-07-08T00:00:00Z'))
  assert.strictEqual(clipped, s) // misma referencia — no se creó objeto nuevo
})

test('clipStateToWindow: state que cruza el fin del turno se recorta y recalcula durationSec', () => {
  // Caso real: downtime "LOGICA" que arranca antes de medianoche y sigue después.
  const s = {
    startAt: new Date('2026-07-05T23:50:31.806Z'),
    endAt:   new Date('2026-07-06T07:45:00.000Z'),
    durationSec: 28468, type: 'downtime', name: 'Detencion', reason: 'LOGICA', color: '#fff', isCurrent: false,
  }
  const windowStart = new Date('2026-07-05T14:45:00.000Z')
  const windowEnd   = new Date('2026-07-06T00:00:00.000Z') // Turno 2 termina a medianoche
  const clipped = clipStateToWindow(s, windowStart, windowEnd)
  assert.strictEqual(clipped.endAt.getTime(), windowEnd.getTime())
  assert.strictEqual(clipped.startAt.getTime(), s.startAt.getTime()) // no toca el inicio, ya estaba dentro
  const expectedSec = Math.round((windowEnd.getTime() - s.startAt.getTime()) / 1000)
  assert.strictEqual(clipped.durationSec, expectedSec)
  assert.ok(clipped.durationSec < s.durationSec, 'la duración recortada debe ser menor a la original')
})

test('clipStateToWindow: state que cruza el inicio del turno se recorta desde el otro lado', () => {
  const s = {
    startAt: new Date('2026-07-05T23:50:31.806Z'),
    endAt:   new Date('2026-07-06T07:45:00.000Z'),
    durationSec: 28468, type: 'downtime', name: 'Detencion', reason: 'LOGICA', color: '#fff', isCurrent: false,
  }
  const windowStart = new Date('2026-07-06T00:00:00.000Z') // Turno 3 arranca a medianoche
  const windowEnd   = new Date('2026-07-06T07:45:00.000Z')
  const clipped = clipStateToWindow(s, windowStart, windowEnd)
  assert.strictEqual(clipped.startAt.getTime(), windowStart.getTime())
  assert.strictEqual(clipped.endAt.getTime(), s.endAt.getTime())
  const expectedSec = Math.round((windowEnd.getTime() - windowStart.getTime()) / 1000)
  assert.strictEqual(clipped.durationSec, expectedSec)
})

test('clipStateToWindow: repartido entre 2 turnos suma la duración original (sin duplicar ni perder tiempo)', () => {
  const s = {
    startAt: new Date('2026-07-05T23:50:31.806Z'),
    endAt:   new Date('2026-07-06T07:45:00.000Z'),
    durationSec: 28468, type: 'downtime', name: 'Detencion', reason: 'LOGICA', color: '#fff', isCurrent: false,
  }
  const mid = new Date('2026-07-06T00:00:00.000Z')
  const part1 = clipStateToWindow(s, new Date('2026-07-05T14:45:00.000Z'), mid)
  const part2 = clipStateToWindow(s, mid, new Date('2026-07-06T07:45:00.000Z'))
  assert.strictEqual(part1.durationSec + part2.durationSec, s.durationSec)
})

// ── normalizeComment ──────────────────────────────────────────────────────

test('normalizeComment: string legado se preserva como texto sin correlación', () => {
  const c = normalizeComment('Quiebre de stock')
  assert.deepStrictEqual(c, { key: 'Quiebre de stock', text: 'Quiebre de stock', startAt: null, endAt: null, reasonField: '', reasonValue: '' })
})

test('normalizeComment: string vacío se descarta', () => {
  assert.strictEqual(normalizeComment('   '), null)
})

test('normalizeComment: objeto rico preserva start/end/matchField/matchValue/key', () => {
  const raw = {
    start: '20260708T010000.000', end: '20260708T080000.000',
    key: '20260708-1026-34-900-4766rhci',
    text: 'Quiebre de stock',
    matchField: 'reason', matchValue: 'FALTA MMPP',
    displayId: '966006',
  }
  const c = normalizeComment(raw)
  assert.strictEqual(c.key, raw.key)
  assert.strictEqual(c.text, 'Quiebre de stock')
  assert.strictEqual(c.reasonField, 'reason')
  assert.strictEqual(c.reasonValue, 'FALTA MMPP')
  assert.strictEqual(c.startAt.toISOString(), '2026-07-08T01:00:00.000Z')
  assert.strictEqual(c.endAt.toISOString(), '2026-07-08T08:00:00.000Z')
})

test('normalizeComment: usa displayId cuando falta key', () => {
  const c = normalizeComment({ text: 'algo', displayId: 'abc123' })
  assert.strictEqual(c.key, 'abc123')
})

test('normalizeComment: key sintético cuando faltan key y displayId', () => {
  const c = normalizeComment({ text: 'algo', start: '20260708T010000.000' })
  assert.strictEqual(c.key, 'algo|20260708T010000.000')
})

test('normalizeComment: objeto sin texto útil se descarta', () => {
  assert.strictEqual(normalizeComment({ start: '20260708T010000.000' }), null)
  assert.strictEqual(normalizeComment({ text: '' }), null)
  assert.strictEqual(normalizeComment(null), null)
  assert.strictEqual(normalizeComment(42), null)
})

test('normalizeComment: acepta fallback comment/message/body para el texto', () => {
  assert.strictEqual(normalizeComment({ comment: 'via comment' }).text, 'via comment')
  assert.strictEqual(normalizeComment({ message: 'via message' }).text, 'via message')
  assert.strictEqual(normalizeComment({ body: 'via body' }).text, 'via body')
})

// ── normalizeComments (merge + dedupe) ───────────────────────────────────────

test('normalizeComments: dedupea por key cuando summary y production traen el mismo comentario', () => {
  const shared = { key: 'K1', text: 'CORTE DE ENERGIA', start: '20260707T200000.000', end: '20260707T210000.000', matchValue: 'ENERGIA' }
  const result = normalizeComments([shared, { ...shared }])
  assert.strictEqual(result.length, 1)
  assert.strictEqual(result[0].key, 'K1')
})

test('normalizeComments: conserva comentarios con keys distintas', () => {
  const result = normalizeComments([
    { key: 'K1', text: 'A' },
    { key: 'K2', text: 'B' },
  ])
  assert.strictEqual(result.length, 2)
})

test('normalizeComments: array vacío o undefined da []', () => {
  assert.deepStrictEqual(normalizeComments([]), [])
  assert.deepStrictEqual(normalizeComments(undefined), [])
})

// ── normalizeShift: integración end-to-end ───────────────────────────────────

function baseProduction(overrides = {}) {
  return {
    machineId: 'm1', machineName: 'Evisceradora 1', comments: [],
    currentShiftStart: '20260707T144500.000', currentShiftEnd: '20260708T000000.000',
    machineProduction: [], productionUnits: 'Eviscerado', threshold: 15,
    ...overrides,
  }
}
function baseSummary(overrides = {}) {
  return {
    machineId: 'm1', machineName: 'Evisceradora 1',
    currentShiftStart: '20260707T144500.000', currentShiftEnd: '20260708T000000.000',
    runtimeVariance: 0, expectedRuntime: 0, actualRuntime: 0,
    machineStates: [], comments: [],
    ...overrides,
  }
}

test('normalizeShift: un state que cruza el fin del turno queda recortado en el doc final (no duplicado)', () => {
  const shiftStartAt = new Date('2026-07-07T14:45:00.000Z')
  const shiftEndAt   = new Date('2026-07-08T00:00:00.000Z')
  const summary = baseSummary({
    machineStates: [{
      name: 'Detencion', reason: 'LOGICA', reasonRootCause: false, reasonRootCauseName: '',
      statusColor: '0000ff', reasonColor: '', acceptsReason: true, reasonExceeded: false, setupExceeded: false,
      type: 'Downtime', current: false,
      start: '20260707T235031.806', end: '20260708T074500.000',
      startMilli: 0, endMilli: 0, durationMilli: 28468000,
    }],
  })
  const shift = normalizeShift({
    production: baseProduction(), summary,
    dateKey: '2026-07-07', shiftId: 'Turno 2', shiftStartAt, shiftEndAt, scheduleSource: 'intervals',
  })
  assert.strictEqual(shift.states.length, 1)
  assert.strictEqual(shift.states[0].endAt.getTime(), shiftEndAt.getTime())
  assert.ok(shift.states[0].durationSec < 28468, 'debe quedar recortado, no la duración completa de 7.9h')
})

test('normalizeShift: comments se normalizan y dedupean entre summary y production', () => {
  const shared = { key: 'K1', text: 'problemas en sistema 2 bombeo', start: '20260707T210000.000', end: '20260707T220000.000', matchValue: 'FALTA MMPP' }
  const shift = normalizeShift({
    production: baseProduction({ comments: [shared] }),
    summary: baseSummary({ comments: [shared] }),
    dateKey: '2026-07-07', shiftId: 'Turno 2',
    shiftStartAt: new Date('2026-07-07T14:45:00.000Z'), shiftEndAt: new Date('2026-07-08T00:00:00.000Z'),
  })
  assert.strictEqual(shift.comments.length, 1, 'no debe duplicar el mismo comentario de summary+production')
  assert.strictEqual(shift.comments[0].reasonValue, 'FALTA MMPP')
})

// ── Campos del sensor que antes se descartaban (Filete / Baader 200) ─────────
// El sensor manda por intervalo `rate`, `uptimeCycles`, `scheduledCycles` y
// `scrapReasons`; el normalizer se quedaba solo con cycles/expectedCycles.
// En Filete no hay Grader, así que `scrapReasons` es el ÚNICO origen posible
// de un factor Calidad — por eso se fija su contrato acá.

/** UUID real de la Baader 200 de Línea 1 (Filete) — ver docs/SHOPLOGIX_API.md. */
const BAADER_200_ID = '3c0581da-9f19-49f0-aa15-b1596ae94dbd'

test('normalizeInterval: guarda la cadencia OBJETIVO del sensor y null si no viene', () => {
  const start = new Date('2026-07-28T12:00:00.000Z')
  // Caso real: objetivo 20 pz/min con la máquina PARADA (cycles 0). Si esto se
  // interpretara como velocidad real, el gráfico mostraría 20 pz/min sin producción.
  const parada = normalizeInterval({ cycles: 0, expectedCycles: 100, totalDuration: 300000, rate: 20 }, start, 15)
  assert.strictEqual(parada.targetRate, 20)
  assert.strictEqual(parada.cycles, 0, 'la velocidad real es cycles/duración, no targetRate')
  const sinRate = normalizeInterval({ cycles: 100, expectedCycles: 100, totalDuration: 300000 }, start, 15)
  assert.strictEqual(sinRate.targetRate, null, 'sin dato del sensor => null, nunca 0 (0 sería objetivo cero)')
})

test('aggregateScrapReasons: suma por causa, ordena por cantidad y tolera formas distintas', () => {
  const out = aggregateScrapReasons([
    { scrapReasons: [{ reason: 'CORTE MALO', quantity: 3 }] },
    { scrapReasons: [{ reason: 'CORTE MALO', quantity: 2 }, { name: 'PIEL', count: 9 }] },
    { scrapReasons: [] },
    { },
  ])
  assert.deepStrictEqual(out, [{ reason: 'PIEL', qty: 9 }, { reason: 'CORTE MALO', qty: 5 }])
})

test('aggregateScrapReasons: sin scrap reconocible devuelve lista vacía (no inventa cantidades)', () => {
  assert.deepStrictEqual(aggregateScrapReasons([{ scrapReasons: [{ reason: 'X', quantity: 0 }] }, { scrapReasons: [null] }]), [])
  assert.deepStrictEqual(aggregateScrapReasons(undefined), [])
})

test('normalizeShift: totaliza uptimeCycles/scheduledCycles y el scrap del sensor', () => {
  const shift = normalizeShift({
    production: baseProduction({
      machineId: BAADER_200_ID, machineName: 'Linea 1', productionUnits: 'Filetes',
      machineProduction: [
        { start: '20260728T120000.000', cycles: 10, expectedCycles: 25, total: 10, expectedTotal: 25, totalDuration: 300000, rate: 2, uptimeCycles: 10, scheduledCycles: 10, scrapReasons: [{ reason: 'CORTE MALO', quantity: 2 }] },
        { start: '20260728T120500.000', cycles: 5,  expectedCycles: 25, total: 15, expectedTotal: 50, totalDuration: 300000, rate: 1, uptimeCycles: 4,  scheduledCycles: 5,  scrapReasons: [] },
      ],
    }),
    summary: baseSummary({ machineId: BAADER_200_ID, machineName: 'Linea 1' }),
    dateKey: '2026-07-28', shiftId: 'Turno Dia',
    shiftStartAt: new Date('2026-07-28T11:30:00.000Z'), shiftEndAt: new Date('2026-07-28T19:45:00.000Z'),
    scheduleSource: 'intervals',
  })
  assert.strictEqual(shift.uptimeCycles, 14)
  assert.strictEqual(shift.scheduledCycles, 15)
  assert.strictEqual(shift.scrapTotal, 2)
  assert.deepStrictEqual(shift.scrapByReason, [{ reason: 'CORTE MALO', qty: 2 }])
  assert.strictEqual(shift.intervals[0].targetRate, 2)
  assert.strictEqual(shift.productionUnit, 'Filetes')
  assert.strictEqual(shift.machineType, 'baader_200', 'la Baader 200 debe reconocerse, no caer en "other"')
})
