/**
 * Tests de jackKnife (node:test nativo — correr con `node --test`).
 *
 * Cubre: unión entre máquinas, hueco de 60 s, sin imputar por máquina y por
 * línea, comentarios filtrados / deduplicados / recortados, y causas que no son
 * de Mantención fuera de los eventos.
 */

const test = require('node:test')
const assert = require('node:assert')
const { resumenJackKnifeTurno, unirTramos, MAX_COMENTARIOS, MAX_TEXTO } = require('../jackKnife')

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0)
const min = (n) => T0 + n * 60_000
const seg = (n) => T0 + n * 1000
const d = (ms) => new Date(ms)

/** Un state de downtime con causa (o sin ella). */
const parada = (desde, hasta, reason = '', name = 'DETENCION') => ({
  startAt: d(desde), endAt: d(hasta), type: 'downtime', name, reason,
})
const produccion = (desde, hasta) => ({
  startAt: d(desde), endAt: d(hasta), type: 'uptime', name: 'Running', reason: '',
})

test('unión entre máquinas: la misma causa a la vez en dos máquinas es un solo evento', () => {
  const r = resumenJackKnifeTurno([
    { machineName: 'YAL Evisceradora 1', states: [parada(min(0), min(10), 'KNURO')], comments: [] },
    { machineName: 'YAL Evisceradora 2', states: [parada(min(2), min(12), 'KNURO')], comments: [] },
  ])
  assert.strictEqual(r.eventos.length, 1)
  assert.strictEqual(r.eventos[0][0], 'Knuro')
  assert.strictEqual(r.eventos[0][1], min(0))
  assert.strictEqual(r.eventos[0][2], 12)
})

test('hueco de 60 s une el evento; 61 s lo parte en dos', () => {
  const unidos = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [parada(min(0), min(10), 'KNURO'), parada(min(11), min(15), 'KNURO')], comments: [] },
  ])
  assert.strictEqual(unidos.eventos.length, 1)
  assert.strictEqual(unidos.eventos[0][2], 15)

  const separados = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [parada(min(0), min(10), 'KNURO'), parada(min(10) + 61_000, min(15), 'KNURO')], comments: [] },
  ])
  assert.strictEqual(separados.eventos.length, 2)
})

test('unirTramos aplica el hueco de 60 s', () => {
  // 0–1000, 3000–4000 (hueco 2 s) y 61000–62000 (hueco 57 s): todo es un evento.
  const ev = unirTramos([{ s: 0, e: 1000 }, { s: 61_000, e: 62_000 }, { s: 3000, e: 4000 }])
  assert.deepStrictEqual(ev, [{ s: 0, e: 62_000 }])
})

test('sin imputar por máquina: quita el prefijo YAL y no mezcla máquinas', () => {
  const r = resumenJackKnifeTurno([
    { machineName: 'YAL Evisceradora 1', states: [parada(min(0), min(5))], comments: [] },
    { machineName: 'YAL Evisceradora 2', states: [parada(min(20), min(23))], comments: [] },
  ])
  assert.deepStrictEqual(r.sinImputar, [
    ['Evisceradora 1', min(0), 5],
    ['Evisceradora 2', min(20), 3],
  ])
})

test('sin imputar por línea: une los tramos de las tres máquinas', () => {
  const r = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [parada(min(0), min(5))], comments: [] },
    { machineName: 'Evisceradora 2', states: [parada(min(4), min(8))], comments: [] },
    { machineName: 'Evisceradora 3', states: [parada(min(30), min(32))], comments: [] },
  ])
  assert.deepStrictEqual(r.sinImputarLinea, [[min(0), 8], [min(30), 2]])
})

test('micro y excedido no entran a sin imputar; micro cuenta en sinCausaMin', () => {
  const r = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [
      parada(min(0), min(2), '', 'MICRO PARO'),
      parada(min(10), min(14), '', 'DETENCION EXCEDIDO'),
    ], comments: [] },
  ])
  assert.strictEqual(r.sinImputar.length, 0)
  assert.strictEqual(r.sinCausaMin, 2)
})

