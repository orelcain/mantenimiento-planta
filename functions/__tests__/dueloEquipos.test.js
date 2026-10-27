/**
 * Duelo de equipos (27-10-2026): lo que el backend publica para comparar un turno
 * con el del otro horario — `rivalCurve` (curva del último turno cerrado del otro
 * nombre) y `shiftStats[].duelo` (arranque, última hora, micro y llenado por puesto).
 *
 * Los turnos se pasan ya armados por `history` y el índice por parámetro, así que
 * no hace falta una base de datos de mentira.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { buildRivalCurve, resumenDuelo } = require('../publicMonitor')

/** Ahora en wall-clock de planta (mismo truco que publicMonitor.test.js). */
function nowWall() {
  const now = new Date()
  const offsetH = -Number(
    now.toLocaleString('en-US', { timeZone: 'America/Santiago', timeZoneName: 'shortOffset' })
      .split('GMT')[1],
  )
  return new Date(now.getTime() - offsetH * 3600 * 1000)
}
const dk = (d) => d.toISOString().slice(0, 10)
const hace = (dias) => dk(new Date(nowWall().getTime() - dias * 86_400_000))
const iso = (dia, h, m = 0) => new Date(Date.UTC(Number(dia.slice(0, 4)), Number(dia.slice(5, 7)) - 1, Number(dia.slice(8, 10)), h, m)).toISOString()

/** Serie de 5 min desde `h0`: `pz` piezas por tramo durante `n` tramos. */
const serie = (dia, h0, n, pz, antesVacios = 0) => {
  const out = []
  for (let i = 0; i < antesVacios; i++) out.push({ t: iso(dia, h0, i * 5), pieces: 0 })
  for (let i = 0; i < n; i++) out.push({ t: iso(dia, h0, (antesVacios + i) * 5), pieces: pz })
  return out
}

const turno = (id, dia, h0, series, total) => ({
  shiftDocId: id,
  dateKey: dia,
  shiftId: id.slice(11),
  live: {
    totalPieces: total,
    scheduledStart: iso(dia, h0),
    series: series,
    timeBreakdown: { tbv: 3, producingMin: 400, windowMin: 480 },
  },
})

test('rivalCurve: el último turno cerrado del OTRO nombre, desde su arranque productivo', async () => {
  const ayer = hace(1)
  const actual = `${dk(nowWall())}_Turno Dia`
  const noche = `${ayer}_Turno Noche`
  const dia = `${ayer}_Turno Dia`
  const history = [
    // 10 tramos vacíos y luego 40 con 60 pz: la curva debe partir del primer tramo con piezas.
    turno(noche, ayer, 21, serie(ayer, 21, 40, 60, 10), 2400),
    turno(dia, ayer, 7, serie(ayer, 7, 40, 80), 3200),
  ]
  const index = { entries: [actual, noche, dia].map((id) => ({ id })) }
  const r = await buildRivalCurve(null, 'eviscerado', actual, 'Turno Dia', null, history, index, new Set())
  assert.equal(r.shiftDocId, noche, 'el día no es rival de un turno de día')
  assert.equal(r.h0, '21:00')
  assert.equal(r.total, 2400)
  assert.deepEqual(r.curve[0], { m: 5, p: 60 }, 'el eje parte del primer tramo con piezas')
  assert.equal(r.curve[r.curve.length - 1].p, 2400)
  // Submuestreada a 5 min, sin la cola vacía y con objetos {m, p} (Firestore rechaza arrays anidados).
  assert.ok(r.curve.every((p, i) => i === 0 || p.m - r.curve[i - 1].m >= 5))
  assert.ok(r.curve.every((p) => !Array.isArray(p)))
})

test('rivalCurve: sin rival presentable devuelve null (y no inventa uno)', async () => {
  const hoyId = `${dk(nowWall())}_Turno Dia`
  const ayer = hace(1)
  const mismoNombre = `${ayer}_Turno Dia`
  const history = [turno(mismoNombre, ayer, 7, serie(ayer, 7, 40, 80), 3200)]
  const index = { entries: [hoyId, mismoNombre].map((id) => ({ id })) }
  assert.equal(await buildRivalCurve(null, 'eviscerado', hoyId, 'Turno Dia', null, history, index, new Set()), null)
  // Un turno de prueba (menos de 500 piezas) tampoco es rival.
  const noche = `${ayer}_Turno Noche`
  const chico = [turno(noche, ayer, 21, serie(ayer, 21, 10, 10), 100)]
  const idx2 = { entries: [hoyId, noche].map((id) => ({ id })) }
  assert.equal(await buildRivalCurve(null, 'eviscerado', hoyId, 'Turno Dia', null, chico, idx2, new Set()), null)
})

