/**
 * Cobertura del Excel sobre el turno.
 *
 * Lo que se prueba es la distinción que motivó el componente: un tramo vacío
 * DENTRO del rango del Excel es línea parada (dato completo), y fuera del rango
 * es Excel sin cargar (falta trabajo). Confundirlas lleva a conclusiones
 * opuestas.
 *
 * Caso real: turno 1 del 31-jul-2026, 21:30 → 05:45, con Excel desde 01:34.
 *
 * Se asierta sobre `container.textContent` y no con `getByText` porque los
 * números viven partidos entre varios nodos (`<b>12%</b> del turno`).
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GraderCoverageBar } from '../GraderCoverageBar'
import type { TimelineBucket } from '@/services/grader/types'

const bucket = (tsMin: string): TimelineBucket =>
  ({ tsMin, pieces: 10, p0Pieces: 0 } as TimelineBucket)

/** `cuantos` minutos consecutivos con piezas, desde una hora dada. */
function minutos(desdeIso: string, cuantos: number): TimelineBucket[] {
  const t0 = Date.parse(desdeIso)
  return Array.from({ length: cuantos }, (_, i) =>
    bucket(new Date(t0 + i * 60_000).toISOString().slice(0, 16)))
}

/** Turno 1 de Planta Principal: 21:30 → 05:45 = 495 min. */
const TURNO = { inicio: '2026-07-31T21:30:00.000Z', fin: '2026-08-01T05:45:00.000Z' }

const texto = (buckets: TimelineBucket[], turno = TURNO) =>
  render(
    <GraderCoverageBar shiftStartAt={turno.inicio} shiftEndAt={turno.fin} buckets={buckets} />,
  ).container.textContent ?? ''

describe('GraderCoverageBar', () => {
  it('sin ventana de turno no renderiza nada', () => {
    const { container } = render(
      <GraderCoverageBar shiftStartAt={null} shiftEndAt={null} buckets={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('informa el rango del Excel y el % del turno cubierto', () => {
    // 60 min de datos sobre un turno de 495 → 12%
    const t = texto(minutos('2026-08-01T01:34:00.000Z', 60))
    expect(t).toContain('01:34–02:34')
    expect(t).toContain('12%')
  })

  it('avisa cuánto turno quedó sin Excel', () => {
    const t = texto(minutos('2026-08-01T01:34:00.000Z', 60))
    expect(t).toContain('7 h 15 min')          // 495 − 60
    expect(t).toContain('todavía no está contada')
  })

  it('un hueco DENTRO del rango es línea parada, no dato faltante', () => {
    // 10 min con piezas · 20 sin · 10 con → el Excel cubre los 40.
    const t = texto([
      ...minutos('2026-08-01T01:00:00.000Z', 10),
      ...minutos('2026-08-01T01:30:00.000Z', 10),
    ])
    expect(t).toContain('01:00–01:40')
    expect(t).toContain('20 min con piezas')
    // 495 − 40 = 455. Si el hueco contara como dato faltante daría 7 h 55 min.
    expect(t).toContain('7 h 35 min')
    expect(t).not.toContain('7 h 55 min')
  })

  it('turno completamente cubierto no muestra el aviso', () => {
    const t = texto(minutos(TURNO.inicio, 495))
    expect(t).toContain('100%')
    expect(t).not.toContain('todavía no está contada')
  })

  it('ignora registros fuera de la ventana del turno', () => {
    // Un Excel mensual trae piezas de otros días: no deben ensanchar el rango.
    const t = texto([
      ...minutos('2026-07-30T10:00:00.000Z', 30),   // día anterior
      ...minutos('2026-08-01T01:34:00.000Z', 60),   // este turno
    ])
    expect(t).toContain('01:34–02:34')
    expect(t).toContain('12%')
  })

  it('sin registros en el turno lo dice, en vez de mostrar 0% a secas', () => {
    expect(texto([])).toContain('sin registros en el turno')
  })
})
