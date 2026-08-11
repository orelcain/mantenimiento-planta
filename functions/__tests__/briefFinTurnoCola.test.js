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

// ── Continuidad: la cola es del turno que siguió de largo ────────────────────
// Regla de Orel (11-ago-2026): "solo si las piezas son continuas al turno, no
// sumarle piezas de otro tiempo horas después". Caso que la motivó: en Chonchi
// el turno NOCHE (21:15→05:00) se llevaba 1.048 pz de las 07:15 de la mañana
// —que son la cola del turno que cerró a esa hora— y mostraba 13.487 en vez de
// 12.170. Se veía hasta en el gráfico: una barra a las 7 AM en un turno que
// arrancó a las 21:30.

const NOCHE = { scheduledStart: iso(D(21, 15)), scheduledEnd: iso(Date.UTC(2026, 7, 11, 5, 0)) }
const NOCHE_DOC = '2026-08-10_Turno 1'

/** El día de Chonchi: turno que cierra 07:15, turno de día 09:15→17:00 y el noche. */
function dbChonchi(colaIntervals) {
  return fakeDb({
    shiftDocId: NOCHE_DOC,
    otros: {
      '2026-08-10_Turno 1 Lunes': {
        shiftId: 'Turno 1 Lunes', scheduledStart: iso(D(0, 0)), scheduledEnd: iso(D(7, 15)), machines: {},
      },
      '2026-08-10_Turno 2': {
        shiftId: 'Turno 2', scheduledStart: iso(D(9, 15)), scheduledEnd: iso(D(17, 0)), machines: {},
      },
      '2026-08-10_Unscheduled': {
        shiftId: 'Unscheduled', machines: { m1: { intervals: colaIntervals, states: [] } },
      },
    },
  })
}

test('el turno noche NO se lleva las piezas de la mañana (caso Chonchi 10-ago)', async () => {
  const machines = [{ id: 'm1', totalCycles: 12170, intervals: intervals(D(21, 30), 4, 100), states: [] }]
  const out = await sumarColaAMaquinas(
    dbChonchi(intervals(D(7, 15), 6, 175)),   // 1.050 pz a las 07:15, 14 h antes del turno
    'chonchi', NOCHE_DOC, NOCHE, machines,
  )
  assert.strictEqual(out.pieces, 0)
  assert.strictEqual(machines[0].totalCycles, 12170, 'el turno noche vale lo que produjo')
})

test('esas mismas piezas SÍ son del turno que cerró a las 07:15', async () => {
  const machines = [{ id: 'm1', totalCycles: 9543, intervals: intervals(D(4, 50), 4, 100), states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: '2026-08-10_Turno 1 Lunes',
      otros: {
        '2026-08-10_Turno 1': { shiftId: 'Turno 1', scheduledStart: iso(D(21, 15)), scheduledEnd: iso(Date.UTC(2026, 7, 11, 5, 0)), machines: {} },
        '2026-08-10_Unscheduled': { shiftId: 'Unscheduled', machines: { m1: { intervals: intervals(D(7, 15), 6, 175), states: [] } } },
      },
    }),
    'chonchi', '2026-08-10_Turno 1 Lunes',
    { scheduledStart: iso(D(0, 0)), scheduledEnd: iso(D(7, 15)) },
    machines,
  )
  assert.strictEqual(out.pieces, 1050, 'arranca en el mismo minuto en que cerró: es su cola')
})

test('sin otro turno que compita, la lejanía IGUAL descarta el bloque', async () => {
  // Lo que el usuario pidió explícitamente: que no baste con ser el único turno
  // del día para quedarse con producción de horas después.
  const machines = [{ id: 'm1', totalCycles: 4410, intervals: intervals(D(8, 0), 4, 100), states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: SHIFT_DOC,
      otros: { '2026-08-10_Unscheduled': { shiftId: 'Unscheduled', machines: { m1: { intervals: intervals(D(20, 0), 6, 100), states: [] } } } },
    }),
    'filete', SHIFT_DOC, PARENT, machines,   // turno 07:45→15:30, bloque a las 20:00
  )
  assert.strictEqual(out.pieces, 0, '4 h 30 min después no es la misma jornada')
})

test('un bloque pegado al cierre sigue siendo cola aunque dure horas', async () => {
  // La continuidad se mide del BORDE del bloque al turno, no de su duración: el
  // turno se alargó 3 h y eso es exactamente lo que hay que contar.
  const machines = [{ id: 'm1', totalCycles: 4410, intervals: intervals(D(8, 0), 4, 100), states: [] }]
  const out = await sumarColaAMaquinas(
    fakeDb({
      shiftDocId: SHIFT_DOC,
      otros: { '2026-08-10_Unscheduled': { shiftId: 'Unscheduled', machines: { m1: { intervals: intervals(D(15, 40), 36, 50), states: [] } } } },
    }),
    'filete', SHIFT_DOC, PARENT, machines,   // 15:40 → 18:40, arranca 10 min tras el cierre
  )
  assert.strictEqual(out.pieces, 1800)
})

test('entre dos turnos a la misma distancia gana el que ya cerró, y solo uno', async () => {
  // Un tramo va a UN turno: ni a los dos (doble conteo) ni a ninguno (piezas
  // perdidas). A 20 min del cierre de uno y del arranque del otro.
  const cerro = { scheduledStart: iso(D(0, 0)), scheduledEnd: iso(D(7, 0)) }
  const abre  = { shiftId: 'Turno 2', scheduledStart: iso(D(8, 0)), scheduledEnd: iso(D(16, 0)), machines: {} }
  const cola  = intervals(D(7, 20), 4, 60)   // 07:20 → 07:40: 20 min de cada uno
  const conf = (docId, otros) => fakeDb({ shiftDocId: docId, otros })

  const mA = [{ id: 'm1', totalCycles: 1000, intervals: [], states: [] }]
  const desdeElQueCerro = await sumarColaAMaquinas(
    conf('2026-08-10_Turno 1', { '2026-08-10_Turno 2': abre, '2026-08-10_Unscheduled': { shiftId: 'Unscheduled', machines: { m1: { intervals: cola, states: [] } } } }),
    'chonchi', '2026-08-10_Turno 1', cerro, mA,
  )

  const mB = [{ id: 'm1', totalCycles: 2000, intervals: [], states: [] }]
  const desdeElQueAbre = await sumarColaAMaquinas(
    conf('2026-08-10_Turno 2', { '2026-08-10_Turno 1': { shiftId: 'Turno 1', ...cerro, machines: {} }, '2026-08-10_Unscheduled': { shiftId: 'Unscheduled', machines: { m1: { intervals: cola, states: [] } } } }),
    'chonchi', '2026-08-10_Turno 2', { scheduledStart: iso(D(8, 0)), scheduledEnd: iso(D(16, 0)) }, mB,
  )

  assert.strictEqual(desdeElQueCerro.pieces + desdeElQueAbre.pieces, 240, 'las piezas se cuentan UNA vez')
  assert.strictEqual(desdeElQueCerro.pieces, 240, 'la cola es del turno que venía trabajando')
})
