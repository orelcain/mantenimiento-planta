import { describe, it, expect } from 'vitest'
import { agruparPorCodigo, mejorDescripcion, UMBRAL_COMUN } from '../agruparPiezas'
import type { PiezaCatalogo } from '../catalogosFabricante'

/**
 * Buscar la arandela `31800105` devolvía 159 filas idénticas y el tope de 100
 * resultados se las comía todas, escondiendo el resto de la búsqueda. Los datos
 * de estos casos son los reales del catálogo de la BAADER 200.
 */
const pieza = (p: Partial<PiezaCatalogo>): PiezaCatalogo => ({
  codigo: '31800105',
  descripcion: 'Arandela',
  descripcionEn: 'Washer',
  especificacion: '',
  cantidad: '',
  posicion: '35',
  conjunto: '2000200000 Frame Soporte',
  pagina: 17,
  fuente: '549_BAADER 200.pdf',
  maquina: 'BAADER 200',
  equipoNodeIds: [],
  equipoCodigos: [],
  equipoNombre: '',
  ...p,
} as PiezaCatalogo)

describe('agruparPorCodigo', () => {
  it('junta las apariciones del mismo código en una sola pieza', () => {
    const filas = Array.from({ length: 159 }, (_, i) => pieza({ pagina: 17 + i }))
    const g = agruparPorCodigo(filas)
    expect(g).toHaveLength(1)
    expect(g[0]?.apariciones).toHaveLength(159)
  })

  it('NO funde el mismo código de dos máquinas distintas', () => {
    // 220 códigos existen en la evisceradora y en la fileteadora: fundirlos
    // mostraría una pieza que dice pertenecer a dos máquinas a la vez.
    const g = agruparPorCodigo([pieza({}), pieza({ maquina: 'BAADER 142' })])
    expect(g).toHaveLength(2)
    expect(g.map((x) => x.rep.maquina).sort()).toEqual(['BAADER 142', 'BAADER 200'])
  })

  it('marca como común la ferretería que va en toda la máquina', () => {
    const muchas = Array.from({ length: UMBRAL_COMUN + 1 }, (_, i) => pieza({ pagina: i }))
    const pocas = Array.from({ length: 3 }, (_, i) => pieza({ pagina: i }))
    expect(agruparPorCodigo(muchas)[0]?.esComun).toBe(true)
    expect(agruparPorCodigo(pocas)[0]?.esComun).toBe(false)
  })

  it('conserva el orden de llegada (el score de la búsqueda manda)', () => {
    const g = agruparPorCodigo([pieza({ codigo: 'B' }), pieza({ codigo: 'A' })])
    expect(g.map((x) => x.rep.codigo)).toEqual(['B', 'A'])
  })
})

describe('mejorDescripcion', () => {
  it('descarta la medida suelta que quedó como nombre', () => {
    // Real: 30 de las 159 filas de 31800105 traen "10,5" — el diámetro en la
    // columna equivocada. Si gana esa, la pieza se llama "10,5" en la lista.
    const medida = pieza({ descripcion: '10,5', posicion: '', conjunto: '2000200000 Frame Soporte' })
    const buena = pieza({ descripcion: 'Arandela' })
    expect(mejorDescripcion([medida, buena]).descripcion).toBe('Arandela')
  })

  it('prefiere la fila que viene de una figura sobre la del índice de desgaste', () => {
    // El índice de piezas de desgaste trae francés sin traducir y no tiene ni
    // posición ni conjunto numérico.
    const desgaste = pieza({ descripcion: '(couteau de ventre/dos)', posicion: '', conjunto: 'Piezas de desgaste' })
    const figura = pieza({ descripcion: 'Cuchilla circular', posicion: '', conjunto: '2004143000 adicionales cuchillas' })
    expect(mejorDescripcion([desgaste, figura]).descripcion).toBe('Cuchilla circular')
  })

  it('vale la posición aunque el conjunto no tenga código', () => {
    const sinCodigo = pieza({ descripcion: 'Chapa de guia para aletas', posicion: '5', conjunto: 'Alineador para aletas 1' })
    const desgaste = pieza({ descripcion: 'Redresseur des nageoires 1', posicion: '', conjunto: 'Piezas de desgaste' })
    expect(mejorDescripcion([desgaste, sinCodigo]).descripcion).toBe('Chapa de guia para aletas')
  })

  it('si ninguna es mejor se queda con la primera', () => {
    const a = pieza({ descripcion: 'Arandela', pagina: 1 })
    const b = pieza({ descripcion: 'Arandela', pagina: 2 })
    expect(mejorDescripcion([a, b]).pagina).toBe(1)
  })
})
