/**
 * Privacidad de las perillas en el monitor público: el payload publica solo `cpm` y
 * `desde`. Quién anotó (`por`) se queda en graderModuleConfigs y lo lee el editor de
 * admin directo de ahí.
 *
 * Correr con `node --test` (mismo runner que los demás tests de functions).
 */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { normPerilla, leerPerillas } = require('../publicMonitor')

const DESDE = '2026-11-04T01:20:00.000Z'

test('normPerilla no publica quién anotó', () => {
  assert.deepEqual(normPerilla({ cpm: 17, desde: DESDE, por: 'Orel C.' }), { cpm: 17, desde: DESDE })
})

test('normPerilla descarta lo que no es usable: cpm no positivo o desde sin fecha', () => {
  assert.equal(normPerilla({ cpm: 0, desde: DESDE, por: 'x' }), null)
  assert.equal(normPerilla({ cpm: 17, desde: 'no es fecha', por: 'x' }), null)
  assert.equal(normPerilla(null), null)
})

test('leerPerillas: ni la vigente ni el historial llevan el nombre de quien anotó', () => {
  const data = {
    monitorPerillas: { ev1: { cpm: 17, desde: DESDE, por: 'Orel C.' } },
    monitorPerillasHistorial: [
      { machineId: 'ev1', cpm: 16, desde: '2026-11-03T12:00:00.000Z', por: 'Otro admin' },
      { machineId: 'ev1', cpm: 17, desde: DESDE, por: 'Orel C.' },
    ],
  }
  const perillas = leerPerillas(data)
  assert.deepEqual(perillas, {
    actual: { ev1: { cpm: 17, desde: DESDE } },
    historial: [
      { cpm: 16, desde: '2026-11-03T12:00:00.000Z', machineId: 'ev1' },
      { cpm: 17, desde: DESDE, machineId: 'ev1' },
    ],
  })
  assert.equal(JSON.stringify(perillas).includes('Orel'), false)
  assert.equal(JSON.stringify(perillas).includes('Otro admin'), false)
})

test('leerPerillas sin anotaciones devuelve null', () => {
  assert.equal(leerPerillas({}), null)
})
