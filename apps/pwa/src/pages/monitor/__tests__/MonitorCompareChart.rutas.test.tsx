/**
 * Las curvas del comparador son rutas SVG armadas como texto.
 *
 * El 16-09-2026 las coordenadas pasaron por el formateador es-CL (`dec2`) y
 * «M12.50,30.20» quedó «M12,50,30,20»: el navegador leyó CUATRO números donde
 * había dos y cada línea cruzó el gráfico de lado a lado. Este test fija que
 * cada comando lleva exactamente un par x,y con punto decimal.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { MonitorCompareChart } from '../MonitorCompareChart'
import type { CompareResult } from '@/services/shoplogix/monitorCompare'

afterEach(cleanup)

const curva = (pares: Array<[number, number]>) => pares.map(([minutes, pieces]) => ({ minutes, pieces }))

// Minutos y piezas que NO caen en enteros al escalarse: así aparecen decimales.
const CMP: CompareResult = {
  days: [
    {
      label: 'Hoy', dateKey: '2026-09-16', shiftId: 'Turno 1', esHoy: true,
      curve: curva([[7, 113], [61, 1234], [187, 3217], [301, 5109]]),
      totalPieces: 5109, atCurrentMinute: 5109,
    },
    {
      label: 'mar 15', dateKey: '2026-09-15', shiftId: 'Turno 1', esHoy: false,
      curve: curva([[13, 251], [97, 2203], [229, 6991], [463, 10278]]),
      totalPieces: 10278, atCurrentMinute: 6991,
    },
  ],
  currentMinute: 301,
  optimal: curva([[0, 0], [463, 15000]]),
  optimalAtCurrentMinute: 9752,
  maxMinutes: 463,
  breaks: [],
  targetPieces: 15000,
}

/** Separa una ruta en comandos y devuelve los que no traen un par x,y válido. */
function comandosRotos(d: string): string[] {
  return (d.match(/[ML][^ML]*/g) ?? [])
    .map((c) => c.trim())
    .filter((c) => !/^[ML]-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(c))
}

describe('MonitorCompareChart · rutas SVG', () => {
  it('cada punto de cada curva es exactamente un par x,y con punto decimal', () => {
    const { container } = render(
      <MonitorCompareChart cmp={CMP} cerrado={false} claveSel="cuota" onSel={() => {}} cone={null} />,
    )
    const curvas = [...container.querySelectorAll('path')]
      .map((p) => p.getAttribute('d') ?? '')
      .filter((d) => /^M[\d.]+,[\d.]+L/.test(d) || /^M\d/.test(d))
    expect(curvas.length).toBeGreaterThan(0)
    for (const d of curvas) {
      if (!/^M-?\d/.test(d) || /[AZQC]/.test(d)) continue // solo las polilíneas M/L
      expect(comandosRotos(d)).toEqual([])
    }
  })

  it('ninguna coordenada usa coma decimal', () => {
    const { container } = render(
      <MonitorCompareChart cmp={CMP} cerrado={false} claveSel="cuota" onSel={() => {}} cone={null} />,
    )
    for (const p of container.querySelectorAll('path')) {
      const d = p.getAttribute('d') ?? ''
      // «12,50,30,20»: tres comas seguidas entre dígitos delatan decimales con coma.
      expect(d).not.toMatch(/\d+,\d+,\d+,\d+/)
    }
  })
})
