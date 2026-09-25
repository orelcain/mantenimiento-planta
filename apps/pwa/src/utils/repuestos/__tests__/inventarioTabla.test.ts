import { describe, expect, it } from 'vitest'
import type { InventarioLinea } from '@/hooks/repuestos/useBodega'
import { FILTROS_VACIOS, diferencia, filtrosActivos, ordenarLineas, pasaFiltros } from '../inventarioTabla'

const base: InventarioLinea = {
  id: '', ubicacion: '', codigoFabricante: '', codigoCuaderno: '', codigoSAP: '', textoBreve: '', descripcion: '',
  nombreComun: '', cantidad: null, stockSistema: null, notaCuaderno: '', estado: 'validado',
}
// Casos reales del conteo BAADER 200 (25-09-26).
const L: InventarioLinea[] = [
  { ...base, id: 'a', ubicacion: 'Ubicación 5', codigoFabricante: '2001202002', codigoCuaderno: '2001202002', codigoSAP: '3300017418', textoBreve: 'CHAPA GUIA 2001202002', cantidad: 1, stockSistema: 18 },
  { ...base, id: 'b', ubicacion: 'Ubicación 1', codigoFabricante: '92152025', codigoCuaderno: '92152025', codigoSAP: '3300051215', textoBreve: 'RODILLO 92152025', nombreComun: 'bocina', cantidad: 5, stockSistema: 6 },
  { ...base, id: 'c', ubicacion: 'Ubicación 3', codigoFabricante: '92481630', codigoCuaderno: '92481630', cantidad: 7, estado: 'dudoso', motivo: 'codigo' },
  { ...base, id: 'd', ubicacion: 'Ubicación 10', codigoFabricante: '519167', codigoCuaderno: '519167', codigoSAP: '3300011623', textoBreve: 'CHAPA DIRECTRIZ', cantidad: 16, stockSistema: 16 },
]
const ids = (ls: InventarioLinea[]) => ls.map(l => l.id).join('')
const f = (x: Partial<typeof FILTROS_VACIOS>) => ({ ...FILTROS_VACIOS, ...x })

describe('filtros de la tabla', () => {
  it('sin filtros pasa todo', () => expect(ids(L.filter(l => pasaFiltros(l, FILTROS_VACIOS)))).toBe('abcd'))
  it('por ubicación exacta (la 1 no trae la 10)', () => expect(ids(L.filter(l => pasaFiltros(l, f({ ubicacion: 'Ubicación 1' }))))).toBe('b'))
  it('se combinan: con SAP + faltan', () => expect(ids(L.filter(l => pasaFiltros(l, f({ sap: 'con', dif: 'falta' }))))).toBe('ab'))
  it('diferencia 0 = cuadra; sin dato aparte', () => {
    expect(ids(L.filter(l => pasaFiltros(l, f({ dif: 'cero' }))))).toBe('d')
    expect(ids(L.filter(l => pasaFiltros(l, f({ dif: 'nd' }))))).toBe('c')
  })
  it('estado: dudosos y por motivo', () => {
    expect(ids(L.filter(l => pasaFiltros(l, f({ estado: 'dudoso' }))))).toBe('c')
    expect(ids(L.filter(l => pasaFiltros(l, f({ estado: 'codigo' }))))).toBe('c')
    expect(ids(L.filter(l => pasaFiltros(l, f({ estado: 'sap' }))))).toBe('')
  })
  it('nombre busca también el nombre común, sin acentos', () => expect(ids(L.filter(l => pasaFiltros(l, f({ nombre: 'bocína' }))))).toBe('b'))
  it('búsqueda global por palabras', () => expect(ids(L.filter(l => pasaFiltros(l, FILTROS_VACIOS, 'chapa 3300017418')))).toBe('a'))
  it('cuenta filtros activos', () => expect(filtrosActivos(f({ ubicacion: 'x', dif: 'con' }), 'q')).toBe(3))
})

describe('orden', () => {
  it('por diferencia: la que más falta primero; sin dato al final', () => {
    expect(diferencia(L[0]!)).toBe(-17)
    expect(ids(ordenarLineas(L, 'dif', 1))).toBe('abdc')
    expect(ids(ordenarLineas(L, 'dif', -1))).toBe('dbac')
  })
  it('ubicación en orden natural (2 antes que 10)', () => expect(ids(ordenarLineas(L, 'ubicacion', 1))).toBe('bcad'))
})
