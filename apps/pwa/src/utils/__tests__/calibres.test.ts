/**
 * El orden físico de los calibres.
 *
 * ⚠ Lo que se protege: "10-12 lb" iba ANTES que "2-4 lb" en dos gráficos
 * (Pivote de Punto Cero y el timeline del Grader) porque `.sort()` compara
 * texto. El calibre es una escala ordinal y el eje tiene que respetarla.
 */
import { describe, it, expect } from 'vitest'
import { compararCalibres } from '../calibres'

describe('compararCalibres', () => {
  it('⚠ el bug que motivó todo: 2-4 antes que 10-12', () => {
    const calibres = ['10-12 lb', '2-4 lb', '4-6 lb', '12-14 lb', '6-8 lb', '8-10 lb']
    expect([...calibres].sort(compararCalibres)).toEqual([
      '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb', '12-14 lb',
    ])
  })

  it('decimales y formatos mixtos', () => {
    expect(['3.5-4 lb', '2-4 lb', '10 lb+'].sort(compararCalibres))
      .toEqual(['2-4 lb', '3.5-4 lb', '10 lb+'])
  })

  it('sin número van al final, en alfabeto — orden estable', () => {
    expect(['SIN CALIBRE', '2-4 lb', 'N/A'].sort(compararCalibres))
      .toEqual(['2-4 lb', 'N/A', 'SIN CALIBRE'])
  })

  it('empates numéricos desempatan por alfabeto', () => {
    expect(['4-6 lb B', '4-6 lb A'].sort(compararCalibres))
      .toEqual(['4-6 lb A', '4-6 lb B'])
  })
})
