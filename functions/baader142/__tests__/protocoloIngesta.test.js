/**
 * Tests de protocoloIngesta (node:test — correr con `node --test`).
 * Los números "reales" son la lectura del video del 21-08-2026 (Baader 142 N2:
 * 2163 pescados, E824-C = 800 → 370/1000), transcrita y verificada contra el panel.
 */
const { test } = require('node:test')
const assert = require('node:assert')
const { componerIngesta, componerCargada, componerRechazo } = require('../protocoloIngesta')

const ok = (over = {}) => ({
  resultado: 'ok', maquina: 'baader-n2', fecha: '2026-08-21', fish: 2163,
  e821c: 0, e822c: 0, e823c: 0, e824c: 0, e825c: 0, ...over,
})

test('rechazo por F7 nombra los contadores con el rotulo del display', () => {
  const m = componerRechazo({
    resultado: 'rechazado', maquina: 'baader-n2', fecha: '2026-08-21', fish: 2163,
    regla: 'F7', faltantes: ['tclip', 'tclipc', 'anuso', 'e825c'],
  })
  // El operador busca "TAIL CLIP" en el panel, no "tclip".
  assert.match(m, /TAIL CLIP/)
  assert.match(m, /T-CLIP-C/)
  assert.match(m, /ANUS-O/)
  assert.match(m, /E825-C/)
  assert.doesNotMatch(m, /tclipc/)
  assert.match(m, /No se pudo cargar/)
})

test('lectura real de la N2: excavador A critico y es el primero a revisar', () => {
  const m = componerCargada(ok({ e822c: 209, e823c: 5, e824c: 800, e825c: 4 }))
  assert.match(m, /CRÍTICO/)
  assert.match(m, /Excavador A SM4/)
  assert.match(m, /370/)                      // 800 / 2163 * 1000
  assert.match(m, /A revisar primero:<\/b> Excavador A/)
  assert.match(m, /inductivo B4/)
})

test('las herramientas sanas se listan en el orden del protocolo', () => {
  const m = componerCargada(ok({ e822c: 209, e824c: 800 }))
  assert.match(m, /Sin novedad: SM1 · SM3 · SM5/)
})

test('sin alertas dice que no hay nada que revisar, no calla', () => {
  // A diferencia de protocoloAlertas, este mensaje SIEMPRE sale: el operador
  // subio un video y necesita saber que llego.
  const m = componerCargada(ok({ fish: 5000, e824c: 2 }))
  assert.match(m, /🟢/)
  assert.match(m, /Nada que revisar/)
})

test('muestra insuficiente: ni semaforo en la cabecera ni tasas', () => {
  // e825c 300 sobre 640 pescados daria 469/1000 = "critico", pero el panel no
  // calcula /1000Fi antes de 1000 pescados: pintarlo rojo seria mentir.
  const m = componerCargada(ok({ fish: 640, e825c: 300 }))
  assert.match(m, /^⚠️ <b>Protocolo/)
  assert.doesNotMatch(m, /🔴/)
  assert.doesNotMatch(m, /CRÍTICO/)
  assert.doesNotMatch(m, /469/)
  assert.match(m, /Muestra insuficiente/)
})

test('componerIngesta enruta por resultado y descarta lo no accionable', () => {
  assert.match(componerIngesta(ok()), /Lectura del 2026-08-21 cargada/)
  assert.match(
    componerIngesta({ resultado: 'rechazado', maquina: 'baader-n1', fecha: '2026-08-21', regla: 'F1' }),
    /No se pudo cargar/,
  )
  assert.equal(componerIngesta(null), null)
  assert.equal(componerIngesta({ resultado: 'ok' }), null)          // sin maquina/fecha
  assert.equal(componerIngesta(ok({ resultado: 'otra-cosa' })), null)
})
