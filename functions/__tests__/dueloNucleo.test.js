/**
 * El backend cuenta el Duelo con la MISMA regla que la pantalla (node:test nativo).
 *
 * `lib/dueloNucleo.cjs` es el núcleo del marcador de la PWA empaquetado (`scripts/build-duelo-nucleo.mjs`). Sobre datos
 * reales de las semanas 43 y 44 tiene que dar exactamente la foto que el test de la PWA (`dueloNucleo.test.ts`) le exige
 * a `dueloNucleo.ts`. Si alguien edita el `.cjs` a mano, o la PWA cambia la regla sin regenerarlo, uno de los dos falla.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('fs')
const path = require('path')

const nucleo = require('../lib/dueloNucleo.cjs')
const { instantanea } = require('./fixtures/instantaneaDuelo.cjs')
const fixture = require('./fixtures/duelo-semanas-43-44.json')
const esperado = require('./fixtures/duelo-semanas-43-44.esperado.json')

test('misma regla: el núcleo empaquetado da la foto esperada de las semanas 43 y 44', () => {
  const foto = JSON.parse(JSON.stringify(instantanea(nucleo, fixture)))
  assert.deepStrictEqual(foto, esperado)
})

test('el núcleo se carga en Node sin Firebase ni React y trae lo que el cierre necesita', () => {
  for (const f of ['resumenesDeStats', 'duelosDeTurnos', 'puntajeJornada', 'marcadorDePeriodo', 'costoDeMantencionPeriodo', 'cicloDe', 'jornadaDe', 'modoArranqueDe', 'unidadDeMaquinas']) {
    assert.equal(typeof nucleo[f], 'function', f)
  }
  const texto = fs.readFileSync(path.join(__dirname, '..', 'lib', 'dueloNucleo.cjs'), 'utf8')
  assert.match(texto, /NO EDITAR A MANO/)
  assert.doesNotMatch(texto, /require\("(firebase|react)/, 'el núcleo no arrastra dependencias de la PWA')
})

test('la regla de jornada y equipos del cierre: la noche abre la jornada y la semana ISO rota los equipos', () => {
  // Ancla: semana del 26-10-2026 → día Rebolledo, noche Cárdenas; la semana anterior, al revés.
  assert.equal(nucleo.equipoDelTurno('2026-10-28_Turno 2', false), 'rebolledo')
  assert.equal(nucleo.equipoDelTurno('2026-10-28_Turno 1', true), 'cardenas')
  assert.equal(nucleo.equipoDelTurno('2026-10-21_Turno 2', false), 'cardenas')
  assert.equal(nucleo.cicloDe('2026-10-28').inicio, '2026-10-26')
})
