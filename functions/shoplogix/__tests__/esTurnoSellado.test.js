/**
 * Tests de `esTurnoSellado` (node:test nativo — correr con `node --test`).
 *
 * La decisión de sellar un turno como cerrado tiene dos enemigos, uno por lado:
 *   - Sellar de MENOS → turno zombie: el 26-08 en Chonchi el turno de día
 *     (07:15–15:00) seguía "produciendo" y pronosticando hora extra a las
 *     17:40, 2 h 30 min después del último pescado, porque el state vigente de
 *     las máquinas quedó congelado en uptime y `producing.length === 0` nunca
 *     se cumplía.
 *   - Sellar de MÁS → el caso Filete: `scheduledEnd` derivado del último
 *     intervalo va siempre unos minutos detrás del reloj, y sin margen un
 *     turno en plena producción se anunciaba cerrado (10-ago, fin derivado
 *     14:36 con la línea produciendo a las 14:40).
 */

const { test } = require('node:test')
const assert = require('node:assert')
const { esTurnoSellado, CLOSE_MARGIN_MS } = require('../../publicMonitor')

const MIN = 60_000
// Cierre programado de referencia (wall-clock de planta como UTC, igual que en prod).
const END = Date.parse('2026-08-26T15:00:00Z')

test('turno zombie: pasado el margen y sin producción nueva, se sella aunque las máquinas digan uptime', () => {
  // Chonchi 26-08 a las 17:40: último pescado 15:10, states congelados en uptime.
  assert.strictEqual(esTurnoSellado({
    nowWallMs: Date.parse('2026-08-26T17:40:00Z'),
    scheduledEndMs: END,
    hayProduciendo: true,
    ultimaProdMs: Date.parse('2026-08-26T15:10:00Z'),
  }), true)
})

test('hora extra real: máquinas produciendo CON datos frescos mantienen el turno abierto', () => {
  const now = Date.parse('2026-08-26T15:45:00Z')
  assert.strictEqual(esTurnoSellado({
    nowWallMs: now,
    scheduledEndMs: END,
    hayProduciendo: true,
    ultimaProdMs: now - 10 * MIN,
  }), false)
})

test('caso Filete: dentro del margen tras el fin derivado no se sella, produzca o no', () => {
  const now = END + 5 * MIN
  assert.strictEqual(esTurnoSellado({ nowWallMs: now, scheduledEndMs: END, hayProduciendo: true, ultimaProdMs: now - 2 * MIN }), false)
  assert.strictEqual(esTurnoSellado({ nowWallMs: now, scheduledEndMs: END, hayProduciendo: false, ultimaProdMs: now - 2 * MIN }), false)
})

test('pasado el margen sin máquinas produciendo, se sella (regla original)', () => {
  assert.strictEqual(esTurnoSellado({
    nowWallMs: END + CLOSE_MARGIN_MS + MIN,
    scheduledEndMs: END,
    hayProduciendo: false,
    ultimaProdMs: END,
  }), true)
})

test('sin producción registrada nunca (ultimaProdMs null): pasado el margen se sella', () => {
  assert.strictEqual(esTurnoSellado({
    nowWallMs: END + CLOSE_MARGIN_MS + MIN,
    scheduledEndMs: END,
    hayProduciendo: true,
    ultimaProdMs: null,
  }), true)
})

test('sin scheduledEnd no se sella jamás', () => {
  assert.strictEqual(esTurnoSellado({
    nowWallMs: Date.parse('2026-08-27T04:00:00Z'),
    scheduledEndMs: null,
    hayProduciendo: false,
    ultimaProdMs: null,
  }), false)
})
