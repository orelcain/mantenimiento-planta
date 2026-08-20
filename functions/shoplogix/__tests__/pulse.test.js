/**
 * Tests de `pulse` (node:test nativo — correr con `node --test`).
 *
 * El pulso es el ritmo casi instantáneo. Lo que se protege acá es que no
 * parpadee entre "va rápido" y "parada" por el refresco de 2 min de Shoplogix,
 * y que la radiografía del caso en cero no engorde el doc del monitor.
 */

const test = require('node:test')
const assert = require('node:assert')
const { componerPulso, ritmoDeVentana, radiografia } = require('../pulse')

const lect = (min, total) => ({ at: new Date(Date.UTC(2026, 7, 19, 5, min)).toISOString(), totalCycles: total })

test('el ritmo se mide sobre la ventana, no entre lecturas consecutivas', () => {
  // Caso REAL del 18-08: el contador de Shoplogix se refresca cada 2 min, así
  // que entre consecutivas alterna 23, 0, 19, 0 — y ese 0 no es que la línea
  // pare. Sobre la ventana sale un número que se puede mirar.
  const lecturas = [lect(0, 1453), lect(1, 1476), lect(2, 1476), lect(3, 1495), lect(4, 1495)]
  const cpm = ritmoDeVentana(lecturas)
  assert.strictEqual(cpm, (1495 - 1453) / 4)
  assert.ok(cpm > 0, 'no debe dar 0 aunque la última pareja no haya cambiado')
})

test('un acumulado que baja no es un ritmo negativo: es cambio de turno', () => {
  assert.strictEqual(ritmoDeVentana([lect(0, 5000), lect(4, 12)]), null)
})

test('con una sola lectura no se inventa un ritmo', () => {
  assert.strictEqual(ritmoDeVentana([lect(0, 100)]), null)
})

test('el diagnóstico NO se guarda en el doc del monitor', () => {
  // El doc del monitor se escribe cada minuto y lo lee la PWA: la radiografía
  // viaja a su propio doc, no acá.
  const p = componerPulso(null, { ...lect(0, 0), diag: { filas: 1, muestra: [] } })
  assert.strictEqual(p.diag, undefined)
  assert.deepStrictEqual(Object.keys(p.lecturas[0]).sort(), ['at', 'totalCycles'])
})

test('la radiografía describe la forma sin copiar la respuesta entera', () => {
  const data = {
    machines: [
      { machineid: 'Total', name: 'Total', shift: 'Turno 1', target: 20, states: [{ type: 'Uptime', cycles: 0, name: 'Produciendo' }] },
      { machineid: 'abc', name: 'Ev 1', states: [{ type: 'Downtime', cycles: 0 }] },
    ],
    jobs: [], otraCosa: 1,
  }
  const r = radiografia(data)
  assert.strictEqual(r.filas, 2)
  assert.strictEqual(r.muestra[0].machineid, 'Total')
  assert.deepStrictEqual(r.muestra[0].estados[0], { type: 'Uptime', cycles: 0, name: 'Produciendo' })
  assert.ok(r.clavesRaiz.includes('machines'))
  // Guarda los VALORES de los campos escalares: son los candidatos a ser el
  // acumulado del turno cuando `states` viene vacío.
  assert.strictEqual(r.muestra[0].valores.target, 20)
  assert.strictEqual(r.muestra[0].valores.shift, 'Turno 1')
  assert.strictEqual(r.raizValores.otraCosa, 1)
  // No arrastra la respuesta completa ni los objetos anidados.
  assert.strictEqual(r.muestra[0].valores.states, undefined)
  assert.strictEqual(JSON.stringify(r).length < 1200, true)
})

// ── Hora de planta ──────────────────────────────────────────────────────────

const { ahoraEnPlanta, chileUtcOffsetHours } = require('../polling')
const { toShoplogixTime } = require('../time')

test('a Shoplogix se le manda la hora de PLANTA, no UTC', () => {
  // El defecto del 2026-08-19: se mandaba `new Date()` y Shoplogix lo leía como
  // hora local, o sea preguntábamos 4 h en el futuro. A las 19:58 UTC devolvía
  // la ficha del turno de la noche (21:30→05:15) con todo en cero.
  const utc = new Date('2026-08-19T19:58:47.000Z')
  const off = chileUtcOffsetHours(utc)
  const enPlanta = ahoraEnPlanta(utc)

  assert.strictEqual((utc.getTime() - enPlanta.getTime()) / 3_600_000, off)
  // Formateado con getters UTC da la hora del reloj de planta.
  assert.strictEqual(toShoplogixTime(enPlanta).slice(9, 13), String(19 - off).padStart(2, '0') + '58')
  // Y ya no cae dentro de un turno que aún no empezó.
  assert.ok(enPlanta < utc, 'Chile va detrás de UTC')
})

test('el desfase se recalcula por fecha: verano e invierno no son iguales', () => {
  const invierno = chileUtcOffsetHours(new Date('2026-08-19T12:00:00Z'))
  const verano = chileUtcOffsetHours(new Date('2026-01-15T12:00:00Z'))
  assert.ok(invierno === 4 || invierno === 3)
  assert.ok(verano === 3 || verano === 4)
  assert.notStrictEqual(invierno, verano)
})
