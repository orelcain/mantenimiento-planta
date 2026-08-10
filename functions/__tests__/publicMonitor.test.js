/**
 * Tests de `buildMonitorLive` (node:test nativo — correr con `node --test`).
 *
 * Este payload es lo ÚNICO que ve Control de Producción en el link público, y
 * se publica sin sesión: si un número sale mal acá, sale mal en la pantalla de
 * alguien que no tiene cómo contrastarlo contra la app.
 *
 * Invariantes que fijan estos tests:
 *   1. La cadencia se divide por la ventana REAL de producción, no por la del
 *      turno (en Filete el turno de Shoplogix es larguísimo y dividir por él
 *      daba pz/h absurdamente bajos).
 *   2. Un turno con la línea produciendo NUNCA se anuncia como cerrado: el
 *      `scheduledEnd` se deriva del último intervalo sincronizado, así que
 *      siempre queda unos minutos en el pasado (bug real visto el 10-ago-2026,
 *      turno vivo rotulado "Turno cerrado").
 *   3. La cadencia reciente mira los últimos 30 min y un 0 es un dato válido
 *      (la línea está parada AHORA), no un hueco.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { buildMonitorLive, currentStateOf, statusOf } = require('../publicMonitor')

/** Ahora en wall-clock de planta, que es el reloj de los datos de turno. */
function nowWall() {
  const now = new Date()
  const offsetH = -Number(
    now.toLocaleString('en-US', { timeZone: 'America/Santiago', timeZoneName: 'shortOffset' })
      .split('GMT')[1],
  )
  return new Date(now.getTime() - offsetH * 3600 * 1000)
}

const iso = (d) => new Date(d)

/** Stub mínimo del Firestore Admin SDK: solo lo que usa buildMonitorLive. */
function fakeDb({ parent, machines }) {
  return {
    doc: () => ({
      get: async () => ({ exists: !!parent, data: () => parent }),
      collection: () => ({
        get: async () => ({
          empty: machines.length === 0,
          docs: machines.map((m, i) => ({ id: m.machineid || `m${i}`, data: () => m })),
        }),
      }),
    }),
  }
}

/** Genera `count` intervalos de 5 min desde `startMs` con `cycles` piezas. */
function intervals(startMs, count, cycles) {
  return Array.from({ length: count }, (_, i) => ({
    startAt: iso(startMs + i * 5 * 60_000),
    endAt: iso(startMs + (i + 1) * 5 * 60_000),
    cycles,
    expectedCycles: 100,
  }))
}

test('la cadencia se calcula sobre la ventana real de producción, no la del turno', async () => {
  // Turno "de 24 h" (el caso Filete) con 2 h de producción real a 60 pz cada
  // 5 min = 720 pz/h. Si el denominador fuera la ventana del turno darían 60.
  const start = Date.UTC(2026, 7, 8, 8, 0, 0)
  const live = await buildMonitorLive(
    fakeDb({
      parent: {
        scheduledStart: iso(Date.UTC(2026, 7, 8, 0, 0, 0)),
        scheduledEnd: iso(Date.UTC(2026, 7, 9, 0, 0, 0)),
        lastSyncAt: iso(Date.UTC(2026, 7, 8, 10, 0, 0)),
      },
      machines: [{
        machineid: 'b200',
        machineName: 'Linea 1',
        machineType: 'baader_200',
        totalCycles: 1440,
        expectedTotalCycles: 2400,
        shiftRuntime: 0.8,
        shiftRuntimeBreakdown: { uptimeSec: 5760, downtimeSec: 1440, breakSec: 0 },
        intervals: intervals(start, 24, 60),
        states: [],
      }],
    }),
    'filete', '2026-08-08_Turno Dia',
  )

  assert.equal(live.totalPieces, 1440)
  assert.equal(live.windowSource, 'effective')
  assert.equal(live.windowHours, 2)
  assert.equal(live.piecesPerHour, 720)
  assert.equal(live.piecesPerMinute, 12)
  // Últimos 6 tramos de 5 min = 30 min × 60 pz = 360 pz → 12 pz/min.
  assert.equal(live.recentMinutes, 30)
  assert.equal(live.recentPieces, 360)
  assert.equal(live.recentPiecesPerMinute, 12)
})

