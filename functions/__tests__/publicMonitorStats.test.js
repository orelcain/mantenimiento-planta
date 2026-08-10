/**
 * Tests de la telemetría del monitor público (node:test nativo).
 *
 * Lo que se juega acá es doble: que los números sean creíbles —si el contador
 * infla, la conclusión "Control de Producción usa el link" deja de valer— y que
 * el doc no crezca sin techo, porque lo escribe un endpoint abierto.
 */

const { test } = require('node:test')
const assert = require('node:assert')

const {
  applyEvent, sanitizeViewerId, deviceKind, MAX_VIEWERS, MAX_DAYS, OPEN_DEDUPE_MS,
} = require('../publicMonitorStats')

const wall = (h = 10, d = 10) => new Date(Date.UTC(2026, 7, d, h, 0, 0))
const ev = (over = {}) => ({
  viewerId: 'aaaaaaaa-1111',
  event: 'open',
  device: 'movil',
  secs: 0,
  viewingPast: false,
  nowMs: Date.UTC(2026, 7, 10, 14, 0, 0),
  nowWall: wall(),
  ...over,
})

test('una apertura cuenta una vez y registra el dispositivo', () => {
  const s = applyEvent(null, ev())

  assert.equal(s.opens, 1)
  assert.equal(s.viewersCount, 1)
  assert.equal(s.devices.movil, 1)
  assert.equal(s.byDay['2026-08-10'].opens, 1)
  assert.equal(s.byHour['10'], 1)
  assert.equal(s.firstOpenAt, s.lastOpenAt)
})

test('recargar la pestaña no son visitas nuevas', () => {
  const t0 = Date.UTC(2026, 7, 10, 14, 0, 0)
  let s = applyEvent(null, ev({ nowMs: t0 }))
  // Tres recargas seguidas en dos minutos.
  for (const min of [1, 2, 2.5]) {
    s = applyEvent(s, ev({ nowMs: t0 + min * 60_000 }))
  }

  assert.equal(s.opens, 1, 'sigue siendo una sola visita')
  assert.equal(s.viewersCount, 1)

  // Pasada la ventana de dedupe, sí es una visita nueva.
  s = applyEvent(s, ev({ nowMs: t0 + OPEN_DEDUPE_MS + 1000 }))
  assert.equal(s.opens, 2)
  assert.equal(s.viewersCount, 1, 'el mismo dispositivo no suma otro dispositivo')
})

test('dispositivos distintos se cuentan por separado', () => {
  let s = applyEvent(null, ev({ viewerId: 'aaaaaaaa-1111', device: 'movil' }))
  s = applyEvent(s, ev({ viewerId: 'bbbbbbbb-2222', device: 'escritorio' }))
  s = applyEvent(s, ev({ viewerId: 'cccccccc-3333', device: 'movil' }))

  assert.equal(s.viewersCount, 3)
  assert.equal(s.opens, 3)
  assert.deepEqual(s.devices, { movil: 2, escritorio: 1 })
  assert.equal(s.byDay['2026-08-10'].viewers.length, 3)
})

test('los latidos acumulan tiempo mirado, con tope por latido', () => {
  let s = applyEvent(null, ev())
  s = applyEvent(s, ev({ event: 'ping', secs: 120 }))
  s = applyEvent(s, ev({ event: 'ping', secs: 120 }))
  assert.equal(s.secondsViewed, 240)

  // Un latido absurdo no puede inflar el total: el endpoint es abierto.
  s = applyEvent(s, ev({ event: 'ping', secs: 999999 }))
  assert.equal(s.secondsViewed, 240 + 300, 'recortado al máximo por latido')
  assert.equal(s.opens, 1, 'un latido no es una apertura')
})

test('se registra si estaban mirando el turno actual o uno anterior', () => {
  let s = applyEvent(null, ev())
  s = applyEvent(s, ev({ viewerId: 'bbbbbbbb-2222', viewingPast: true }))
  assert.deepEqual(s.shiftViews, { actual: 1, anteriores: 1 })
})

test('el doc no crece sin techo: se podan dispositivos viejos y días viejos', () => {
  let s = null
  const t0 = Date.UTC(2026, 7, 1, 12, 0, 0)

  // 80 dispositivos distintos a lo largo de 20 días.
  for (let i = 0; i < 80; i++) {
    const dia = 1 + (i % 20)
    s = applyEvent(s, ev({
      viewerId: `aaaaaaaa-${String(i).padStart(4, '0')}`,
      nowMs: t0 + i * 3_600_000,
      nowWall: new Date(Date.UTC(2026, 7, dia, 12, 0, 0)),
    }))
  }

  assert.equal(Object.keys(s.viewers).length, MAX_VIEWERS, 'detalle acotado')
  assert.equal(s.viewersCount, 80, 'el acumulado histórico NO se poda')
  assert.ok(Object.keys(s.byDay).length <= MAX_DAYS)
  assert.equal(s.opens, 80)
})

test('el viewerId se valida contra un formato fijo', () => {
  assert.equal(sanitizeViewerId('a1b2c3d4-5566-7788'), 'a1b2c3d4-5566-7788')
  assert.equal(sanitizeViewerId('A1B2C3D4-5566-7788'), 'a1b2c3d4-5566-7788')
  assert.equal(sanitizeViewerId('corto'), null)
  assert.equal(sanitizeViewerId('<script>alert(1)</script>'), null)
  assert.equal(sanitizeViewerId('danilo@empresa.cl'), null, 'nada que parezca identidad entra')
  assert.equal(sanitizeViewerId(''), null)
  assert.equal(sanitizeViewerId(undefined), null)
})

test('del user-agent solo sale la categoría del aparato', () => {
  assert.equal(deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari'), 'movil')
  assert.equal(deviceKind('Mozilla/5.0 (Linux; Android 14) Chrome Mobile'), 'movil')
  assert.equal(deviceKind('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome'), 'escritorio')
  assert.equal(deviceKind(undefined), 'escritorio')
})

test('applyEvent no muta el estado que recibe', () => {
  const antes = applyEvent(null, ev())
  const copia = JSON.parse(JSON.stringify(antes))
  applyEvent(antes, ev({ viewerId: 'bbbbbbbb-2222' }))
  assert.deepEqual(JSON.parse(JSON.stringify(antes)), copia)
})
