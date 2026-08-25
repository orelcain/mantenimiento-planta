/**
 * La planilla cargada llega al 08/06/2026. Como hoy (25/08) no está, el
 * calendario abría en la **primera** semana del archivo —la del 01/03, seis
 * meses atrás— y había que apretar "›" catorce veces para llegar a lo último
 * cargado.
 */
import { describe, it, expect } from 'vitest'
import { semanaDeApertura } from '../semanaDeApertura'

// Un pedazo real: de la semana 09 (01/03) a la 24 (08/06).
const SEMANAS = Array.from({ length: 16 }, (_, i) => `2026-W${String(9 + i).padStart(2, '0')}`)

describe('semanaDeApertura', () => {
  it('si la planilla cubre hoy, abre en hoy', () => {
    expect(semanaDeApertura(SEMANAS, '2026-W15')).toBe('2026-W15')
  })

  it('el caso real: hoy es la W35 y la planilla termina en la W24', () => {
    expect(semanaDeApertura(SEMANAS, '2026-W35')).toBe('2026-W24')
  })

  it('si la planilla arranca en el futuro, abre en su primera semana', () => {
    expect(semanaDeApertura(['2026-W40', '2026-W41'], '2026-W35')).toBe('2026-W40')
  })

  it('sin semanas cargadas no inventa ninguna', () => {
    expect(semanaDeApertura([], '2026-W35')).toBeNull()
  })

  it('no depende del orden en que vengan las claves', () => {
    const desordenadas = ['2026-W24', '2026-W09', '2026-W17']
    expect(semanaDeApertura(desordenadas, '2026-W35')).toBe('2026-W24')
  })

  it('cruza el año sin equivocarse', () => {
    expect(semanaDeApertura(['2025-W50', '2026-W02'], '2026-W35')).toBe('2026-W02')
  })
})
