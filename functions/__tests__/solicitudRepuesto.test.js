/**
 * El aviso de una solicitud de repuesto (node:test nativo).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const { mensajeTelegram, mensajeAltaTelegram, esAltaCodigo, lineaDeStock, RUTA_SOLICITUDES } = require('../solicitudRepuesto')

// La única solicitud real: AMORTIGUADOR 1421003000 ×2, bodega C-18 con 3.
const sol = { textoBreve: 'AMORTIGUADOR 1421003000', codigoSAP: '3300054757', cantidad: 2, solicitadoPorNombre: 'Danilo' }
const bodega = { stockActual: 3, unidad: 'pzas', ubicacionBodega: 'C-18' }

test('el enlace abre el panel de Solicitudes, no la última pestaña que quedó guardada', () => {
  const msg = mensajeTelegram(sol, bodega)
  assert.match(msg, /href="https:\/\/orelcain\.github\.io\/mantenimiento-planta\/repuestos\?solicitudes=1"/)
  assert.strictEqual(RUTA_SOLICITUDES, '/mantenimiento-planta/repuestos?solicitudes=1')
})

test('el mensaje dice el stock al momento de pedir', () => {
  assert.match(mensajeTelegram(sol, bodega), /📦 En bodega: 3 pzas · C-18\n/)
})

test('no alcanza / sin stock / sin registro', () => {
  assert.strictEqual(lineaDeStock(bodega, 5), '📦 En bodega: 3 pzas · C-18 — <b>no alcanza</b>')
  assert.strictEqual(lineaDeStock({ ...bodega, stockActual: 0, ubicacionBodega: '-' }, 1), '📦 <b>Sin stock en bodega</b> — hay que comprarlo')
  assert.strictEqual(lineaDeStock(null, 1), '📦 Sin registro en bodega')
})

test('el texto libre del usuario no rompe el HTML de Telegram', () => {
  const msg = mensajeTelegram({ ...sol, observaciones: 'urgente <para> la 142 & ya' }, bodega)
  assert.match(msg, /📝 urgente &lt;para&gt; la 142 &amp; ya/)
})

// ── Alta de código (ficha A3C): MISMA colección y MISMA función, otro mensaje ──────────────────────────
// 42203183 = relé en miniatura que el plano 888 usa en K20 y K22 (partes.json).
const alta = {
  tipo: 'alta_codigo', codigoFabricante: '42203183', codigoSAP: '', textoBreve: 'Relé en miniatura 24V DC',
  elemento: 'K20', elementos: ['K20', 'K22'], maquina: 'N2', nivel: 'pieza', cantidad: 1, solicitadoPorNombre: 'Danilo',
}

test('esAltaCodigo distingue el alta del pedido normal (que no trae tipo)', () => {
  assert.strictEqual(esAltaCodigo(alta), true)
  assert.strictEqual(esAltaCodigo(sol), false)
  assert.strictEqual(esAltaCodigo({ ...sol, tipo: 'repuesto' }), false)
  assert.strictEqual(esAltaCodigo(null), false)
})

test('el aviso del alta dice código, descripción, elementos, máquina, cantidad y quién', () => {
  const msg = mensajeAltaTelegram(alta)
  assert.match(msg, /Solicitud de alta de código/)
  assert.match(msg, /Código de fabricante <b>42203183<\/b>/)
  assert.match(msg, /Relé en miniatura 24V DC/)
  assert.match(msg, /K20, K22 en N2/)
  assert.match(msg, /Cantidad: <b>1<\/b>/)
  assert.match(msg, /👤 Danilo/)
  assert.match(msg, /href="https:\/\/orelcain\.github\.io\/mantenimiento-planta\/repuestos\?solicitudes=1"/)
})

test('el aviso del alta no habla de SAP ni de bodega: todavía no hay código ni stock', () => {
  const msg = mensajeAltaTelegram(alta)
  assert.doesNotMatch(msg, /SAP —/)
  assert.doesNotMatch(msg, /sin registro en bodega/i)
  assert.doesNotMatch(msg, /En bodega:/)
  assert.doesNotMatch(msg, /CONJUNTO/)
})

test('un conjunto se anuncia como CONJUNTO', () => {
  const msg = mensajeAltaTelegram({ ...alta, codigoFabricante: '34974309', textoBreve: 'Distribución de neumática', elemento: 'Y1', elementos: ['Y1', 'Y2', 'Y3'], maquina: 'N3', nivel: 'conjunto' })
  assert.match(msg, /<b>CONJUNTO<\/b>/)
  assert.match(msg, /Y1, Y2, Y3 en N3/)
})

test('un alta vieja sin elementos[] cae al elemento desde el que se pidió; sin nada, lo dice', () => {
  assert.match(mensajeAltaTelegram({ ...alta, elementos: undefined }), /K20 en N2/)
  assert.match(mensajeAltaTelegram({ ...alta, elementos: [], elemento: undefined, maquina: undefined }), /Sin elemento/)
})

test('el texto libre de la nota y del código no rompe el HTML del alta', () => {
  const msg = mensajeAltaTelegram({ ...alta, codigoFabricante: '42<2>', observaciones: 'urgente <ya> & ahora' })
  assert.match(msg, /<b>42&lt;2&gt;<\/b>/)
  assert.match(msg, /📝 urgente &lt;ya&gt; &amp; ahora/)
})

test('el pedido normal sigue igual: stock y SAP, sin nada del alta', () => {
  const msg = mensajeTelegram(sol, bodega)
  assert.match(msg, /Nueva solicitud de repuesto/)
  assert.match(msg, /SAP 3300054757/)
  assert.doesNotMatch(msg, /alta de código/i)
})
