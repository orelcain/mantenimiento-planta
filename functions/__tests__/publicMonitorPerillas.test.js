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

test('leerPerillas publica el modo del umbral que anotó el admin, sin quién lo anotó', () => {
  const perillas = leerPerillas({
    monitorPerillas: { ev1: { cpm: 17, desde: DESDE, por: 'Orel C.' } },
    monitorUmbralARitmo: { modo: 'optimo', desde: DESDE, por: 'Orel C.' },
  })
  assert.equal(perillas.modo, 'optimo')
  assert.deepEqual(perillas.actual, { ev1: { cpm: 17, desde: DESDE } })
  assert.equal(JSON.stringify(perillas).includes('Orel'), false)
})

test('leerPerillas: calibrado también se publica como modo', () => {
  const perillas = leerPerillas({
    monitorPerillas: { ev1: { cpm: 17, desde: DESDE, por: 'x' } },
    monitorUmbralARitmo: { modo: 'calibrado', desde: DESDE, por: 'x' },
  })
  assert.equal(perillas.modo, 'calibrado')
})

test('leerPerillas: un modo desconocido se ignora y la respuesta va sin la clave modo', () => {
  const perillas = leerPerillas({
    monitorPerillas: { ev1: { cpm: 17, desde: DESDE, por: 'x' } },
    monitorUmbralARitmo: { modo: 'otro', desde: DESDE, por: 'x' },
  })
  assert.deepEqual(perillas, { actual: { ev1: { cpm: 17, desde: DESDE } }, historial: [] })
  assert.equal('modo' in perillas, false)
})

test('leerPerillas: sin perillas, el modo solo basta para publicar la respuesta', () => {
  assert.deepEqual(
    leerPerillas({ monitorUmbralARitmo: { modo: 'calibrado', desde: DESDE, por: 'x' } }),
    { actual: {}, historial: [], modo: 'calibrado' },
  )
})

test('leerPerillas sin perillas ni modo válido devuelve null, aunque monitorUmbralARitmo exista', () => {
  assert.equal(leerPerillas({ monitorUmbralARitmo: null }), null)
  assert.equal(leerPerillas({ monitorUmbralARitmo: { modo: 'otro' } }), null)
})
