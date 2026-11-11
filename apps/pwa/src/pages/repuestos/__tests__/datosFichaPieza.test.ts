/**
 * Lo que dice la ficha de una pieza y la sección «Pedidos por atender» de Bodega.
 * Casos tomados de producción (10-11-2026): Amortiguador 1420704000, en el mínimo, con los
 * equipos repetidos que la ficha anterior contaba dos veces.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/services/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  collection: () => ({}), doc: () => ({}), addDoc: vi.fn(), updateDoc: vi.fn(), onSnapshot: () => () => {},
  query: () => ({}), orderBy: () => ({}), serverTimestamp: () => 'TS', Timestamp: class {},
}))

import {
  cuandoCorto, equiposUnicos, fraseDeEstado, imagenesDePieza, pedidosAbiertosDe, pedidosPorAtender, stockDelPedido, valorEnBodega,
} from '../datosFichaPieza'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'
import type { AltaCodigo, SolicitudRepuesto } from '@/hooks/repuestos/useSolicitudes'

const pieza = (p: Partial<BodegaMergedItem> = {}): BodegaMergedItem => ({
  rowKey: '3300098563', codigoSAP: '3300098563', codigoFabricante: '1420704000', textoBreve: 'AMORTIGUADOR 1420704000',
  valorUnitario: 1576, equipos: [], bodegaId: 'b1', stockActual: 1, stockMinimo: 1, ubicacionBodega: 'C-17', unidad: 'pzas',
  ...p,
})

const pedido = (p: Partial<SolicitudRepuesto>): SolicitudRepuesto => ({
  id: 'p', codigoSAP: '3300098563', textoBreve: 'AMORTIGUADOR', cantidad: 1, estado: 'pendiente',
  solicitadoPor: 'u', solicitadoPorNombre: 'Danilo Cortés', createdAt: new Date('2026-11-10T08:12:00'), ...p,
})

describe('fraseDeEstado', () => {
  it('en el mínimo y nunca contado', () => {
    expect(fraseDeEstado(pieza())).toEqual({ tono: 'aviso', texto: 'En el mínimo: queda 1 y el mínimo es 1. Nadie lo ha contado.' })
  })
  it('bajo el mínimo dice cuántas quedan', () => {
    expect(fraseDeEstado(pieza({ stockActual: 2, stockMinimo: 5 })).texto).toMatch(/^Bajo el mínimo: quedan 2 y el mínimo es 5\./)
  })
  it('cero sin mínimo no es alerta (punto neutro en la lista, frase que lo aclara)', () => {
    const f = fraseDeEstado(pieza({ stockActual: 0, stockMinimo: 0 }))
    expect(f.tono).toBe('falta')
    expect(f.texto).toMatch(/^Sin stock\. No tiene mínimo/)
  })
  it('sin registro en bodega', () => {
    expect(fraseDeEstado(pieza({ bodegaId: undefined })).tono).toBe('neutro')
  })
  it('con conteo dice cuándo y quién', () => {
    const f = fraseDeEstado(pieza({ stockActual: 4, stockMinimo: 1, ultimoConteoAt: new Date('2026-10-03T10:00:00'), ultimoConteoPor: 'Orel' }))
    expect(f).toEqual({ tono: 'ok', texto: 'Hay 4 pzas; el mínimo es 1. Contado el 03-10-26 por Orel.' })
  })
})

describe('equiposUnicos', () => {
  it('el mismo equipo con dos machineId cuenta una vez («Equipos (6)» con 3 nombres)', () => {
    const equipos = ['N1', 'N2', 'N3', 'N1', 'N2', 'N3'].map((n, i) => ({ machineId: `m${i}`, machineName: `EVISCERADORA BAADER 142 ${n}` }))
    expect(equiposUnicos({ equipos }).map(e => e.machineName)).toEqual([
      'EVISCERADORA BAADER 142 N1', 'EVISCERADORA BAADER 142 N2', 'EVISCERADORA BAADER 142 N3',
    ])
  })
})

describe('imagenesDePieza', () => {
  it('la captura del manual va primero y no se repiten URL', () => {
    const im = imagenesDePieza({
      dibujosManual: [{ url: 'd.jpg', rotulo: 'fig. 69 · pos. 15' }],
      fotos: ['f.jpg', 'd.jpg'], fotosCatalogo: ['c.jpg', 'f.jpg'],
    })
    expect(im).toEqual([
      { url: 'd.jpg', rotulo: 'fig. 69 · pos. 15', esDibujo: true },
      { url: 'f.jpg', rotulo: 'Foto de bodega', esDibujo: false },
      { url: 'c.jpg', rotulo: 'Foto del catálogo', esDibujo: false },
    ])
  })
  it('sin nada, lista vacía', () => {
    expect(imagenesDePieza({})).toEqual([])
  })
})

describe('pedidos', () => {
  // Solo los campos que lee la lógica; el resto de la alta (fuentes, nivel…) no importa aquí.
  const alta = {
    id: 'a', tipo: 'alta_codigo', estado: 'pendiente', codigoSAP: '', codigoFabricante: '6204-2RS', codigoNorm: '62042RS',
    textoBreve: 'Rodamiento', cantidad: 4, solicitadoPor: 'u', solicitadoPorNombre: 'Danilo', createdAt: new Date('2026-11-09T18:20:00'),
  } as unknown as AltaCodigo
  const lista = [
    pedido({ id: 'p1', createdAt: new Date('2026-11-10T08:12:00') }),
    pedido({ id: 'p2', codigoSAP: '3300011873', createdAt: new Date('2026-11-10T07:55:00') }),
    pedido({ id: 'p3', estado: 'aprobada', codigoSAP: '3300029112' }),
    pedido({ id: 'p4', estado: 'entregada' }),
    alta,
  ]

  it('por atender: aprobar (el más antiguo arriba), entregar y altas; los entregados no', () => {
    const r = pedidosPorAtender(lista)
    expect(r.porAprobar.map(s => s.id)).toEqual(['p2', 'p1'])
    expect(r.porEntregar.map(s => s.id)).toEqual(['p3'])
    expect(r.altas.map(s => s.id)).toEqual(['a'])
    expect(r.total).toBe(4)
  })

  it('pedidos abiertos de una pieza: sin entregados ni altas', () => {
    expect(pedidosAbiertosDe(lista, '3300098563').map(s => s.id)).toEqual(['p1'])
    expect(pedidosAbiertosDe(lista, '')).toEqual([])
  })

  it('stock del pedido en palabras cortas', () => {
    expect(stockDelPedido({ configurado: true, stockActual: 0 }, 1)).toEqual({ tono: 'crit', texto: 'sin stock' })
    expect(stockDelPedido({ configurado: true, stockActual: 1 }, 2)).toEqual({ tono: 'warn', texto: 'queda 1, no alcanza' })
    expect(stockDelPedido({ configurado: true, stockActual: 2 }, 1)).toEqual({ tono: 'ok', texto: 'quedan 2' })
    expect(stockDelPedido({ configurado: false }, 1).tono).toBe('neutro')
  })
})

describe('formato', () => {
  it('cuándo: hoy, ayer o fecha', () => {
    const ahora = new Date('2026-11-10T12:00:00')
    expect(cuandoCorto(new Date('2026-11-10T08:12:00'), ahora)).toBe('hoy 08:12')
    expect(cuandoCorto(new Date('2026-11-09T21:04:00'), ahora)).toBe('ayer 21:04')
    expect(cuandoCorto(new Date('2026-05-31T19:43:00'), ahora)).toBe('31-05 19:43')
  })
  it('valor en bodega usa el costo de compra si lo hay', () => {
    expect(valorEnBodega({ stockActual: 2, valorUnitario: 100 })).toBe(200)
    expect(valorEnBodega({ stockActual: 2, valorUnitario: 100, costoCompra: 150 })).toBe(300)
  })
})
