import { describe, expect, it } from 'vitest'
import { dibujoDe, maquinaDeDespiece, rutaDibujo, type EnDespiece } from '../enlacesPieza'

// 512247 = Riel de guía de la BAADER 200 (fig. 3-3); el código ficticio 999 va en las dos.
const FIG: Record<string, EnDespiece[]> = {
  '512247': [{ hoja: 39, fig: '3-3', slug: 'baader-200-despiece', maquina: 'BAADER 200' }],
  '999': [
    { hoja: 5, fig: '1-1', slug: 'baader-142-despiece', maquina: 'BAADER 142' },
    { hoja: 7, fig: '2-2', slug: 'baader-200-despiece', maquina: 'BAADER 200' },
  ],
}

describe('dibujo de una pieza', () => {
  it('da la ruta del visor y la figura', () => {
    expect(dibujoDe(FIG, ' 512247 ')).toEqual({ ruta: '/aprendizaje/planos/baader-200-despiece?hoja=39&ap=512247', fig: '3-3' })
    expect(rutaDibujo(FIG, '512247')).toBe('/aprendizaje/planos/baader-200-despiece?hoja=39&ap=512247')
  })
  it('sin código, sin mapa o fuera del despiece: nada', () => {
    expect(dibujoDe(FIG, '')).toBeNull()
    expect(dibujoDe(FIG, undefined)).toBeNull()
    expect(dibujoDe(null, '512247')).toBeNull()
    expect(dibujoDe(FIG, '2000400006')).toBeNull()
  })
  it('si va en las dos máquinas, elige la del equipo', () => {
    expect(dibujoDe(FIG, '999', maquinaDeDespiece('BAADER 200'))?.fig).toBe('2-2')
    expect(dibujoDe(FIG, '999', maquinaDeDespiece('EVISCERADORA BAADER 142 N1'))?.fig).toBe('1-1')
  })
  it('máquina del despiece según el nombre del equipo', () => {
    expect(maquinaDeDespiece('BAADER 200')).toBe('BAADER 200')
    expect(maquinaDeDespiece('EVISCERADORA BAADER 142 N2')).toBe('BAADER 142')
    expect(maquinaDeDespiece('CINTA PIMPONEO')).toBeUndefined()
    expect(maquinaDeDespiece(undefined)).toBeUndefined()
  })
})
