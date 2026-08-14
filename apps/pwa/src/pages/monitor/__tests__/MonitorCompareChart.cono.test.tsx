/**
 * El cono de proyección dibujado sobre el comparador.
 *
 * No se pudo ver en pantalla el día que se construyó (hacía falta un turno en
 * curso con muestra suficiente), así que lo que garantiza que el dibujo existe
 * y que se apaga cuando no corresponde es este test.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MonitorCompareChart } from '../MonitorCompareChart'
import type { CompareResult } from '@/services/shoplogix/monitorCompare'
import type { ConePoint } from '@/services/shoplogix/monitorForecast'

afterEach(cleanup)

const curva = (pares: Array<[number, number]>) => pares.map(([minutes, pieces]) => ({ minutes, pieces }))

const CMP: CompareResult = {
  days: [
    {
      label: 'Hoy', dateKey: '2026-08-13', shiftId: 'Turno Dia', esHoy: true,
      curve: curva([[60, 600], [180, 1720], [300, 2945]]),
      totalPieces: 2945, atCurrentMinute: 2945,
    },
    {
      label: 'mar 11', dateKey: '2026-08-11', shiftId: 'Turno Dia', esHoy: false,
      curve: curva([[60, 500], [180, 1500], [300, 2074], [470, 3275]]),
      totalPieces: 3275, atCurrentMinute: 2074,
    },
  ],
  currentMinute: 300,
  optimal: curva([[0, 0], [470, 5000]]),
  optimalAtCurrentMinute: 3191,
  maxMinutes: 300,
  breaks: [],
  targetPieces: 5000,
}

const CONO: ConePoint[] = [
  { minutes: 300, low: 2945, mid: 2945, high: 2945 },
  { minutes: 390, low: 3400, mid: 3600, high: 3900 },
  { minutes: 470, low: 3973, mid: 4257, high: 4650 },
]

const pintar = (cone: ConePoint[] | null) =>
  render(<MonitorCompareChart cmp={CMP} cerrado={false} claveSel="cuota" onSel={() => {}} cone={cone} />)

describe('MonitorCompareChart · cono de proyección', () => {
  it('dibuja la banda y su mediana punteada cuando hay pronóstico', () => {
    const { container } = pintar(CONO)
    // La banda: un path relleno y semitransparente (no una curva de trazo).
    const banda = [...container.querySelectorAll('path')]
      .filter((p) => p.getAttribute('fill') !== 'none' && p.getAttribute('opacity') === '0.16')
    expect(banda.length).toBe(1)
    // Y la mediana, punteada como corresponde a una proyección.
    const mediana = [...container.querySelectorAll('path')]
      .filter((p) => p.getAttribute('stroke-dasharray') === '4 3' && p.getAttribute('fill') === 'none')
    expect(mediana.length).toBeGreaterThanOrEqual(1)
  })

  it('lo explica en la leyenda — una mancha sin nombre no se interpreta', () => {
    expect(pintar(CONO).container.textContent).toContain('dónde terminaron los turnos anteriores')
  })

  it('sin pronóstico no dibuja nada de eso', () => {
    const { container } = pintar(null)
    const banda = [...container.querySelectorAll('path')]
      .filter((p) => p.getAttribute('opacity') === '0.16')
    expect(banda.length).toBe(0)
    expect(container.textContent).not.toContain('dónde terminaron los turnos anteriores')
  })

  it('estira el eje para que la punta del cono no quede cortada', () => {
    // Con el cono llegando a 470 y la curva de hoy a 300, el ancho del área
    // tiene que dar para los 470: si el eje se quedara en 300, la proyección
    // se dibujaría fuera del gráfico.
    const conCono = pintar(CONO).container.querySelector('svg[aria-label*="acumuladas"]')
    expect(conCono).toBeTruthy()
    const puntos = [...conCono!.querySelectorAll('path')]
      .flatMap((p) => (p.getAttribute('d') ?? '').match(/[\d.]+,/g) ?? [])
      .map((s) => parseFloat(s))
    // Ningún punto se sale del viewBox (0-100).
    expect(Math.max(...puntos)).toBeLessThanOrEqual(100)
  })
})
