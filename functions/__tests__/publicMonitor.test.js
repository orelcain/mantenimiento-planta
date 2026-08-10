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

// ─────────────────────────────────────────────────────────────────────────────
// Modo `line`: el link que NO hay que regenerar cada día.
//
// Lo que se juega acá es que el QR pegado en la pared apunte siempre al turno
// correcto. Los dos modos de equivocarse son simétricos y ambos rompen la
// confianza en la pantalla: quedarse pegado en el turno de ayer, o saltar a un
// turno viejo porque el re-sync móvil reescribió su doc padre.
// ─────────────────────────────────────────────────────────────────────────────

const { resolveCurrentShiftDocId, buildMonitorPatch } = require('../publicMonitor')

/** db falso con varios docs padre de turno, direccionables por id. */
function fakeShiftsDb(parents, machinesByShift = {}) {
  const ids = Object.keys(parents)
  return {
    collection: (path) => ({
      listDocuments: async () => ids.map(id => ({ id, path: `${path}/${id}` })),
      limit: () => ({ get: async () => ({ empty: ids.length === 0 }) }),
    }),
    getAll: async (...refs) => refs.map(r => ({
      id: r.id,
      exists: true,
      data: () => parents[r.id],
    })),
    doc: (path) => {
      const id = path.split('/shifts/')[1]
      return {
        get: async () => ({ exists: !!parents[id], data: () => parents[id] }),
        collection: () => ({
          get: async () => {
            const ms = machinesByShift[id] || []
            return { empty: ms.length === 0, docs: ms.map((m, i) => ({ id: m.machineid || `m${i}`, data: () => m })) }
          },
        }),
      }
    },
  }
}

const hoy = (h, m = 0) => {
  const w = nowWall()
  return new Date(Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate(), h, m))
}
const dk = (d) => d.toISOString().slice(0, 10)

test('modo línea: elige el turno cuya ventana contiene el reloj de planta', async () => {
  const w = nowWall()
  const hora = w.getUTCHours()
  // Turno "vigente" = una ventana de 2 h centrada en el ahora; el otro terminó
  // varias horas antes.
  const vigenteId = `${dk(w)}_Turno Dia`
  const viejoId = `${dk(w)}_Turno Madrugada`

  const db = fakeShiftsDb({
    [viejoId]:   { shiftId: 'Turno Madrugada', scheduledStart: hoy(Math.max(0, hora - 8)), scheduledEnd: hoy(Math.max(1, hora - 6)), machines: [{ totalCycles: 900 }] },
    [vigenteId]: { shiftId: 'Turno Dia',       scheduledStart: hoy(hora, 0),               scheduledEnd: new Date(w.getTime() + 60 * 60_000), machines: [{ totalCycles: 500 }] },
  })

  assert.equal(await resolveCurrentShiftDocId(db, 'filete', w), vigenteId)
})

test('modo línea: entre turnos cae al último que ya empezó, no a una pantalla vacía', async () => {
  const w = nowWall()
  const hora = w.getUTCHours()
  if (hora < 3) return   // a esta hora no se puede construir el escenario "más temprano hoy"

  const tempranoId = `${dk(w)}_Turno A`
  const anteriorId = `${dk(w)}_Turno B`

  const db = fakeShiftsDb({
    [tempranoId]: { shiftId: 'Turno A', scheduledStart: hoy(0), scheduledEnd: hoy(1), machines: [{ totalCycles: 100 }] },
    [anteriorId]: { shiftId: 'Turno B', scheduledStart: hoy(hora - 3), scheduledEnd: hoy(hora - 2), machines: [{ totalCycles: 800 }] },
  })

  // Ninguno contiene el ahora (el más reciente terminó hace ~2 h, fuera de la
  // gracia de 30 min) → gana el que arrancó más tarde.
  assert.equal(await resolveCurrentShiftDocId(db, 'filete', w), anteriorId)
})

test('modo línea: un turno FUTURO todavía no es el vigente', async () => {
  const w = nowWall()
  const hora = w.getUTCHours()
  if (hora > 20) return

  const actualId = `${dk(w)}_Turno Dia`
  const futuroId = `${dk(w)}_Turno Noche`

  const db = fakeShiftsDb({
    [actualId]: { shiftId: 'Turno Dia',   scheduledStart: hoy(Math.max(0, hora - 1)), scheduledEnd: new Date(w.getTime() + 30 * 60_000), machines: [{ totalCycles: 400 }] },
    [futuroId]: { shiftId: 'Turno Noche', scheduledStart: new Date(w.getTime() + 3 * 3600_000), scheduledEnd: new Date(w.getTime() + 11 * 3600_000), machines: [] },
  })

  assert.equal(await resolveCurrentShiftDocId(db, 'filete', w), actualId)
})

