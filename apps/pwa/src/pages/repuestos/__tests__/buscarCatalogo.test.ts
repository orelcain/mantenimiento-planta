import { describe, it, expect } from 'vitest'
import { buscarPiezas, variantesDe } from '../buscarCatalogo'
import type { PiezaCatalogo } from '../catalogosFabricante'

/**
 * Casos medidos sobre los catálogos reales publicados (16.280 filas):
 *  - "arandelas" en plural daba 0 resultados con 114 arandelas indexadas.
 *    Lo mismo con tornillos (443 en singular), tuercas (105), pernos (90),
 *    cadenas (87), resortes (55), correas (42), mangueras (37).
 *  - "SW06" es un código real de la ENZUNCHADORA TP-6000 con 18 filas, y la
 *    vista contestaba "Sin resultados": tiene 2 dígitos y el camino por código
 *    exige 4, así que caía en el camino por palabras, que no miraba el código.
 *    Son 74 códigos así (189 filas) en ese catálogo.
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

const arandela = pieza({})
const tornillo = pieza({ codigo: '31000110', descripcion: 'Tornillo hexagonal', descripcionEn: 'Screw' })
const sw06 = pieza({
  codigo: 'SW06',
  descripcion: 'Spring Washer',
  descripcionEn: 'Spring Washer',
  conjunto: 'Strapping Head Unit',
  maquina: 'ENZUNCHADORA TP-6000',
})
const catalogo = [arandela, tornillo, sw06]

describe('buscarPiezas · plural', () => {
  it('"arandelas" encuentra la arandela (antes: 0 resultados)', () => {
    expect(buscarPiezas(catalogo, 'arandelas').map((p) => p.codigo)).toContain('31800105')
  })

  it('"tornillos" encuentra el tornillo', () => {
    expect(buscarPiezas(catalogo, 'tornillos').map((p) => p.codigo)).toContain('31000110')
  })

  it('el singular sigue funcionando', () => {
    expect(buscarPiezas(catalogo, 'arandela')).toHaveLength(1)
  })
})

describe('buscarPiezas · vocabulario de planta', () => {
  it('"golilla" encuentra la arandela', () => {
    expect(buscarPiezas(catalogo, 'golilla').map((p) => p.codigo)).toContain('31800105')
  })

  it('"golillas" (plural + chilenismo a la vez) también', () => {
    expect(buscarPiezas(catalogo, 'golillas').map((p) => p.codigo)).toContain('31800105')
  })

  it('variantesDe combina singular y término del fabricante', () => {
    expect(variantesDe('golillas')).toContain('ARANDELA')
  })
})

describe('buscarPiezas · códigos cortos', () => {
  it('"SW06" encuentra su pieza (antes: "Sin resultados")', () => {
    expect(buscarPiezas(catalogo, 'SW06').map((p) => p.codigo)).toEqual(['SW06'])
  })

  it('en minúscula también', () => {
    expect(buscarPiezas(catalogo, 'sw06').map((p) => p.codigo)).toEqual(['SW06'])
  })

  it('un término de 2 letras NO arrastra el código entero', () => {
    // "sw" solo no debe traer SW06: el prefijo por código pide 3 caracteres.
    expect(buscarPiezas(catalogo, 'sw arandela').map((p) => p.codigo)).toEqual([])
  })
})

describe('buscarPiezas · código numérico (no romper lo que ya andaba)', () => {
  it('código exacto', () => {
    expect(buscarPiezas(catalogo, '31800105').map((p) => p.codigo)).toEqual(['31800105'])
  })

  it('código con prefijo de marca grabado en la pieza', () => {
    expect(buscarPiezas(catalogo, 'GEA 31800105').map((p) => p.codigo)).toEqual(['31800105'])
  })

  it('menos de 3 caracteres no busca nada', () => {
    expect(buscarPiezas(catalogo, 'ar')).toEqual([])
  })
})
