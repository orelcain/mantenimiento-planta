/**
 * Cobertura del Excel sobre la producción REAL.
 *
 * La referencia es lo que produjeron las Baader (Shoplogix), no el horario
 * programado del turno: el pescado va Baader → Grader, así que entre ambas
 * fuentes solo hay minutos de tránsito.
 *
 * Caso real que motivó el cambio — turno 1 del 31-jul-2026:
 *   turno programado   21:30 → 05:45
 *   primera Baader     01:19
 *   primera pieza      01:34   (15 min de tránsito)
 * Comparando contra el turno programado la app decía "faltan 4 h 37 min sin
 * Excel cargado", mandando a buscar un archivo inexistente y tapando el dato
 * real: el turno arrancó casi 4 h tarde.
 *
 * Se asierta sobre `container.textContent` porque los números viven partidos
 * entre varios nodos (`<b>44%</b> de lo producido`).
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

/** Turno 1 de Planta Principal: 21:30 → 05:45. */
const TURNO = { inicio: '2026-07-31T21:30:00.000Z', fin: '2026-08-01T05:45:00.000Z' }

const ventana = (desde: string, hasta: string) =>
  ({ start: new Date(desde), end: new Date(hasta) })

function texto(buckets: TimelineBucket[], produccionReal: { start: Date; end: Date } | null = null) {
  return render(
    <GraderCoverageBar
      shiftStartAt={TURNO.inicio}
      shiftEndAt={TURNO.fin}
      produccionReal={produccionReal}
      buckets={buckets}
    />,
  ).container.textContent ?? ''
}

describe('GraderCoverageBar — contra la producción real', () => {
  it('el turno del 31-jul queda COMPLETO: arrancó tarde, no falta Excel', () => {
    // Baader desde 01:19, Excel desde 01:34 → 15 min de tránsito.
    const t = texto(
      minutos('2026-08-01T01:34:00.000Z', 218),
      ventana('2026-08-01T01:19:00.000Z', '2026-08-01T05:12:00.000Z'),
    )
    expect(t).toContain('El Excel cubre toda la producción del turno')
    expect(t).not.toContain('no están contadas')
    expect(t).toContain('de lo producido')
  })

  it('sí avisa cuando las Baader produjeron y el Excel no lo cubre', () => {
    // Baader desde 21:30, Excel recién desde 01:34 → 4 h reales sin cargar.
    const t = texto(
      minutos('2026-08-01T01:34:00.000Z', 60),
      ventana('2026-07-31T21:30:00.000Z', '2026-08-01T02:34:00.000Z'),
    )
    expect(t).toContain('que el Excel no cubre')
    expect(t).toContain('todavía no están contadas')
  })

  it('un desfase menor al tránsito no cuenta como dato faltante', () => {
    // 10 min de diferencia al arranque: es el viaje de la pieza.
    const t = texto(
      minutos('2026-08-01T01:29:00.000Z', 60),
      ventana('2026-08-01T01:19:00.000Z', '2026-08-01T02:29:00.000Z'),
    )
    expect(t).toContain('El Excel cubre toda la producción del turno')
  })

  it('sin ventana de Shoplogix cae al turno programado, y lo dice', () => {
    const t = texto(minutos('2026-08-01T01:34:00.000Z', 60), null)
    expect(t).toContain('del turno programado')
    expect(t).not.toContain('de lo producido')
  })

  it('un hueco DENTRO del rango es línea parada, no dato faltante', () => {
    const t = texto(
      [
        ...minutos('2026-08-01T01:00:00.000Z', 10),
        ...minutos('2026-08-01T01:30:00.000Z', 10),
      ],
      ventana('2026-08-01T01:00:00.000Z', '2026-08-01T01:40:00.000Z'),
    )
    expect(t).toContain('20 min con piezas')
    expect(t).toContain('El Excel cubre toda la producción del turno')
  })

  it('sin ventana ni turno no renderiza nada', () => {
    const { container } = render(
      <GraderCoverageBar shiftStartAt={null} shiftEndAt={null} buckets={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('sin registros lo dice, en vez de mostrar 0% a secas', () => {
    expect(texto([], ventana('2026-08-01T01:19:00.000Z', '2026-08-01T05:12:00.000Z')))
      .toContain('sin registros en el turno')
  })

  it('ignora registros fuera de la ventana', () => {
    const t = texto(
      [
        ...minutos('2026-07-30T10:00:00.000Z', 30),   // otro día
        ...minutos('2026-08-01T01:34:00.000Z', 60),
      ],
      ventana('2026-08-01T01:19:00.000Z', '2026-08-01T02:34:00.000Z'),
    )
    expect(t).toContain('01:34–02:34')
    expect(t).toContain('1 h con piezas')   // los 30 min del otro día no suman
  })
})