test('rivalCurve: un rival ya publicado y que no es el turno anterior se reusa sin releer', async () => {
  const hoyId = `${dk(nowWall())}_Turno Dia`
  const antes = hace(2)
  const ayer = hace(1)
  const viejo = `${antes}_Turno Noche`
  const reciente = `${ayer}_Turno Dia`
  const prev = { shiftDocId: viejo, dateKey: antes, shiftId: 'Turno Noche', curve: [{ m: 5, p: 1 }, { m: 10, p: 2 }, { m: 15, p: 3 }], total: 999 }
  const index = { entries: [hoyId, viejo, reciente].map((id) => ({ id })) }
  const r = await buildRivalCurve(null, 'eviscerado', hoyId, 'Turno Dia', prev, [], index, new Set())
  assert.equal(r, prev)
})

test('resumenDuelo: arranque, última hora, micro detención y llenado por puesto', () => {
  const dia = hace(1)
  const live = {
    scheduledStart: iso(dia, 7),
    plannedEnd: iso(dia, 15),
    // Primer tramo con piezas a las 07:20; 12 tramos de 100 pz hasta las 08:20 y 12 más en la última hora.
    series: [
      ...serie(dia, 7, 4, 0),
      ...Array.from({ length: 12 }, (_, i) => ({ t: iso(dia, 7, 20 + i * 5), pieces: 100 })),
      ...Array.from({ length: 12 }, (_, i) => ({ t: iso(dia, 14, i * 5), pieces: 50 })),
    ],
    mantencion: { porMaquina: [{ microMin: 4.5 }, { microMin: 3 }] },
    machines: [
      { name: 'Ev 1', pieces: 3600, targetCpm: 19, uptimeSec: 3600 * 4 },
      { name: 'Ev 2', pieces: 100, targetCpm: 0, uptimeSec: 100 },
    ],
  }
  const d = resumenDuelo(live)
  assert.equal(d.h0, '07:00')
  assert.equal(d.ini, 20)
  assert.equal(d.uh, 600)
  assert.equal(d.mic, 7.5)
  assert.deepEqual(d.alim[0], { n: 'Ev 1', f: 79 }) // 3600 / (19 × 240) = 78,9 %
  assert.deepEqual(d.alim[1], { n: 'Ev 2' }, 'sin esperado no hay llenado: la clave no existe')
})

test('resumenDuelo: un turno sin datos no produce undefined ni null (Firestore)', () => {
  const d = resumenDuelo({ series: [], machines: [] })
  const sinVacios = (v, ruta) => {
    assert.notEqual(v, undefined, `vacío en ${ruta}`)
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) sinVacios(x, `${ruta}.${k}`)
  }
  sinVacios(d, 'duelo')
})

test('eventosDelDuelo: paradas de 5 min o más, unidas entre máquinas por causa y ubicadas desde el inicio planificado', () => {
  const { eventosDelDuelo } = require('../publicMonitor')
  const ini = Date.parse('2026-11-02T07:00:00.000Z')
  const l = {
    stopReasons: ['COLACION', 'FALTA MMPP', 'KNURO'],
    stopEvents: [
      { r: 0, f: '2026-11-02T10:00:00.000Z', s: 1800, m: 0 },
      { r: 0, f: '2026-11-02T10:00:00.000Z', s: 1800, m: 1 }, // misma colación en otra máquina: una sola marca
      { r: 1, f: '2026-11-02T08:00:00.000Z', s: 240, m: 0 },
      { r: 1, f: '2026-11-02T08:02:00.000Z', s: 240, m: 1 }, // se solapan: 6 min en total
      { r: 2, f: '2026-11-02T09:00:00.000Z', s: 120, m: 0 }, // 2 min: no llega
    ],
  }
  assert.deepEqual(eventosDelDuelo(l, ini), [
    { n: 'FALTA MMPP', o: 60, d: 6 },
    { n: 'COLACION', o: 180, d: 30, p: 1 },
  ])
  assert.deepEqual(eventosDelDuelo(l, NaN), [], 'sin inicio planificado no se ubica nada')
  assert.deepEqual(eventosDelDuelo({}, ini), [], 'siempre un arreglo: es lo que invalida el caché viejo')
})

test('resumenDuelo: trae `ev` (siempre un arreglo) y ningún valor undefined o null', () => {
  const d = resumenDuelo({
    scheduledStart: '2026-11-02T07:00:00.000Z', series: [], machines: [],
    stopReasons: ['KNURO'], stopEvents: [{ r: 0, f: '2026-11-02T09:00:00.000Z', s: 600, m: 0 }],
  })
  assert.deepEqual(d.ev, [{ n: 'KNURO', o: 120, d: 10 }])
  assert.ok(Array.isArray(resumenDuelo({ series: [], machines: [] }).ev))
})