test('modo línea: Unscheduled con ruido no se disfraza de turno', async () => {
  const w = nowWall()
  const hora = w.getUTCHours()
  const realId = `${dk(w)}_Turno Dia`
  const ruidoId = `${dk(w)}_Unscheduled`

  const db = fakeShiftsDb({
    [realId]:  { shiftId: 'Turno Dia',   scheduledStart: hoy(Math.max(0, hora - 2)), scheduledEnd: new Date(w.getTime() + 60 * 60_000), machines: [{ totalCycles: 3000 }] },
    // Arranca DESPUÉS que el real: sin el filtro de ruido ganaría por ser el más reciente.
    [ruidoId]: { shiftId: 'Unscheduled', scheduledStart: hoy(Math.max(0, hora - 1)), scheduledEnd: new Date(w.getTime() + 60 * 60_000), machines: [{ totalCycles: 12 }] },
  })

  assert.equal(await resolveCurrentShiftDocId(db, 'filete', w), realId)
})

test('modo línea: sin turnos de hoy ni de ayer devuelve null (no inventa uno viejo)', async () => {
  const db = fakeShiftsDb({
    '2026-01-05_Turno Dia': { shiftId: 'Turno Dia', scheduledStart: iso(Date.UTC(2026, 0, 5, 9)), scheduledEnd: iso(Date.UTC(2026, 0, 5, 17)), machines: [{ totalCycles: 3000 }] },
  })
  assert.equal(await resolveCurrentShiftDocId(db, 'filete', nowWall()), null)
})

test('el patch de un monitor de línea reapunta el turno; el de un turno fijo no se mueve', async () => {
  const w = nowWall()
  const hora = w.getUTCHours()
  const vigenteId = `${dk(w)}_Turno Dia`
  const viejoId = '2026-01-05_Turno Dia'

  const maquina = (cycles) => ({
    machineid: 'b200', machineName: 'Linea 1', machineType: 'baader_200',
    totalCycles: cycles, shiftRuntime: 0.8,
    shiftRuntimeBreakdown: { uptimeSec: 3600, downtimeSec: 600, breakSec: 0 },
    intervals: intervals(hoy(Math.max(0, hora - 1)).getTime(), 6, 50),
    states: [],
  })

  const db = fakeShiftsDb(
    {
      [vigenteId]: { shiftId: 'Turno Dia', scheduledStart: hoy(Math.max(0, hora - 1)), scheduledEnd: new Date(w.getTime() + 3600_000), machines: [{ totalCycles: 300 }] },
      [viejoId]:   { shiftId: 'Turno Dia', scheduledStart: iso(Date.UTC(2026, 0, 5, 9)), scheduledEnd: iso(Date.UTC(2026, 0, 5, 17)), machines: [{ totalCycles: 3000 }] },
    },
    { [vigenteId]: [maquina(300)], [viejoId]: [maquina(3000)] },
  )

  // El monitor de línea guardaba el turno de enero: debe saltar al vigente.
  const linea = await buildMonitorPatch(db, { mode: 'line', plantSlug: 'filete', shiftDocId: viejoId })
  assert.equal(linea.shiftDocId, vigenteId)
  assert.equal(linea.dateKey, dk(w))
  assert.equal(linea.shiftId, 'Turno Dia')
  assert.equal(linea.live.totalPieces, 300)

  // El de turno fijo se queda donde está, aunque haya uno vigente.
  const fijo = await buildMonitorPatch(db, { mode: 'shift', plantSlug: 'filete', shiftDocId: viejoId })
  assert.equal(fijo.shiftDocId, undefined, 'un link de turno fijo no debe reapuntar')
  assert.equal(fijo.live.totalPieces, 3000)
})

// ─────────────────────────────────────────────────────────────────────────────
// `ensureLineMonitor`: el link que se manda por Telegram al arrancar el turno.
//
// La invariante que importa es que el TOKEN NO CAMBIE: el mensaje de Telegram
// de ayer y el QR impreso tienen que seguir abriendo la misma pantalla. Un
// "creo uno nuevo cada arranque" pasaría todos los tests de contenido y aun así
// rompería lo único que hace útil al link.
// ─────────────────────────────────────────────────────────────────────────────

const { ensureLineMonitor } = require('../publicMonitor')

