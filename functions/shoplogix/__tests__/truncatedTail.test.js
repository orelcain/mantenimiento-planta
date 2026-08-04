/**
 * Tests de `isTruncatedTailOfNextWindow` (node:test nativo — `node --test`).
 *
 * Caso real que motivó el helper (03-ago-2026): el turno de Filete arrancó 07:45,
 * quince minutos antes del borde de 08:00. Esos intervals cayeron dentro de la
 * ventana del día ANTERIOR ya etiquetados "Turno Dia", y el re-sync horario de
 * ayer (que corre con `forceAll`) pisó el doc del turno completo — 2.406 ciclos
 * quedaron en 4. Después el freeze impedía repararlo.
 *
 * La regla es asimétrica en sentido contrario al freeze: aquí un falso `true`
 * DEJA DE ESCRIBIR un turno que quizá nadie más escriba, así que solo se saltea
 * con evidencia doble (cortado en el borde + doc que ya sabe más).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { isTruncatedTailOfNextWindow } = require('../sync')

const silentLogger = { warn() {}, info() {}, error() {} }

// Ventana del 2026-08-02: 08:00 del 02 → 08:00 del 03 (wall-clock-as-UTC).
const WINDOW_END = new Date('2026-08-03T08:00:00Z')

function fakeDb({ data, exists = true, throws = false }) {
  return {
    doc: () => ({
      get: async () => {
        if (throws) throw new Error('firestore unavailable')
        return { exists, data: () => data }
      },
    }),
  }
}

const call = (db, scheduledEnd) => isTruncatedTailOfNextWindow({
  db,
  plantSlug: 'filete',
  parentShiftDateKey: '2026-08-03',
  shiftId: 'Turno Dia',
  scheduledEnd,
  windowEnd: WINDOW_END,
  logger: silentLogger,
})

test('el caso real: cola 07:45→08:00 con el turno completo ya guardado → saltear', async () => {
  const db = fakeDb({ data: { scheduledEnd: new Date('2026-08-03T15:30:00Z') } })
  assert.equal(await call(db, WINDOW_END), true)
})

test('turno que termina antes del borde no se toca (nocturno sano 00:00→07:15)', async () => {
  const db = fakeDb({ data: { scheduledEnd: new Date('2026-08-03T15:30:00Z') } })
  assert.equal(await call(db, new Date('2026-08-03T07:15:00Z')), false)
})

test('cortado en el borde pero SIN doc guardado → escribir (no perder el turno)', async () => {
  const db = fakeDb({ data: undefined, exists: false })
  assert.equal(await call(db, WINDOW_END), false)
})

test('cortado en el borde y el doc termina justo en el borde → escribir', async () => {
  // Turno legítimo que de verdad terminó a las 08:00: nadie sabe más que nosotros.
  const db = fakeDb({ data: { scheduledEnd: new Date('2026-08-03T08:00:00Z') } })
  assert.equal(await call(db, WINDOW_END), false)
})

test('doc con scheduledEnd anterior al borde → escribir (corrección retroactiva a la baja)', async () => {
  const db = fakeDb({ data: { scheduledEnd: new Date('2026-08-03T06:00:00Z') } })
  assert.equal(await call(db, WINDOW_END), false)
})

test('doc sin scheduledEnd → escribir', async () => {
  const db = fakeDb({ data: { lastSyncAt: new Date() } })
  assert.equal(await call(db, WINDOW_END), false)
})

test('scheduledEnd guardado como Timestamp de Firestore (toDate) → se interpreta', async () => {
  const stored = new Date('2026-08-03T15:30:00Z')
  const db = fakeDb({ data: { scheduledEnd: { toDate: () => stored } } })
  assert.equal(await call(db, WINDOW_END), true)
})

test('scheduledEnd guardado como string ISO → se interpreta', async () => {
  const db = fakeDb({ data: { scheduledEnd: '2026-08-03T15:30:00.000Z' } })
  assert.equal(await call(db, WINDOW_END), true)
})

test('scheduledEnd corrupto → escribir', async () => {
  const db = fakeDb({ data: { scheduledEnd: 'no es una fecha' } })
  assert.equal(await call(db, WINDOW_END), false)
})

test('error de lectura → escribir (nunca dejar de guardar por una falla de Firestore)', async () => {
  assert.equal(await call(fakeDb({ throws: true }), WINDOW_END), false)
})

test('cola que se pasa del borde (scheduledEnd > windowEnd) también cuenta como cortada', async () => {
  // Defensivo: si por redondeo el último interval excede el borde, sigue siendo cola.
  const db = fakeDb({ data: { scheduledEnd: new Date('2026-08-03T15:30:00Z') } })
  assert.equal(await call(db, new Date('2026-08-03T08:00:00.500Z')), true)
})
