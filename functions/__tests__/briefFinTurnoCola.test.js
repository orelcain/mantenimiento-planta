/**
 * Tests de `sumarColaAMaquinas` (node:test nativo — correr con `node --test`).
 *
 * Por qué existe: Shoplogix cierra el turno a una hora fija y manda a
 * `Unscheduled` lo que la línea produzca después. El brief de fin de turno
 * anunciaba solo el doc del turno, así que en Filete —donde la línea se pasa
 * del horario TODOS los días— avisaba menos producción de la que hubo
 * (10-ago-2026: 4.410 en vez de 4.915).
 *
 * Invariantes que fijan estos tests:
 *   1. La cola se suma a la máquina y se reporta aparte para el desglose.
 *   2. NUNCA se cuenta dos veces un minuto que el turno ya tiene: el doc del
 *      turno guarda intervals más allá de su `scheduledEnd` y Shoplogix repite
 *      esos mismos minutos en `Unscheduled`.
 *   3. Un puñado de piezas sueltas (higiene, prueba de línea) no es producción.
 *   4. Sin cola, las máquinas quedan intactas — un turno normal de Chonchi o
 *      Yal tiene que seguir reportando exactamente lo mismo que antes.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { sumarColaAMaquinas } = require('../publicMonitor')

const iso = (ms) => new Date(ms)

/** Intervalos de 5 min desde `startMs`. */
function intervals(startMs, count, cycles) {
  return Array.from({ length: count }, (_, i) => ({
    startAt: iso(startMs + i * 5 * 60_000),
    endAt: iso(startMs + (i + 1) * 5 * 60_000),
    cycles,
  }))
}

/**
 * Stub de Firestore con varios docs de turno del mismo día. `otros` es un mapa
 * docId → { shiftId, scheduledStart, scheduledEnd, machines: {docId: {...}} }.
 */
function fakeDb({ shiftDocId, otros }) {
  const ids = [shiftDocId, ...Object.keys(otros)]
  return {
    collection: (path) => {
      const m = path.match(/shifts\/([^/]+)\/machines$/)
      if (m) {
        const maquinas = otros[m[1]]?.machines || {}
        return {
          get: async () => ({
            forEach: (fn) => Object.entries(maquinas)
              .forEach(([id, data]) => fn({ id, data: () => data })),
          }),
        }
      }
      return { listDocuments: async () => ids.map((id) => ({ id })) }
    },
    getAll: async (...refs) => refs.map((r) => ({
      id: r.id,
      exists: true,
      data: () => (r.id === shiftDocId
        ? { shiftId: 'Turno Dia' }
        : { shiftId: otros[r.id].shiftId, scheduledStart: otros[r.id].scheduledStart, scheduledEnd: otros[r.id].scheduledEnd }),
    })),
  }
}

// Turno Dia de Filete: 07:45 → 15:30, y la línea siguió hasta las 16:30.
const D = (h, min) => Date.UTC(2026, 7, 10, h, min, 0)
const PARENT = { scheduledStart: iso(D(7, 45)), scheduledEnd: iso(D(15, 30)) }
const SHIFT_DOC = '2026-08-10_Turno Dia'

test('suma la cola de después del horario y la reporta aparte', async () => {
  // 10 tramos de 50 pz desde las 15:40 = 500 piezas fuera del turno.
  const machines = [{ id: 'm1', totalCycles: 4410, intervals: intervals(D(7, 45), 3, 40), states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: SHIFT_DOC,
      otros: {
        '2026-08-10_Unscheduled': {
          shiftId: 'Unscheduled',
          machines: { m1: { intervals: intervals(D(15, 40), 10, 50), states: [] } },
        },
      },
    }),
    'filete', SHIFT_DOC, PARENT, machines,
  )

  assert.strictEqual(out.pieces, 500)
  assert.strictEqual(machines[0].totalCycles, 4910, 'la máquina tiene que quedar con la jornada completa')
  assert.strictEqual(out.start.getTime(), D(15, 40))
  assert.strictEqual(out.end.getTime(), D(16, 30))
  assert.strictEqual(out.lastPieceAt.getTime(), out.end.getTime())
})

