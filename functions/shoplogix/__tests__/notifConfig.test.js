/**
 * Resolución de la config de notificaciones: DEFAULTS → overrides por planta →
 * lo que guardó el admin en Firestore.
 *
 * El caso que motivó los overrides por planta es real: con el umbral único de 50
 * piezas, el lote de PRUEBA de 59 piezas de la Baader 200 (2026-07-28) disparó un
 * brief de fin de turno como si hubiera sido un turno productivo.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { DEFAULTS, resolveNotifConfig } = require('../notifConfig')

test('sin config guardada, una planta sin overrides usa los defaults', () => {
  const c = resolveNotifConfig('chonchi', null)
  assert.strictEqual(c.shiftEnd.minPieces, 50)
  assert.strictEqual(c.events.stoppageMinMinutes, DEFAULTS.events.stoppageMinMinutes)
  assert.strictEqual(c.channels.telegramDest, 'bot')
})

test('Filete exige más piezas para el brief que el eviscerado', () => {
  const filete = resolveNotifConfig('filete', null)
  const chonchi = resolveNotifConfig('chonchi', null)
  assert.strictEqual(filete.shiftEnd.minPieces, 200)
  assert.ok(filete.shiftEnd.minPieces > chonchi.shiftEnd.minPieces,
    'el umbral de Filete debe ser mayor: 59 piezas de prueba no son un turno')
  // Lo que NO se declara por planta se hereda íntegro.
  assert.strictEqual(filete.shiftEnd.enabled, true)
  assert.strictEqual(filete.shiftEnd.delayMinutes, DEFAULTS.shiftEnd.delayMinutes)
  assert.strictEqual(filete.events.stoppageMinMinutes, DEFAULTS.events.stoppageMinMinutes)
})

test('lo guardado por el admin gana sobre el override de planta', () => {
  const c = resolveNotifConfig('filete', { shiftEnd: { minPieces: 1000 }, channels: { telegram: true } })
  assert.strictEqual(c.shiftEnd.minPieces, 1000)
  assert.strictEqual(c.channels.telegram, true)
  // y no borra el resto de la sección
  assert.strictEqual(c.channels.push, true)
  assert.strictEqual(c.shiftEnd.delayMinutes, DEFAULTS.shiftEnd.delayMinutes)
})

test('una planta desconocida no revienta: cae a los defaults', () => {
  const c = resolveNotifConfig('planta-que-no-existe', null)
  assert.deepStrictEqual(c.shiftEnd, { ...DEFAULTS.shiftEnd })
})

test('resolver no muta DEFAULTS (los objetos se copian)', () => {
  const c = resolveNotifConfig('filete', { events: { stoppageMinMinutes: 15 } })
  c.events.stoppageMinMinutes = 99
  assert.strictEqual(DEFAULTS.events.stoppageMinMinutes, 3)
  assert.strictEqual(resolveNotifConfig('filete', null).events.stoppageMinMinutes, 3)
})
