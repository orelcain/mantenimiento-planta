/**
 * Índice liviano del maestro de repuestos (node:test nativo).
 */
const { test } = require('node:test')
const assert = require('node:assert')

const { cambiosIndice, construirIndice, entradaDe } = require('../repuestosIndice')

const filtro = { codigoSAP: '3300135877', textoBreve: 'FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', nombresComunes: ['Filtro FRL'], fotosReales: [] }

test('la entrada lleva el nombre SAP y el primer nombre común; sin SAP no hay entrada', () => {
  assert.deepStrictEqual(entradaDe(filtro), ['FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', 'Filtro FRL'])
  assert.deepStrictEqual(entradaDe({ codigoSAP: '3300119348', textoBreve: 'TARJETA PESAJE RS485 MODBUS' }), ['TARJETA PESAJE RS485 MODBUS', ''])
  assert.strictEqual(entradaDe({ codigoSAP: null, descripcion: 'Motor SEW' }), null)
  assert.strictEqual(entradaDe({ codigoSAP: 'fishken-fk-001' }), null)
  assert.strictEqual(entradaDe(null), null)
})

test('solo se escribe cuando cambia algo que el índice muestra', () => {
  assert.strictEqual(cambiosIndice(filtro, { ...filtro, fotosReales: [{ url: 'x' }], equipos: ['a'] }), null)
  assert.deepStrictEqual(cambiosIndice(filtro, { ...filtro, nombresComunes: ['Filtro FRL Fishken', 'otro'] }), {
    'm.3300135877': ['FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', 'Filtro FRL Fishken'],
  })
  // Nuevo con SAP, borrado, y un doc que pierde o cambia su SAP.
  assert.deepStrictEqual(cambiosIndice(null, filtro), { 'm.3300135877': ['FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', 'Filtro FRL'] })
  assert.deepStrictEqual(cambiosIndice(filtro, null), { 'm.3300135877': 'BORRAR' })
  assert.deepStrictEqual(cambiosIndice(filtro, { ...filtro, codigoSAP: '3300000001' }), {
    'm.3300135877': 'BORRAR',
    'm.3300000001': ['FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', 'Filtro FRL'],
  })
  // Sin SAP antes ni después: nada.
  assert.strictEqual(cambiosIndice({ codigoSAP: null, textoBreve: 'a' }, { codigoSAP: null, textoBreve: 'b' }), null)
})

test('construir de cero deja solo los que tienen SAP', () => {
  const m = construirIndice([filtro, { codigoSAP: null, descripcion: 'Motor SEW' }, { codigoSAP: '4600001', textoBreve: 'Filtro de agua' }])
  assert.deepStrictEqual(Object.keys(m).sort(), ['3300135877', '4600001'])
})