test('no cuenta dos veces los minutos que el turno ya tiene', async () => {
  // El doc del turno guarda hasta las 15:40 y Shoplogix repite 15:30 y 15:35
  // dentro de Unscheduled (caso real: 47 + 65 = 112 piezas infladas).
  const delTurno = [...intervals(D(7, 45), 2, 40), ...intervals(D(15, 30), 2, 56)]
  const machines = [{ id: 'm1', totalCycles: 4410, intervals: delTurno, states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: SHIFT_DOC,
      otros: {
        '2026-08-10_Unscheduled': {
          shiftId: 'Unscheduled',
          // Los mismos 15:30 y 15:35, más 8 tramos nuevos de 50.
          machines: { m1: { intervals: [...intervals(D(15, 30), 2, 56), ...intervals(D(15, 40), 8, 50)], states: [] } },
        },
      },
    }),
    'filete', SHIFT_DOC, PARENT, machines,
  )

  assert.strictEqual(out.pieces, 400, 'los 112 repetidos no se suman')
  assert.strictEqual(machines[0].totalCycles, 4810)
})

test('un puñado de piezas sueltas es ruido, no producción', async () => {
  // 6 piezas a las 06:10 (higiene / prueba de línea) — bajo OUTSIDE_MIN_PIECES.
  const machines = [{ id: 'm1', totalCycles: 4410, intervals: intervals(D(7, 45), 2, 40), states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: SHIFT_DOC,
      otros: {
        '2026-08-10_Unscheduled': {
          shiftId: 'Unscheduled',
          machines: { m1: { intervals: intervals(D(6, 10), 1, 6), states: [] } },
        },
      },
    }),
    'filete', SHIFT_DOC, PARENT, machines,
  )

  assert.strictEqual(out.pieces, 0)
  assert.strictEqual(machines[0].totalCycles, 4410, 'la máquina no se toca')
})

test('lo que cae dentro de la ventana de OTRO turno ya lo contó ese turno', async () => {
  const machines = [{ id: 'm1', totalCycles: 4410, intervals: intervals(D(7, 45), 2, 40), states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: SHIFT_DOC,
      otros: {
        '2026-08-10_Turno Noche': {
          shiftId: 'Turno Noche',
          scheduledStart: iso(D(16, 0)),
          scheduledEnd: iso(D(23, 0)),
          machines: {},
        },
        '2026-08-10_Unscheduled': {
          shiftId: 'Unscheduled',
          // 16:05 en adelante: cae dentro del Turno Noche.
          machines: { m1: { intervals: intervals(D(16, 5), 6, 50), states: [] } },
        },
      },
    }),
    'filete', SHIFT_DOC, PARENT, machines,
  )

  assert.strictEqual(out.pieces, 0, 'sería doble conteo contra el turno de al lado')
})

test('sin cola, las máquinas quedan exactamente igual', async () => {
  const machines = [{ id: 'm1', totalCycles: 9902, intervals: intervals(D(9, 15), 4, 80), states: [{ x: 1 }] }]
  const antes = JSON.stringify(machines)
  const out = await sumarColaAMaquinas(
    fakeDb({ shiftDocId: SHIFT_DOC, otros: {} }),
    'chonchi', SHIFT_DOC, PARENT, machines,
  )

  assert.strictEqual(out.pieces, 0)
  assert.strictEqual(out.lastPieceAt, null, 'sin cola no hay por qué postergar el brief')
  assert.strictEqual(JSON.stringify(machines), antes)
})

test('un turno sin horario definido no intenta rescatar nada', async () => {
  const machines = [{ id: 'm1', totalCycles: 100, intervals: [], states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({ shiftDocId: SHIFT_DOC, otros: {} }),
    'filete', SHIFT_DOC, { scheduledStart: null, scheduledEnd: null }, machines,
  )
  assert.strictEqual(out.pieces, 0)
})
