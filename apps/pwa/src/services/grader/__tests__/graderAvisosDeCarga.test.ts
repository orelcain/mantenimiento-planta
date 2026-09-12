import { describe, it, expect } from 'vitest'
import { avisoDeRango, avisosDelArchivo } from '../graderAvisosDeCarga'

/** Rangos medidos con los Excel reales de la temporada 2025-26. */
const JULIO = { startAt: '2025-07-01T00:46:48.000Z', endAt: '2025-07-14T23:24:05.000Z' }
const AGOSTO = { startAt: '2025-08-25T00:23:20.000Z', endAt: '2025-08-30T03:33:54.000Z' }

describe('avisoDeRango', () => {
  it('calla cuando el turno cae dentro del archivo', () => {
    expect(avisoDeRango('2025-07-01', JULIO)).toBeNull()   // primer día
    expect(avisoDeRango('2025-07-08', JULIO)).toBeNull()   // en el medio
    expect(avisoDeRango('2025-07-14', JULIO)).toBeNull()   // último día
  })

  it('avisa con el archivo del mes equivocado', () => {
    // El caso real: se carga el de agosto en una sesión de un turno de julio.
    const aviso = avisoDeRango('2025-07-08', AGOSTO)
    expect(aviso).toContain('2025-08-25')
    expect(aviso).toContain('2025-08-30')
    expect(aviso).toContain('2025-07-08')
  })

  it('avisa también por un día, no solo por meses', () => {
    expect(avisoDeRango('2025-06-30', JULIO)).not.toBeNull()
    expect(avisoDeRango('2025-07-15', JULIO)).not.toBeNull()
  })

  it('sin fechas no inventa una alarma', () => {
    expect(avisoDeRango('2025-07-08', {})).toBeNull()
    expect(avisoDeRango(null, JULIO)).toBeNull()
    expect(avisoDeRango('2025-07-08', { startAt: 'no es una fecha' })).toBeNull()
  })

  it('un archivo de un solo día se juzga contra ese día', () => {
    const unDia = { startAt: '2025-07-08T01:00:00.000Z' }   // sin endAt
    expect(avisoDeRango('2025-07-08', unDia)).toBeNull()
    expect(avisoDeRango('2025-07-09', unDia)).not.toBeNull()
  })
})

describe('avisosDelArchivo', () => {
  it('los avisos del parser se conservan — son los que nadie mostraba', () => {
    const delParser = [
      '1075 registros sin pieza ("No aplicable"): el Matrix los cuenta como registros, la app no como piezas.',
      'Se encontraron 7586 registros Gate 0 en archivo pieza-pieza.',
    ]
    expect(avisosDelArchivo(delParser, '2025-07-08', JULIO)).toEqual(delParser)
  })

  it('el de rango se suma a los del parser', () => {
    const r = avisosDelArchivo(['algo del parser'], '2025-07-08', AGOSTO)
    expect(r).toHaveLength(2)
    expect(r[0]).toBe('algo del parser')
    expect(r[1]).toContain('no está adentro')
  })

  it('sin avisos devuelve lista vacía, no null', () => {
    expect(avisosDelArchivo(undefined, '2025-07-08', JULIO)).toEqual([])
  })
})
