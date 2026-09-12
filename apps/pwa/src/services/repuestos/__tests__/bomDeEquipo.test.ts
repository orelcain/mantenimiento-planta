import { describe, it, expect } from 'vitest'
import { particionarRepuestosDeEquipo } from '../bomDeEquipo'

/** Filas reales de la EVISCERADORA BAADER 142 N1. */
const CON_CODIGO = [
  { id: 'a', codigoSAP: '3300120608', nombre: 'ACOPLAMIENTO 34753111', tipo: 'RACOR/FITTING', cantidadPorMaquina: 4 },
  { id: 'b', codigoSAP: '3300120607', nombre: 'ABRAZADERA 34752009', tipo: 'ABRAZADERA', cantidadPorMaquina: 40 },
  { id: 'c', codigoSAP: '3300011873', nombre: 'ABRAZADERA 38030218', tipo: 'RESORTE', cantidadPorMaquina: 19 },
]
const SIN_CODIGO = [
  { id: 'd', codigoSAP: '', nombre: 'Soporte', tipo: 'SOPORTE' },
  { id: 'e', codigoSAP: '', nombre: 'soporte', tipo: 'SOPORTE' },
  { id: 'f', codigoSAP: '', nombre: 'Soporte', tipo: '' },
  { id: 'g', codigoSAP: '—', nombre: 'Arandela', tipo: 'ARANDELA' },
]

describe('particionarRepuestosDeEquipo', () => {
  it('manda al BOM solo lo que tiene código SAP', () => {
    const r = particionarRepuestosDeEquipo([...CON_CODIGO, ...SIN_CODIGO])
    expect(r.bom.map((x) => x.id)).toEqual(['c', 'b', 'a'])
    expect(r.filasSinCodigo).toBe(4)
  })

  it('ordena el BOM por código, que es como se carga en IB01', () => {
    const r = particionarRepuestosDeEquipo(CON_CODIGO)
    expect(r.bom.map((x) => x.codigoSAP)).toEqual(['3300011873', '3300120607', '3300120608'])
  })

  it('agrupa el despiece por nombre sin importar mayúsculas', () => {
    const r = particionarRepuestosDeEquipo(SIN_CODIGO)
    expect(r.despiece).toHaveLength(2)
    const soporte = r.despiece[0]!
    expect(soporte.nombre).toBe('Soporte')
    expect(soporte.veces).toBe(3)
    expect(soporte.ids).toEqual(['d', 'e', 'f'])
  })

  it('conserva el tipo de la fila que sí lo trae', () => {
    const r = particionarRepuestosDeEquipo([
      { id: 'x', codigoSAP: '', nombre: 'Soporte', tipo: '' },
      { id: 'y', codigoSAP: '', nombre: 'Soporte', tipo: 'SOPORTE' },
    ])
    expect(r.despiece[0]?.tipo).toBe('SOPORTE')
  })

  it('ordena el despiece por cuántas veces aparece', () => {
    const r = particionarRepuestosDeEquipo(SIN_CODIGO)
    expect(r.despiece.map((g) => [g.nombre, g.veces])).toEqual([['Soporte', 3], ['Arandela', 1]])
  })

  it('un guion no es un código SAP', () => {
    const r = particionarRepuestosDeEquipo([{ id: 'g', codigoSAP: '—', nombre: 'Arandela' }])
    expect(r.bom).toHaveLength(0)
  })

  it('un código de menos de 6 dígitos tampoco', () => {
    const r = particionarRepuestosDeEquipo([{ id: 'h', codigoSAP: '4600001', nombre: 'X' }])
    expect(r.bom).toHaveLength(1) // 7 dígitos: sí
    expect(particionarRepuestosDeEquipo([{ id: 'i', codigoSAP: '12345', nombre: 'Y' }]).bom).toHaveLength(0)
  })

  it('con un equipo sin repuestos no devuelve nada', () => {
    const r = particionarRepuestosDeEquipo([])
    expect(r.bom).toHaveLength(0)
    expect(r.despiece).toHaveLength(0)
    expect(r.filasSinCodigo).toBe(0)
  })
})
