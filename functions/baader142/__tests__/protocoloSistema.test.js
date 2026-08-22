/**
 * Tests de las alertas de SISTEMA (node:test). El caso es la lectura real de la
 * N2 del 22-08-2026: critica en abrazaderas y correcciones totales con los 5
 * motores en verde — la version anterior no alertaba NADA.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { evaluarLectura, componerAlerta } = require('../protocoloAlertas')

const N2_2208 = {
  maquina: 'baader-n2', fecha: '2026-08-22', fish: 3022,
  stops: 13, stopc: 1032, tclip: 12, tclipc: 811, anusi: 31, anuso: 70,
  e821: 0, e821c: 0, e822: 1, e822c: 212, e823: 3, e823c: 6,
  e824: 0, e824c: 0, e825: 1, e825c: 3,
}

test('la N2 real del 22-08 ahora SI alerta (antes: silencio total)', () => {
  const ev = evaluarLectura(N2_2208, [])
  assert.ok(ev.alertas.length >= 3)
  const nombres = ev.alertas.map((a) => a.herramienta)
  assert.ok(nombres.some((n) => n.includes('Correcciones totales')))
  assert.ok(nombres.some((n) => n.includes('Abrazaderas')))
  // anuso 70/3022 = 23/1000 -> intervenir en escala de paradas (3/10/30)
  assert.ok(nombres.some((n) => n.includes('palpador entrada')))
})

test('el mensaje nombra el sistema con su pista, sin inductivo fantasma', () => {
  const msg = componerAlerta(evaluarLectura(N2_2208, []))
  assert.match(msg, /Correcciones totales/)
  assert.match(msg, /abrazaderas de cola/)
  assert.doesNotMatch(msg, /inductivo\s+,/)   // el hint de motores no aplica aca
})

test('una maquina sana sigue en silencio', () => {
  const sana = { ...N2_2208, stopc: 60, tclipc: 30, anuso: 5, anusi: 4, stops: 6, e822c: 4 }
  // 60/3022=20, 30/3022=10, 5/3022=2, 6/3022=2 -> todo bajo intervenir
  assert.equal(componerAlerta(evaluarLectura(sana, [])), null)
})