test('comentarios: descarta vacíos y solo números, deduplica entre máquinas y recorta', () => {
  const largo = 'x'.repeat(200)
  const r = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [], comments: [
      { text: '825', startAt: d(min(1)), reasonValue: 'KNURO' },
      { text: '   ', startAt: d(min(2)), reasonValue: 'KNURO' },
      { text: ' 12 ', startAt: d(min(3)), reasonValue: 'KNURO' },
      { text: 'Cambié el resorte', startAt: d(min(5)), reasonValue: 'KNURO' },
      { text: largo, startAt: d(min(9)), reasonValue: 'KNURO' },
    ] },
    { machineName: 'Evisceradora 2', states: [], comments: [
      { text: 'Cambié el resorte', startAt: d(min(6)), reasonValue: 'KNURO' },
    ] },
  ])
  const textos = r.comentarios.map((c) => c[2])
  assert.deepStrictEqual(textos, ['Cambié el resorte', 'x'.repeat(MAX_TEXTO)])
  assert.strictEqual(r.comentarios[0][0], 'Knuro')
  assert.strictEqual(r.comentarios[0][1], min(5))
})

test('comentarios: máximo 40 por turno', () => {
  const comments = Array.from({ length: 45 }, (_, i) => ({
    text: `Comentario ${i}`, startAt: d(min(i * 10)), reasonValue: 'KNURO',
  }))
  const r = resumenJackKnifeTurno([{ machineName: 'Evisceradora 1', states: [], comments }])
  assert.strictEqual(r.comentarios.length, MAX_COMENTARIOS)
})

test('causas que no son de Mantención quedan fuera de eventos, pero cuentan en cobertura', () => {
  const r = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [parada(min(0), min(30), 'AGUA')], comments: [
      { text: 'Falta agua en la línea', startAt: d(min(1)), reasonValue: 'AGUA' },
    ] },
  ])
  assert.strictEqual(r.eventos.length, 0)
  assert.strictEqual(r.comentarios.length, 0)
  assert.strictEqual(r.sinImputar.length, 0)
  assert.strictEqual(r.conCausaMin, 30)
})

test('Planta de Riles entra como causa de Mantención', () => {
  const r = resumenJackKnifeTurno([
    { machineName: 'Evisceradora 1', states: [parada(min(0), min(4), 'PLANTA DE RILES')], comments: [] },
  ])
  assert.strictEqual(r.eventos[0][0], 'Planta de Riles')
  assert.strictEqual(r.eventos[0][2], 4)
})

test('deduplica states repetidos (el bucket Unscheduled los repite)', () => {
  const s = parada(min(0), min(10), 'KNURO')
  const r = resumenJackKnifeTurno([{ machineName: 'Evisceradora 1', states: [s, { ...s }], comments: [] }])
  assert.strictEqual(r.eventos.length, 1)
  assert.strictEqual(r.eventos[0][2], 10)
})

test('uptime se suma aparte; un turno sin datos devuelve ceros', () => {
  const r = resumenJackKnifeTurno([{ machineName: 'Evisceradora 1', states: [produccion(min(0), min(60))], comments: [] }])
  assert.strictEqual(r.uptimeMin, 60)
  assert.strictEqual(r.v, 1)

  const vacio = resumenJackKnifeTurno([])
  assert.deepStrictEqual(vacio.eventos, [])
  assert.strictEqual(vacio.conCausaMin, 0)
  assert.strictEqual(vacio.sinCausaMin, 0)
})

test('acepta timestamps tipo Firestore (toMillis)', () => {
  const ts = (ms) => ({ toMillis: () => ms })
  const r = resumenJackKnifeTurno([{ machineName: 'Evisceradora 1', states: [
    { startAt: ts(min(0)), endAt: ts(min(7)), type: 'downtime', name: 'X', reason: 'KNURO' },
  ], comments: [] }])
  assert.strictEqual(r.eventos[0][2], 7)
})

test('debeResumirse excluye Unscheduled (repite states de los turnos regulares)', () => {
  const { debeResumirse } = require('../jackKnife')
  assert.strictEqual(debeResumirse('Unscheduled'), false)
  assert.strictEqual(debeResumirse('Turno 1'), true)
  assert.strictEqual(debeResumirse('Turno 2'), true)
})
