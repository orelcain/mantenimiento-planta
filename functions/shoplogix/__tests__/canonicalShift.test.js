/**
 * Tests de canonicalShiftName (node:test nativo — correr con `node --test`).
 *
 * Sin reglas activas (ver historia en canonicalShift.js): siempre debe
 * devolver el nombre CRUDO de Shoplogix, sin importar planta/hora/patrón
 * histórico. Estos tests fijan ese comportamiento (passthrough) como
 * regresión — si alguien reintroduce una regla histórica, estos tests
 * documentan por qué eso ya se probó y se revirtió.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { canonicalShiftName } = require('../canonicalShift')

const at = (h, m = 0) => new Date(Date.UTC(2026, 6, 8, h, m)) // wall-clock-as-UTC

test('Yal: madrugada 00:00 "Turno 1" pasa TAL CUAL — Shoplogix pudo haber renombrado el turno, no es una anomalía a corregir', () => {
  assert.strictEqual(canonicalShiftName('yal', at(0), 'Turno 1'), 'Turno 1')
})

test('Yal: madrugada "Turno 3" también pasa tal cual (sin override en ningún sentido)', () => {
  assert.strictEqual(canonicalShiftName('yal', at(0), 'Turno 3'), 'Turno 3')
})

test('Yal: tarde 14:45 "Turno 2" pasa tal cual', () => {
  assert.strictEqual(canonicalShiftName('yal', at(14, 45), 'Turno 2'), 'Turno 2')
})

test('Yal: variante "Turno 3*" pasa tal cual (no se normaliza el asterisco acá)', () => {
  assert.strictEqual(canonicalShiftName('yal', at(23), 'Turno 3*'), 'Turno 3*')
})

test('Yal: "Unscheduled" pasa tal cual', () => {
  assert.strictEqual(canonicalShiftName('yal', at(0), 'Unscheduled'), 'Unscheduled')
})

test('Chonchi: nombre intacto (nunca tuvo reglas)', () => {
  assert.strictEqual(canonicalShiftName('chonchi', at(0), 'Turno 1 Lunes'), 'Turno 1 Lunes')
})

test('Chonchi: noche 21:30 "Turno 1" intacto', () => {
  assert.strictEqual(canonicalShiftName('chonchi', new Date(Date.UTC(2026, 6, 8, 21, 30)), 'Turno 1'), 'Turno 1')
})

test('scheduledStart inválido → nombre crudo (no revienta)', () => {
  assert.strictEqual(canonicalShiftName('yal', new Date('inválida'), 'Turno 1'), 'Turno 1')
})

test('planta sin definición → nombre crudo', () => {
  assert.strictEqual(canonicalShiftName('otra', at(0), 'Turno 1'), 'Turno 1')
})
