/**
 * Tests de guardiaTurnos (node:test nativo — correr con `node --test`).
 *
 * Los casos son los dos que vio Orel el 28-09-2026 en Chonchi, más los que NO
 * tienen que avisar: un aviso falso gasta la credibilidad del verdadero.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { revisarTurnosDelSync, revisarMonitor, avisarHallazgos } = require('../guardiaTurnos')

// wall-clock-as-UTC
const S = (h, m = 0, dia = 28) => new Date(Date.UTC(2026, 8, dia, h, m))

const lunes = (over = {}) => ({
  docId: '2026-09-28_Turno 1 Lunes', shiftId: 'Turno 1 Lunes',
  scheduledStart: S(0), scheduledEnd: S(7, 15), effectiveEnd: S(4, 30),
  officialSchedule: { start: S(0), end: S(7, 15) },
  ...over,
})

test('regla 1: turno en curso con el cierre del último interval → avisa (caso 28-09 04:31)', () => {
  const r = revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [lunes({ scheduledEnd: S(4, 31) })], rollup: { shiftLabel: 'Turno 1 Lunes' }, nowWall: S(4, 34) })
  assert.equal(r.length, 1)
  assert.equal(r[0].regla, 'cierre-en-curso')
  assert.match(r[0].texto, /00:00→07:15/)
  assert.match(r[0].texto, /04:31/)
})

test('regla 1: con el cierre oficial guardado, no avisa', () => {
  const r = revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [lunes()], rollup: { shiftLabel: 'Turno 1 Lunes' }, nowWall: S(4, 34) })
  assert.deepEqual(r, [])
})

test('regla 1: pasado el cierre oficial no opina (la hora extra es legítima)', () => {
  const r = revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [lunes({ scheduledEnd: S(7, 40), effectiveEnd: S(7, 40) })], rollup: null, nowWall: S(7, 45) })
  assert.deepEqual(r, [])
})

test('regla 3: el turno que produce no tiene horario oficial y Shoplogix describe otro → avisa', () => {
  const t2 = { docId: '2026-09-28_Turno 2', shiftId: 'Turno 2', scheduledStart: S(9, 15), scheduledEnd: S(11, 0), effectiveEnd: S(11, 0), officialSchedule: null }
  const r = revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [t2], rollup: { shiftLabel: 'Turno Extra' }, nowWall: S(11, 5) })
  assert.equal(r.length, 1)
  assert.equal(r[0].regla, 'sin-horario')
  assert.match(r[0].texto, /Turno Extra/)
})

test('regla 3: no avisa en los primeros minutos del turno (el rollup tarda en cambiar)', () => {
  const t2 = { docId: 'x', shiftId: 'Turno 2', scheduledStart: S(9, 15), scheduledEnd: S(9, 30), effectiveEnd: S(9, 30), officialSchedule: null }
  assert.deepEqual(revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [t2], rollup: { shiftLabel: 'Turno 1' }, nowWall: S(9, 35) }), [])
})

test('regla 3: el turno anterior en el cambio de turno NO avisa; solo el más reciente cuenta', () => {
  const noche = { docId: 'n', shiftId: 'Turno 1', scheduledStart: S(21, 15, 27), scheduledEnd: S(7, 10), effectiveEnd: S(7, 10), officialSchedule: null }
  // Con el sync corregido, el turno en curso ya trae el cierre oficial (15:00).
  const dia = { docId: 'd', shiftId: 'Turno 2', scheduledStart: S(7, 15), scheduledEnd: S(15, 0), effectiveEnd: S(8, 0), officialSchedule: { start: S(7, 15), end: S(15, 0) } }
  assert.deepEqual(revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [noche, dia], rollup: { shiftLabel: 'Turno 2' }, nowWall: S(8, 2) }), [])
})

test('regla 3: sin rollup (no se pudo leer) no opina', () => {
  const t2 = { docId: 'x', shiftId: 'Turno 2', scheduledStart: S(9, 15), scheduledEnd: S(11, 0), effectiveEnd: S(11, 0), officialSchedule: null }
  assert.deepEqual(revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [t2], rollup: null, nowWall: S(11, 5) }), [])
})

test('Unscheduled nunca avisa: no tiene horario por definición', () => {
  const u = { docId: 'u', shiftId: 'Unscheduled', scheduledStart: S(16, 15), scheduledEnd: S(20, 0), effectiveEnd: S(20, 0), officialSchedule: null }
  assert.deepEqual(revisarTurnosDelSync({ plantSlug: 'chonchi', turnos: [u], rollup: { shiftLabel: 'Turno 2' }, nowWall: S(20, 5) }), [])
})

test('regla 2: el monitor estima 14:44 con Shoplogix diciendo 17:00 → avisa (caso 28-09)', () => {
  const r = revisarMonitor({
    plantSlug: 'chonchi', shiftDocId: '2026-09-28_Turno 2',
    live: { shiftClosed: false, plannedEnd: S(14, 44).toISOString(), plannedEndSource: 'historial' },
    parent: { scheduledStart: S(9, 15), officialSchedule: { start: S(9, 15), end: S(17, 0) } },
  })
  assert.equal(r.length, 1)
  assert.match(r[0].texto, /14:44/)
  assert.match(r[0].texto, /17:00/)
})

test('regla 2: con el cierre de Shoplogix, turno cerrado o sin horario oficial, no avisa', () => {
  const parent = { scheduledStart: S(9, 15), officialSchedule: { start: S(9, 15), end: S(17, 0) } }
  assert.deepEqual(revisarMonitor({ plantSlug: 'c', shiftDocId: 'x_T', live: { shiftClosed: false, plannedEndSource: 'shoplogix' }, parent }), [])
  assert.deepEqual(revisarMonitor({ plantSlug: 'c', shiftDocId: 'x_T', live: { shiftClosed: true, plannedEndSource: 'historial' }, parent }), [])
  assert.deepEqual(revisarMonitor({ plantSlug: 'c', shiftDocId: 'x_T', live: { shiftClosed: false, plannedEndSource: 'duracion' }, parent: {} }), [])
})

test('avisarHallazgos: avisa una vez, no repite dentro de 6 h, y sin hallazgos no toca Firestore', async () => {
  let guardado = null
  let lecturas = 0
  const db = {
    doc: () => ({
      get: async () => { lecturas++; return { exists: !!guardado, data: () => guardado } },
      set: async (v) => { guardado = v },
    }),
  }
  const enviados = []
  const enviar = async (t) => enviados.push(t)
  const h = [{ clave: 'chonchi|x|monitor', texto: 'algo' }]
  const t0 = Date.UTC(2026, 8, 28, 20, 0)

  assert.equal(await avisarHallazgos({ db, enviar, hallazgos: [], ahoraMs: t0 }), 0)
  assert.equal(lecturas, 0, 'sin hallazgos, cero lecturas')

  assert.equal(await avisarHallazgos({ db, enviar, hallazgos: h, ahoraMs: t0 }), 1)
  assert.equal(await avisarHallazgos({ db, enviar, hallazgos: h, ahoraMs: t0 + 3600_000 }), 0, 'no repite a la hora')
  assert.equal(await avisarHallazgos({ db, enviar, hallazgos: h, ahoraMs: t0 + 7 * 3600_000 }), 1, 'pasadas 6 h vuelve a avisar')
  assert.equal(enviados.length, 2)
})
