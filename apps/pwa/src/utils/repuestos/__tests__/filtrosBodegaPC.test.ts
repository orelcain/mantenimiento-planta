import { describe, expect, it } from 'vitest'
import type { BodegaMergedItem } from '@/hooks/repuestos/useBodega'
import { FILTROS_INICIALES, FILTROS_LIMPIOS, facetas, grupoUbicacion, pasaFiltros, valoresDe } from '../filtrosBodegaPC'

const it0 = (x: Partial<BodegaMergedItem>): BodegaMergedItem => ({
  rowKey: x.codigoSAP ?? '', codigoSAP: '', codigoFabricante: '', textoBreve: '', valorUnitario: 0, equipos: [],
  stockActual: 0, stockMinimo: 0, ubicacionBodega: '', unidad: 'pzas', ...x,
} as BodegaMergedItem)

const ITEMS = [
  it0({ codigoSAP: '1', textoBreve: 'RODILLO', bodegaId: 'b', stockActual: 5, ubicacionBodega: 'C-3-2', clase: 'repuesto', equipos: [{ machineId: 'm1', machineName: 'BAADER 200' }], codigoFabricante: '92152025' }),
  it0({ codigoSAP: '2', textoBreve: 'CHAPA', bodegaId: 'b', stockActual: 1, stockMinimo: 4, ubicacionBodega: 'C-1-1', clase: 'repuesto', equipos: [{ machineId: 'm1', machineName: 'BAADER 200' }, { machineId: 'm2', machineName: 'BAADER 142' }] }),
  it0({ codigoSAP: '3', textoBreve: 'GUANTE', bodegaId: 'b', stockActual: 0, ubicacionBodega: 'BANDEJA 7', clase: 'insumo' }),
  it0({ codigoSAP: '4', textoBreve: 'SENSOR', clase: 'repuesto', equipos: [{ machineId: 'm2', machineName: 'BAADER 142' }] }),
]
const ids = (f = FILTROS_INICIALES, busca = '') => ITEMS.filter(i => pasaFiltros(i, f, busca)).map(i => i.codigoSAP).join('')

describe('filtros de Bodega en PC', () => {
  it('por defecto: los configurados (como el chip del celular)', () => expect(ids()).toBe('123'))
  it('agrupa ubicaciones', () => {
    expect(grupoUbicacion('C-3-2')).toBe('Estante C')
    expect(grupoUbicacion('BANDEJA 7')).toBe('Bandejas')
    expect(grupoUbicacion('')).toBe('')
  })
  it('dentro de un grupo es O; entre grupos es Y', () => {
    expect(ids({ ...FILTROS_LIMPIOS, estado: ['low', 'out'] })).toBe('23')
    expect(ids({ ...FILTROS_LIMPIOS, estado: ['low', 'out'], clase: ['repuesto'] })).toBe('2')
  })
  it('un repuesto en dos máquinas aparece en ambas', () => {
    expect(valoresDe(ITEMS[1]!, 'maquina')).toEqual(['BAADER 200', 'BAADER 142'])
    expect(ids({ ...FILTROS_LIMPIOS, maquina: ['BAADER 142'] })).toBe('24')
  })
  it('"otros" se suman como condiciones', () => {
    expect(ids({ ...FILTROS_LIMPIOS, otros: ['multi'] })).toBe('2')
    expect(ids({ ...FILTROS_LIMPIOS, otros: ['multi', 'fab'] })).toBe('')
  })
  it('cada opción cuenta lo que queda con los demás grupos aplicados', () => {
    const f = { ...FILTROS_INICIALES, clase: ['repuesto'] }
    const est = Object.fromEntries(facetas(ITEMS, f, 'estado').map(x => [x.valor, x.cuenta]))
    expect(est).toEqual({ ok: 1, low: 1, out: 0, unset: 1 })
    const cl = Object.fromEntries(facetas(ITEMS, f, 'clase').map(x => [x.valor, x.cuenta]))
    expect(cl).toEqual({ repuesto: 2, insumo: 1 })
    // la cuenta de una opción = filas al marcarla sola en ese grupo
    expect(ids({ ...f, clase: ['insumo'] }).length).toBe(1)
  })
  it('la búsqueda se combina con los filtros', () => expect(ids(FILTROS_INICIALES, 'chapa')).toBe('2'))
})
