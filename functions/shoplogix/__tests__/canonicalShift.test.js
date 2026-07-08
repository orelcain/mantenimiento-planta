/**
 * Tests de canonicalShiftName (node:test nativo — correr con `node --test`).
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { canonicalShiftName } = require('../canonicalShift')

const at = (h, m = 0) => new Date(Date.UTC(2026, 6, 8, h, m)) // wall-clock-as-UTC

test('Yal: madrugada 00:00 "Turno 1" (anomalía) → canónico "Turno 3"', () => {
  assert.strictEqual(canonicalShiftName('yal', at(0), 'Turno 1'), 'Turno 3')
})

test('Yal: madrugada ya "Turno 3" se mantiene', () => {
  assert.strictEqual(canonicalShiftName('yal', at(0), 'Turno 3'), 'Turno 3')
})

test('Yal: tarde 14:45 "Turno 2" se mantiene (no cae en madrugada)', () => {
  assert.strictEqual(canonicalShiftName('yal', at(14, 45), 'Turno 2'), 'Turno 2')
})

test('Yal: 23:00 "Turno 3*" (variante) → canónico "Turno 3"', () => {
  assert.strictEqual(canonicalShiftName('yal', at(23), 'Turno 3*'), 'Turno 3')
})

test('Yal: "Unscheduled" NUNCA se canoniza (producción sin turno)', () => {
  assert.strictEqual(canonicalShiftName('yal', at(0), 'Unscheduled'), 'Unscheduled')
})

test('Chonchi: sin reglas → nombre intacto (madrugada lunes)', () => {
  assert.strictEqual(canonicalShiftName('chonchi', at(0), 'Turno 1 Lunes'), 'Turno 1 Lunes')
})

test('Chonchi: noche 21:30 "Turno 1" intacto', () => {
  assert.strictEqual(canonicalShiftName('chonchi', new Date(Date.UTC(2026, 6, 8, 21, 30)), 'Turno 1'), 'Turno 1')
})

test('scheduledStart inválido → nombre crudo', () => {
  assert.strictEqual(canonicalShiftName('yal', new Date('inválida'), 'Turno 1'), 'Turno 1')
})

test('planta sin reglas → nombre crudo', () => {
  assert.strictEqual(canonicalShiftName('otra', at(0), 'Turno 1'), 'Turno 1')
})
