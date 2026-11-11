import { describe, expect, it } from 'vitest'
import { cifra, contarPorSeccion, ordenarResultados, seccionDeCadena, sumaColumna } from '../misEquiposResumen'

describe('seccionDeCadena', () => {
  it('toma dos niveles bajo la planta', () => {
    expect(seccionDeCadena(['Antarfood', 'PLANTA CHONCHI', 'PROCESO', 'EVISCERADO', 'MAREL HG'])).toBe('EVISCERADO')
  })
  it('un equipo dentro de otro conserva la sección', () => {
    expect(seccionDeCadena(['A', 'PLANTA CHONCHI', 'PROCESO', 'EVISCERADO', 'BAADER 142', 'KNURO'])).toBe('EVISCERADO')
  })
  it('el propio equipo nunca es su sección', () => {
    expect(seccionDeCadena(['A', 'PLANTA CHONCHI', 'PROCESO', 'EQUIPO'])).toBeUndefined()
    expect(seccionDeCadena(['Sin planta', 'X', 'Y'])).toBeUndefined()
  })
})

describe('contarPorSeccion', () => {
  it('ordena como la línea y deja lo desconocido al final', () => {
    const r = contarPorSeccion(['EMPAQUE', 'SACRIFICIO', 'EMPAQUE', 'BODEGA', undefined])
    expect(r).toEqual([{ nombre: 'Sacrificio', n: 1 }, { nombre: 'Empaque', n: 2 }, { nombre: 'Bodega', n: 1 }, { nombre: 'Sin sección', n: 1 }])
  })
})

describe('ordenarResultados', () => {
  it('lo ya agregado va después y cada grupo va por nombre', () => {
    const f = [{ id: 'a', nombre: 'Cinta 10' }, { id: 'b', nombre: 'Aaa' }, { id: 'c', nombre: 'Cinta 2' }]
    expect(ordenarResultados(f, new Set(['b'])).map((x) => x.id)).toEqual(['c', 'a', 'b'])
  })
})

describe('cifras', () => {
  it('distingue sin dato, cero y miles', () => {
    expect(cifra(null)).toBe('')
    expect(cifra(undefined)).toBe('')
    expect(cifra(0)).toBe('—')
    expect(cifra(4735)).toBe('4.735')
  })
  it('la suma queda en blanco si falta una fila', () => {
    expect(sumaColumna([1, 2])).toBe(3)
    expect(sumaColumna([1, null])).toBeNull()
  })
})
