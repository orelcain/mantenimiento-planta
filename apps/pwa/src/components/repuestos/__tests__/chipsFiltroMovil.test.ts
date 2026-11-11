import { describe, expect, it } from 'vitest'
import { chipsFiltroMovil, filtrosHojaRestantes, resumenMas, type EntradaMas } from '../chipsFiltroMovil'

const base: EntradaMas = { estadoActivo: null, favOnly: false, favEquipo: false, faceta: false, conFotos: false, galeria: false, filtrosHojaTotal: 0 }

describe('chipsFiltroMovil', () => {
  it('muestra Todos, Bajo y Sin stock cuando tienen elementos', () => {
    const c = chipsFiltroMovil({ total: 41, low: 3, out: 2, estadoActivo: null })
    expect(c.map((x) => [x.clave, x.n])).toEqual([['todos', 41], ['low', 3], ['out', 2]])
    expect(c[0]?.activo).toBe(true)
  })

  it('un chip en 0 no se muestra, salvo Todos', () => {
    const c = chipsFiltroMovil({ total: 0, low: 0, out: 0, estadoActivo: null })
    expect(c.map((x) => x.clave)).toEqual(['todos'])
  })

  it('un chip activo en 0 se mantiene para poder quitarlo', () => {
    const c = chipsFiltroMovil({ total: 5, low: 0, out: 2, estadoActivo: 'low' })
    expect(c.map((x) => x.clave)).toEqual(['todos', 'low', 'out'])
    expect(c.find((x) => x.clave === 'low')?.activo).toBe(true)
    expect(c[0]?.activo).toBe(false)
  })
})

describe('resumenMas', () => {
  it('sin filtros escondidos, Más no está activo', () => {
    expect(resumenMas(base)).toEqual({ activo: false, etiqueta: 'Más' })
  })

  it('Bajo y Sin stock tienen su chip: no activan Más', () => {
    expect(resumenMas({ ...base, estadoActivo: 'low', filtrosHojaTotal: 1 }).activo).toBe(false)
    expect(resumenMas({ ...base, estadoActivo: 'out', filtrosHojaTotal: 1 }).activo).toBe(false)
  })

  it('Disponibles y Común sin stock viven en Más y lo activan con su nombre', () => {
    expect(resumenMas({ ...base, estadoActivo: 'ok', filtrosHojaTotal: 1 })).toEqual({ activo: true, etiqueta: 'Más: Disponibles' })
    expect(resumenMas({ ...base, estadoActivo: 'comunSinStock', filtrosHojaTotal: 2 })).toEqual({ activo: true, etiqueta: 'Más: Común sin stock' })
  })

  it('favoritos, equipo, fotos y galería activan Más', () => {
    expect(resumenMas({ ...base, favOnly: true }).etiqueta).toBe('Más: Favoritos')
    expect(resumenMas({ ...base, favEquipo: true }).etiqueta).toBe('Más: Favoritos del equipo')
    expect(resumenMas({ ...base, faceta: true }).etiqueta).toBe('Más: Equipo')
    expect(resumenMas({ ...base, conFotos: true }).etiqueta).toBe('Más: Con fotos')
    expect(resumenMas({ ...base, galeria: true }).etiqueta).toBe('Más: Galería')
  })

  it('un filtro de la hoja Filtros (clase, tipo, lista, despiece) activa Más', () => {
    expect(resumenMas({ ...base, filtrosHojaTotal: 1 })).toEqual({ activo: true, etiqueta: 'Más: Filtros' })
  })

  it('con varios dice el primero y cuántos más', () => {
    expect(resumenMas({ ...base, favOnly: true, conFotos: true, galeria: true }).etiqueta).toBe('Más: Favoritos y 2 más')
  })

  it('el filtro de stock no se cuenta dos veces en Filtros', () => {
    expect(filtrosHojaRestantes(1, 'low')).toBe(0)
    expect(filtrosHojaRestantes(2, 'comunSinStock')).toBe(0)
    expect(filtrosHojaRestantes(2, 'low')).toBe(1)
    // Stock «sin configurar» no tiene chip: queda como filtro de la hoja.
    expect(filtrosHojaRestantes(1, null)).toBe(1)
  })
})
