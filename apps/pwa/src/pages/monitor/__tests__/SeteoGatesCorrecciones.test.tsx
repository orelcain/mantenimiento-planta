/**
 * Correcciones del recorrido del 22-11 en «Seteo de las gates»: una gate con una sola etiqueta y la sugerencia (en
 * prueba) solo para admin.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { tramosDeGate, seteoGatesVivo } from '@/services/grader/espejo/seteoGatesVivo'
import type { PiezaEspejo } from '@/services/grader/espejo/espejoFilas'
import type { CalibreRange } from '@/services/grader/types'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { SalidaPorCalibre } from '../SalidaPorCalibre'

afterEach(cleanup)

const T0 = Date.parse('2026-11-21T07:15:00.000Z')
let seg = 0
function pieza(gate: number, calibre: string, calidad: string): PiezaEspejo {
  const ts = new Date(T0 + seg++ * 20_000).toISOString()
  return {
    cadena: `${ts}#${gate}`, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: 4.5, cantidad: 1, lote: 'L',
    gate, calidad, conservacion: 'FRESCO', calibre: calibre as CalibreRange, producto: 'P', turnoMatrix: '',
  }
}
const serie = (n: number, cal: string, q: string) => Array.from({ length: n }, () => pieza(10, cal, q))

describe('G10 del 21-11 T2: un paso suelto no deja dos rótulos', () => {
  it('3 piezas «12-UP Premium» y después «8-10 CALIDAD D»: el candidato es CALIDAD D, no 12-UP', () => {
    seg = 0
    const ps = [...serie(150, '8-10 lb', 'Premium'), ...serie(3, '12-UP lb', 'Premium'), ...serie(60, '8-10 lb', 'CALIDAD D')]
    const t = tramosDeGate(10, ps)
    expect(t.provisional?.despues).toBe('8-10 lb · CALIDAD D')
    expect(t.cambios.filter((c) => c.despues.startsWith('12-UP'))).toEqual([])
  })

  it('si CALIDAD D junta 100 piezas se confirma desde su primera pieza', () => {
    seg = 0
    const ps = [...serie(150, '8-10 lb', 'Premium'), ...serie(3, '12-UP lb', 'Premium'), ...serie(120, '8-10 lb', 'CALIDAD D')]
    const t = tramosDeGate(10, ps)
    expect(t.provisional).toBeNull()
    expect(t.cambios).toEqual([expect.objectContaining({ antes: '8-10 lb · Premium', despues: '8-10 lb · CALIDAD D', estado: 'confirmado', desdeTs: ps[153]!.ts })])
  })
})

describe('Salida por calibre: la sugerencia en prueba es solo para admin', () => {
  const s = seteoGatesVivo(turnoReal('2026-11-19-turno_2').piezas)!
  it('admin la ve; el público no', () => {
    expect(s.sugerencia).not.toBeNull()
    render(<SalidaPorCalibre s={s} />)
    expect(screen.getByTestId('sugerencia-gates')).toBeTruthy()
    cleanup()
    const { container } = render(<SalidaPorCalibre s={s} publico />)
    expect(screen.queryByTestId('sugerencia-gates')).toBeNull()
    expect(container.textContent).not.toMatch(/Sugerencia|en prueba/)
  })
})
