import { describe, it, expect } from 'vitest'
import { unicosPorId, idsDelAlcance } from '../alcanceDeExportacion'

/** El catálogo real: una fila por cada equipo donde sirve la pieza. */
const catalogoConRepeticiones = [
  { id: 'a', sap: '3300138378' },
  { id: 'b', sap: '3300138386' },
  { id: 'a', sap: '3300138378' }, // la misma pieza en otro equipo
  { id: 'c', sap: '3300138387' },
  { id: 'a', sap: '3300138378' }, // y en un tercero
  { id: 'b', sap: '3300138386' },
]

describe('el botón del alcance dice lo que se va a exportar', () => {
  it('el conteo del botón es el de piezas que salen, no el de filas', () => {
    // El caso real: el botón decía 6026 y el listado de al lado, 2102.
    expect(catalogoConRepeticiones).toHaveLength(6)
    expect(unicosPorId(catalogoConRepeticiones)).toHaveLength(3)
  })

  it('seleccionar «todo» el alcance selecciona exactamente lo que el botón anuncia', () => {
    const seleccion = idsDelAlcance(catalogoConRepeticiones)
    const exportados = unicosPorId(catalogoConRepeticiones.filter((r) => seleccion.has(r.id)))
    expect(exportados).toHaveLength(unicosPorId(catalogoConRepeticiones).length)
  })

  it('nunca queda vacío el alcance que el botón anuncia con ítems', () => {
    // «Catálogo Completo (6026)» dejaba la selección en 0 y «Exportar Selección (0)».
    const seleccion = idsDelAlcance(catalogoConRepeticiones)
    expect(seleccion.size).toBeGreaterThan(0)
    expect(seleccion.size).toBe(unicosPorId(catalogoConRepeticiones).length)
  })
})

describe('unicosPorId', () => {
  it('conserva el orden de la primera aparición', () => {
    expect(unicosPorId(catalogoConRepeticiones).map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('no muta la lista original', () => {
    const copia = [...catalogoConRepeticiones]
    unicosPorId(catalogoConRepeticiones)
    expect(catalogoConRepeticiones).toEqual(copia)
  })

  it('con una lista vacía devuelve vacío y no revienta', () => {
    expect(unicosPorId([])).toEqual([])
    expect(idsDelAlcance([]).size).toBe(0)
  })

  it('una lista sin repeticiones pasa entera', () => {
    const lista = [{ id: 'x' }, { id: 'y' }, { id: 'z' }]
    expect(unicosPorId(lista)).toHaveLength(3)
  })
})
