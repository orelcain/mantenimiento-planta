import { describe, it, expect } from 'vitest'
import { cantidadDesdeTexto, avisoDeStock, CANTIDAD_MAXIMA, planDeEntrega } from '../solicitudDeRepuesto'

describe('planDeEntrega', () => {
  it('con bodega alcanza: descuenta y no hay faltante', () => {
    expect(planDeEntrega(2, { stockActual: 3 })).toEqual({ accion: 'descontar', stockAntes: 3, stockDespues: 1, faltante: 0 })
  })

  it('entregar más de lo registrado NO se calla: queda en 0 y dice cuánto faltaba', () => {
    expect(planDeEntrega(5, { stockActual: 3 })).toEqual({ accion: 'descontar', stockAntes: 3, stockDespues: 0, faltante: 2 })
  })

  it('sin documento de bodega no se inventa uno', () => {
    expect(planDeEntrega(2, undefined)).toEqual({ accion: 'sin-bodega' })
  })
})

describe('cantidadDesdeTexto', () => {
  it('borrar el campo NO es «1»: queda sin cantidad hasta que se escriba una', () => {
    // El campo viejo volvía a 1 al quedar vacío, y escribir «5» después daba «15».
    expect(cantidadDesdeTexto('')).toBeNull()
    expect(cantidadDesdeTexto('5')).toBe(5)
  })

  it('acepta enteros de 1 al tope, con espacios alrededor', () => {
    expect(cantidadDesdeTexto(' 12 ')).toBe(12)
    expect(cantidadDesdeTexto(String(CANTIDAD_MAXIMA))).toBe(CANTIDAD_MAXIMA)
  })

  it('rechaza cero, negativos, decimales, texto y cantidades absurdas', () => {
    for (const t of ['0', '-3', '2.5', '2,5', 'dos', '1e3', String(CANTIDAD_MAXIMA + 1)]) {
      expect(cantidadDesdeTexto(t)).toBeNull()
    }
  })
})

describe('avisoDeStock', () => {
  // El caso real de la única solicitud: AMORTIGUADOR 1421003000, bodega C-18 con 3.
  const amortiguador = { configurado: true, stockActual: 3, unidad: 'pzas', ubicacionBodega: 'C-18' }

  it('hay suficiente', () => {
    expect(avisoDeStock(amortiguador, 2)).toEqual({ nivel: 'ok', texto: 'En bodega: 3 pzas · C-18.' })
  })

  it('pedir más de lo que hay lo dice', () => {
    expect(avisoDeStock(amortiguador, 5).nivel).toBe('insuficiente')
    expect(avisoDeStock(amortiguador, 5).texto).toContain('no alcanza para 5')
  })

  it('cero en bodega = habrá que comprarlo', () => {
    expect(avisoDeStock({ ...amortiguador, stockActual: 0 }, 1).nivel).toBe('sin-stock')
  })

  it('sin documento de bodega el stock NO es cero: no se sabe', () => {
    expect(avisoDeStock({ configurado: false }, 1).nivel).toBe('desconocido')
    expect(avisoDeStock(undefined, 1).nivel).toBe('desconocido')
  })

  it('la ubicación sembrada «Sin ubicación» no se muestra como si fuera un lugar', () => {
    expect(avisoDeStock({ ...amortiguador, ubicacionBodega: 'Sin ubicación' }, 1).texto).toBe('En bodega: 3 pzas.')
    // ABRAZADERA 38010160 viene de la importación con ubicación «-».
    expect(avisoDeStock({ ...amortiguador, stockActual: 0, ubicacionBodega: '-' }, 1).texto).toBe('Sin stock en bodega (0 pzas) — habrá que comprarlo.')
  })
})
