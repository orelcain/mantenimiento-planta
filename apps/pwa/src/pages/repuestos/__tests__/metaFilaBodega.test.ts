import { describe, it, expect } from 'vitest'
import { metaFilaBodega } from '../metaFilaBodega'

const base = { codigoSAP: '3300025907', ubicacion: 'B-5-2', equipos: 3, valorTotal: 12500 }

describe('metaFilaBodega', () => {
  it('por defecto deja solo SAP y ubicación, sin puntos medios', () => {
    expect(metaFilaBodega(base, 'nombre')).toBe('3300025907, B-5-2')
  })

  it('agrega equipos solo al ordenar por equipos', () => {
    expect(metaFilaBodega(base, 'equipos')).toBe('3300025907, B-5-2, 3 equipos')
    expect(metaFilaBodega({ ...base, equipos: 1 }, 'equipos')).toBe('3300025907, B-5-2, 1 equipo')
  })

  it('agrega el valor solo al ordenar por valor', () => {
    expect(metaFilaBodega(base, 'valor')).toContain('$12')
    expect(metaFilaBodega({ ...base, valorTotal: 0 }, 'valor')).toBe('3300025907, B-5-2')
  })

  it('no deja comas sueltas si falta un dato', () => {
    expect(metaFilaBodega({ ...base, ubicacion: null }, 'nombre')).toBe('3300025907')
    expect(metaFilaBodega({ ...base, codigoSAP: null, ubicacion: '' }, 'nombre')).toBe('')
  })
})