test('un turno con la línea produciendo no se anuncia como cerrado', async () => {
  // El escenario exacto del bug: `scheduledEnd` en el pasado inmediato (se
  // deriva del último intervalo sincronizado) con la máquina en uptime.
  const end = nowWall().getTime() - 4 * 60_000
  const start = end - 2 * 3600_000

  const live = await buildMonitorLive(
    fakeDb({
      parent: { scheduledStart: iso(start), scheduledEnd: iso(end), lastSyncAt: new Date() },
      machines: [{
        machineid: 'b200',
        machineName: 'Linea 1',
        machineType: 'baader_200',
        totalCycles: 500,
        shiftRuntime: 0.9,
        shiftRuntimeBreakdown: { uptimeSec: 6000, downtimeSec: 600, breakSec: 0 },
        intervals: intervals(start, 24, 21),
        states: [{ startAt: iso(end - 600_000), endAt: iso(end), durationSec: 600, type: 'uptime', name: 'Produciendo', reason: '', isCurrent: true }],
      }],
    }),
    'filete', 'hoy_Turno Dia',
  )

  assert.equal(live.status, 'produciendo')
  assert.equal(live.shiftClosed, false, 'una línea produciendo no puede estar en un turno "cerrado"')
})

test('un turno viejo y sin producción sí queda marcado como cerrado', async () => {
  const end = Date.UTC(2026, 0, 5, 17, 0, 0)
  const start = Date.UTC(2026, 0, 5, 9, 0, 0)

  const live = await buildMonitorLive(
    fakeDb({
      parent: { scheduledStart: iso(start), scheduledEnd: iso(end), lastSyncAt: iso(end) },
      machines: [{
        machineid: 'b200',
        machineName: 'Linea 1',
        machineType: 'baader_200',
        totalCycles: 300,
        shiftRuntime: 0.5,
        shiftRuntimeBreakdown: { uptimeSec: 3600, downtimeSec: 3600, breakSec: 0 },
        intervals: intervals(start, 12, 25),
        states: [{ startAt: iso(end - 1800_000), endAt: iso(end), durationSec: 1800, type: 'downtime', name: 'Detencion', reason: 'LIMPIEZA', isCurrent: true }],
      }],
    }),
    'filete', '2026-01-05_Turno Dia',
  )

  assert.equal(live.shiftClosed, true)
  assert.equal(live.status, 'detenida')
  assert.equal(live.currentReason, 'LIMPIEZA')
  assert.deepEqual(live.topStops, [{ reason: 'LIMPIEZA', sec: 1800, count: 1 }])
})

test('la línea parada AHORA reporta 0 pz/min recientes (no un hueco)', async () => {
  const start = Date.UTC(2026, 7, 8, 8, 0, 0)
  const live = await buildMonitorLive(
    fakeDb({
      parent: { scheduledStart: iso(start), scheduledEnd: iso(start + 4 * 3600_000), lastSyncAt: iso(start) },
      machines: [{
        machineid: 'b200', machineName: 'Linea 1', machineType: 'baader_200',
        totalCycles: 600, shiftRuntime: 0.5,
        shiftRuntimeBreakdown: { uptimeSec: 1800, downtimeSec: 1800, breakSec: 0 },
        // 10 tramos produciendo y luego 6 tramos en cero (media hora parada).
        intervals: [...intervals(start, 10, 60), ...intervals(start + 50 * 60_000, 6, 0)],
        states: [],
      }],
    }),
    'filete', '2026-08-08_Turno Dia',
  )

  assert.equal(live.recentPieces, 0)
  assert.equal(live.recentPiecesPerMinute, 0)
  assert.equal(live.totalPieces, 600, 'el acumulado del turno no se ve afectado por la pausa')
})

test('sin máquinas sincronizadas devuelve null (no un turno vacío)', async () => {
  const live = await buildMonitorLive(fakeDb({ parent: {}, machines: [] }), 'filete', 'x_Turno Dia')
  assert.equal(live, null)
})

test('currentStateOf prefiere isCurrent y cae al último por tiempo', () => {
  const a = { startAt: iso(1000), name: 'A', type: 'uptime' }
  const b = { startAt: iso(2000), name: 'B', type: 'downtime', isCurrent: true }
  const c = { startAt: iso(3000), name: 'C', type: 'downtime' }

  assert.equal(currentStateOf([a, b, c]).name, 'B')
  assert.equal(currentStateOf([a, c]).name, 'C', 'sin isCurrent gana el más reciente')
  assert.equal(currentStateOf([]), null)
  assert.equal(statusOf(null), 'sin-datos')
  assert.equal(statusOf(a), 'produciendo')
  assert.equal(statusOf(c), 'detenida')
})
