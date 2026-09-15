/**
 * El aviso de una solicitud de repuesto (node:test nativo).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const { mensajeTelegram, lineaDeStock, RUTA_SOLICITUDES } = require('../solicitudRepuesto')

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