/** db falso con la colección de monitores en memoria + los turnos del stub. */
function fakeMonitorsDb(monitors, shiftsDb = null) {
  const store = { ...monitors }
  return {
    collection: (name) => {
      if (name === 'publicShiftMonitors') {
        return {
          where: () => ({
            get: async () => ({
              docs: Object.entries(store).map(([id, data]) => ({
                id,
                data: () => data,
                ref: { set: async (patch) => { store[id] = { ...store[id], ...patch } } },
              })),
            }),
          }),
          doc: (id) => ({ set: async (d) => { store[id] = d } }),
        }
      }
      return shiftsDb ? shiftsDb.collection(name) : { listDocuments: async () => [] }
    },
    doc: (path) => (shiftsDb ? shiftsDb.doc(path) : { get: async () => ({ exists: false }) }),
    getAll: async (...refs) => (shiftsDb ? shiftsDb.getAll(...refs) : []),
    _store: store,
  }
}

const enDias = (n) => new Date(Date.now() + n * 86_400_000).toISOString()

test('ensureLineMonitor reusa el token vigente en vez de crear otro', async () => {
  const vence = enDias(20)
  const db = fakeMonitorsDb({
    'tok-viejo': { scope: 'line|filete', expiresAt: vence },
  })

  const res = await ensureLineMonitor(db, 'filete', { ttlDays: 30 })

  assert.equal(res.token, 'tok-viejo', 'el QR impreso tiene que seguir sirviendo')
  assert.equal(res.created, false)
  assert.equal(Object.keys(db._store).length, 1, 'no debe aparecer un token nuevo')
  assert.equal(db._store['tok-viejo'].expiresAt, vence, 'con vigencia de sobra no se reescribe')
})

test('ensureLineMonitor renueva la vigencia cuando queda poca, sin cambiar el token', async () => {
  const db = fakeMonitorsDb({
    'tok-porvencer': { scope: 'line|filete', expiresAt: enDias(2) },
  })

  const res = await ensureLineMonitor(db, 'filete', { ttlDays: 30 })

  assert.equal(res.token, 'tok-porvencer')
  assert.ok(db._store['tok-porvencer'].expiresAt > enDias(25), 'debió extenderse a ~30 días')
})

test('ensureLineMonitor ignora los vencidos y crea uno nuevo', async () => {
  const w = nowWall()
  const vigenteId = `${dk(w)}_Turno Dia`
  const shifts = fakeShiftsDb(
    { [vigenteId]: { shiftId: 'Turno Dia', scheduledStart: hoy(Math.max(0, w.getUTCHours() - 1)), scheduledEnd: new Date(w.getTime() + 3600_000), machines: [{ totalCycles: 10 }] } },
    { [vigenteId]: [{
      machineid: 'b200', machineName: 'Linea 1', machineType: 'baader_200',
      totalCycles: 10, shiftRuntime: 1,
      shiftRuntimeBreakdown: { uptimeSec: 600, downtimeSec: 0, breakSec: 0 },
      intervals: intervals(hoy(Math.max(0, w.getUTCHours() - 1)).getTime(), 2, 5),
      states: [],
    }] },
  )
  const db = fakeMonitorsDb({ 'tok-vencido': { scope: 'line|filete', expiresAt: enDias(-1) } }, shifts)

  const res = await ensureLineMonitor(db, 'filete', { ttlDays: 30, meta: { areaLabel: 'Filete' } })

  assert.equal(res.created, true)
  assert.notEqual(res.token, 'tok-vencido')
  const nuevo = db._store[res.token]
  assert.equal(nuevo.mode, 'line')
  assert.equal(nuevo.scope, 'line|filete')
  assert.equal(nuevo.shiftDocId, vigenteId, 'nace apuntando al turno vigente')
  assert.equal(nuevo.live.totalPieces, 10)
})

test('ensureLineMonitor se queda con el que vence más tarde si hay varios', async () => {
  const db = fakeMonitorsDb({
    'tok-a': { scope: 'line|filete', expiresAt: enDias(3) },
    'tok-b': { scope: 'line|filete', expiresAt: enDias(25) },
  })
  const res = await ensureLineMonitor(db, 'filete', { ttlDays: 30 })
  assert.equal(res.token, 'tok-b')
})

test('el brief de inicio lleva el link solo cuando hay uno', () => {
  const brief = require('../shoplogix/turnoBrief')
  const url = 'https://x/monitor/abc'

  const con = brief.componerBriefInicioTurno({ plantLabel: 'Filete', shiftId: 'Turno Dia', officialSchedule: null, currentJob: null, officialTargets: null, monitorUrl: url })
  assert.ok(con.includes(url))
  assert.ok(/sin login/i.test(con), 'hay que decir que el link es compartible')

  const sin = brief.componerBriefInicioTurno({ plantLabel: 'Filete', shiftId: 'Turno Dia', officialSchedule: null, currentJob: null, officialTargets: null })
  assert.ok(!sin.includes('monitor'), 'sin link no debe quedar una línea colgando')
  assert.ok(!/\n\n$/.test(sin), 'ni una línea en blanco al final')
})
