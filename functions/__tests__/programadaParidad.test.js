/**
 * Paridad de la detención programada, lado servidor (`node --test`).
 *
 * `esParoPlanificado` (aquí) y `esProgramada` (PWA, `cascadaPerilla.ts`) son
 * la misma regla en dos runtimes. Las dos leen `lib/causasProgramadas.json` y
 * las dos corren la tabla `fixtures/causasProgramadas.casos.json`
 * (la PWA en `programadaParidad.test.ts`). Si una se separa, su prueba falla.
 * Pasó el 04-11: la cascada no reconocía «EJERCICIO  COMPENSATORIO» con dos
 * espacios y daba 56 min programados contra 64 del «Tiempo del turno».
 */

const { test } = require('node:test')
const assert = require('node:assert')

const { esParoPlanificado, CAUSAS_PLANIFICADAS } = require('../publicMonitor')
const LISTA = require('../lib/causasProgramadas.json')
const CASOS = require('./fixtures/causasProgramadas.casos.json')

test('la lista de causas es el JSON compartido con la PWA, no una copia (aunque sea idéntica)', () => {
  assert.strictEqual(CAUSAS_PLANIFICADAS, LISTA)
  assert.ok(LISTA.length > 0)
  // Normalizada: sin tildes, en minúsculas y con un solo espacio entre palabras.
  for (const c of LISTA) assert.strictEqual(c, c.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim())
})

test('la tabla trae el caso de los dos espacios y casos de los dos lados', () => {
  assert.ok(CASOS.some((c) => c.razon === 'EJERCICIO  COMPENSATORIO' && c.programada))
  assert.ok(CASOS.some((c) => c.programada) && CASOS.some((c) => !c.programada))
})

for (const c of CASOS) {
  test(`${JSON.stringify(c.razon)} → ${c.programada ? 'programada' : 'no programada'} (${c.por})`, () => {
    assert.strictEqual(esParoPlanificado(c.razon), c.programada)
  })
}
