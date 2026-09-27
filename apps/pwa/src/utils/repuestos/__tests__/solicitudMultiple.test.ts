import { describe, expect, it } from 'vitest'
import { acotarCantidad, agruparParaSolicitar, resumenDeSeleccion, solicitudesDe, type PiezaSolicitable } from '../solicitudMultiple'

// Piezas reales del inventario BAADER 200 (25-09-26).
const P: PiezaSolicitable[] = [
  { clave: 'a', codigoSAP: '3300106403', textoBreve: 'CUCHILLA CIRC 200MM 94011760', codigoFabricante: '94011760', comun: true, cantidadPorMaquina: 40, stock: { configurado: true, stockActual: 20, ubicacionBodega: 'BAADER 200 · Ubicación 2' } },
  { clave: 'b', codigoSAP: '3300051215', textoBreve: 'RODILLO 92152025', codigoFabricante: '92152025', cantidadPorMaquina: 6, stock: { configurado: true, stockActual: 5 } },
  { clave: 'c', codigoSAP: '3300011770', textoBreve: 'RODAMIENTO DE BOLAS RANURADO 33136006', codigoFabricante: '33136006', stock: { configurado: true, stockActual: 1 } },
  { clave: 'd', codigoSAP: '', textoBreve: 'GUIA DE COJINETE 2000400006', codigoFabricante: '2000400006' },
  { clave: 'e', codigoSAP: '3300011623', textoBreve: 'CHAPA DIRECTRIZ 519167', codigoFabricante: '519167', stock: { configurado: true, stockActual: 0 } },
]
const claves = (g: ReturnType<typeof agruparParaSolicitar>) => g.map((x) => `${x.grupo}:${x.piezas.map((p) => p.clave).join('')}`).join(' ')

describe('agrupar para solicitar', () => {
  it('comunes, con 1 unidad, resto y sin SAP, en ese orden; vacíos no aparecen', () => {
    expect(claves(agruparParaSolicitar(P))).toBe('comunes:a unaUnidad:c resto:eb sinSap:d')
  })
  it('busca por nombre, SAP o código de fabricante, sin acentos', () => {
    expect(claves(agruparParaSolicitar(P, 'guía'))).toBe('sinSap:d')
    expect(claves(agruparParaSolicitar(P, '92152025'))).toBe('resto:b')
    expect(claves(agruparParaSolicitar(P, '3300106403'))).toBe('comunes:a')
  })
})

describe('resumen y solicitudes', () => {
  const sel = new Map([['a', 40], ['b', 6], ['c', 4], ['d', 1]])
  it('cuenta solo lo que se puede pedir y avisa cuando la bodega no alcanza', () => {
    const r = resumenDeSeleccion(P, sel)
    expect([r.repuestos, r.unidades]).toEqual([3, 50])
    expect([...r.avisos.keys()]).toEqual(['a', 'b', 'c'])
    expect(r.avisos.get('b')).toMatch(/hay 5 pzas.*no alcanza para 6/)
  })
  it('sin stock también avisa; con stock suficiente no', () => {
    const r = resumenDeSeleccion(P, new Map([['e', 1], ['a', 3]]))
    expect(r.avisos.get('e')).toMatch(/Sin stock/)
    expect(r.avisos.has('a')).toBe(false)
  })
  it('arma una solicitud por pieza marcada; la sin SAP no sale', () => {
    expect(solicitudesDe(P, sel, ' urgente ').map((s) => [s.codigoSAP, s.cantidad, s.observaciones])).toEqual([
      ['3300106403', 40, 'urgente'], ['3300051215', 6, 'urgente'], ['3300011770', 4, 'urgente'],
    ])
    expect(solicitudesDe(P, new Map([['a', 1]]))[0]!.observaciones).toBeUndefined()
  })
  it('la cantidad se acota a un entero entre 1 y el máximo', () => {
    expect([acotarCantidad(0), acotarCantidad(2.6), acotarCantidad(99999), acotarCantidad(NaN)]).toEqual([1, 3, 9999, 1])
  })
})
