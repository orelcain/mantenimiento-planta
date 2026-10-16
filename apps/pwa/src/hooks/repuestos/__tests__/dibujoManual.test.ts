import { describe, expect, it } from 'vitest'
import { dibujoDeManual, documentacionDe, fusionarDocumentacion, rotuloDeReferencia } from '../documentacionDeRepuesto'
import type { Repuesto } from '@/types/repuestos'

describe('rotuloDeReferencia', () => {
  it('rotula las cuatro fuentes de capturas del manual', () => {
    expect(rotuloDeReferencia('Referencia despiece Baader 200 pág. 178 - Fig. 22-1 pos. 55 (519437)')).toBe('fig. 22-1 · pos. 55')
    expect(rotuloDeReferencia('Referencia despiece Baader 142 pág. 177 - Fig. 65 pos. 3 (33450810)')).toBe('fig. 65 · pos. 3')
    expect(rotuloDeReferencia('Referencia GEA PowerPak 5550 · catálogo mecánico pág. 102 - pos. 50 (PV3000309685)')).toBe('pág. 102 · pos. 50')
    expect(rotuloDeReferencia('Referencia Marel filete · libro de repuestos 8009254 pág. 8 - dibujo 3519267 pos. 7 (40000)')).toBe('dibujo 3519267 · pos. 7')
    expect(rotuloDeReferencia('Referencia manual Knuro KF 3.01 pág. 120 - 999 0608 (vista general)')).toBe('pág. 120')
  })

  it('no toma por dibujo una foto cualquiera', () => {
    expect(rotuloDeReferencia('Foto de bodega')).toBeNull()
    expect(rotuloDeReferencia('')).toBeNull()
    expect(rotuloDeReferencia(undefined)).toBeNull()
    expect(rotuloDeReferencia('Referencia sin ubicación')).toBeNull()
  })
})

describe('dibujoDeManual', () => {
  const dibujos = [
    { url: 'a142', rotulo: 'fig. 1 · pos. 2', equipos: ['b142'] },
    { url: 'a200', rotulo: 'fig. 9 · pos. 4', equipos: ['b200'] },
  ]

  it('sin equipo en foco devuelve todas y el rótulo de la primera', () => {
    expect(dibujoDeManual(dibujos, null)).toEqual({ urls: ['a142', 'a200'], rotulo: 'fig. 1 · pos. 2' })
  })

  it('con equipo en foco, el dibujo de SU manual', () => {
    expect(dibujoDeManual(dibujos, ['b200'])).toEqual({ urls: ['a200'], rotulo: 'fig. 9 · pos. 4' })
  })

  it('si el foco no calza con ninguno, muestra todos', () => {
    expect(dibujoDeManual(dibujos, ['otro'])?.urls).toEqual(['a142', 'a200'])
  })

  it('sin capturas, null', () => {
    expect(dibujoDeManual(undefined, null)).toBeNull()
    expect(dibujoDeManual([], ['b142'])).toBeNull()
  })
})

describe('documentacionDe → dibujosManual', () => {
  it('solo las capturas «Referencia …» con ubicación, conservando sus equipos', () => {
    const rep = {
      imagenesManual: [
        { url: 'u1', descripcion: 'Referencia despiece Baader 142 pág. 177 - Fig. 65 pos. 3 (33450810)', equipos: ['b142'] },
        { url: 'u2', descripcion: 'foto subida a mano' },
      ],
    } as unknown as Repuesto
    expect(documentacionDe(rep).dibujosManual).toEqual([{ url: 'u1', rotulo: 'fig. 65 · pos. 3', equipos: ['b142'] }])
  })

  it('al fusionar duplicados rescata los dibujos del segundo documento', () => {
    const vacio = { fotos: [], tieneFicha: false, manuales: 0 }
    const conDibujo = { ...vacio, dibujosManual: [{ url: 'u', rotulo: 'pág. 1' }] }
    expect(fusionarDocumentacion(vacio, conDibujo).dibujosManual).toEqual([{ url: 'u', rotulo: 'pág. 1' }])
  })
})
