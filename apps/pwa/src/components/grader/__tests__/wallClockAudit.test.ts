/**
 * Auditoría de la convención wall-clock en el eje del timeline.
 *
 * El módulo mezcla DOS formatos de timestamp:
 *   - ISO completo con sufijo Z  →  "2026-08-01T01:34:00.000Z"   (summary, shiftWindow)
 *   - `ts.slice(0, 16)` sin zona →  "2026-08-01T01:34"           (TimelineBucket.tsMin)
 *
 * `Date.parse` de una fecha-hora SIN offset la interpreta como hora LOCAL. En
 * Chile (UTC-4) eso corre 4 horas. Mientras una función parsea un solo formato
 * el error se cancela solo; el bug aparece cuando MEZCLA los dos en el mismo
 * cálculo — que es lo que hace `resolveAxisWindow`.
 *
 * Este test usa el turno real del 31-jul-2026 (21:30–05:45, primera pieza
 * 01:34) y fija el comportamiento correcto: las etiquetas del eje tienen que
 * ser la hora de planta, no la del navegador.
 */
import { describe, it, expect } from 'vitest'
import { resolveAxisWindow } from '../shiftTimelineHelpers'
import { parseWallClockMs } from '@/services/grader/graderTimeFormat'
import type { TimelineBucket } from '@/services/grader/types'
import type { ShiftTimeWindow } from '@/services/grader/graderShiftStatus'

const bucket = (tsMin: string, pieces = 10): TimelineBucket =>
  ({ tsMin, pieces, p0Pieces: 0 } as TimelineBucket)

const VENTANA: ShiftTimeWindow = {
  status: 'closed',
  startAt: '2026-07-31T21:30:00.000Z',
  endAt: '2026-08-01T05:45:00.000Z',
  progressPct: null,
  elapsedMin: 495,
  remainingMin: null,
}

describe('resolveAxisWindow — hora de planta, no del navegador', () => {
  it('el eje arranca en la hora del primer bucket, no corrida por la TZ', () => {
    const buckets = [bucket('2026-08-01T01:34'), bucket('2026-08-01T05:12')]
    const eje = resolveAxisWindow(buckets, VENTANA, 2)
    // Con padding de 2 min: 01:32. Si se leyera como hora local daría 05:32.
    expect(eje.lineTimes[0]).toBe('01:32')
    expect(eje.lineTimes[eje.lineTimes.length - 1]).toBe('05:14')
  })

  it('sin buckets cae a la ventana del turno, y esa SÍ estaba bien', () => {
    const eje = resolveAxisWindow([], VENTANA, 2)
    expect(eje.lineTimes[0]).toBe('21:30')
    expect(eje.lineTimes[eje.lineTimes.length - 1]).toBe('05:45')
  })

  it('las dos ramas son coherentes entre sí', () => {
    // Un bucket EXACTAMENTE en el inicio del turno tiene que dar la misma
    // etiqueta que la rama sin buckets. Con el bug daban 4 h de diferencia.
    const conBucket = resolveAxisWindow([bucket('2026-07-31T21:30')], VENTANA, 0)
    const sinBucket = resolveAxisWindow([], VENTANA, 0)
    expect(conBucket.lineTimes[0]).toBe(sinBucket.lineTimes[0])
  })

  it('outerBounds (Shoplogix) se compara en la misma escala que los buckets', () => {
    // outerBounds viene de Dates reales de Shoplogix: epoch del wall-clock.
    // Si los buckets se parsean local, el Math.min/max compara peras con
    // manzanas y el eje se estira 4 h de más.
    const buckets = [bucket('2026-08-01T01:34'), bucket('2026-08-01T05:12')]
    const eje = resolveAxisWindow(buckets, VENTANA, 2, {
      startMs: Date.parse('2026-08-01T01:19:00.000Z'),
      endMs: Date.parse('2026-08-01T05:20:00.000Z'),
    })
    expect(eje.lineTimes[0]).toBe('01:19')
    expect(eje.lineTimes[eje.lineTimes.length - 1]).toBe('05:20')
  })
})

describe('parseWallClockMs cubre los dos formatos del módulo', () => {
  it('el mismo instante escrito de las dos formas da el mismo ms', () => {
    // Es la comparación que rompía: buckets sin Z contra ventanas con Z.
    expect(parseWallClockMs('2026-08-01T01:34'))
      .toBe(parseWallClockMs('2026-08-01T01:34:00.000Z'))
  })

  it('la hora leída es la de planta, no la del navegador', () => {
    // Sin el helper, new Date('…T01:34') en Chile daba getUTCHours() = 5.
    // Ese era el bug del agrupado por hora del timeline.
    expect(new Date(parseWallClockMs('2026-08-01T01:34')).getUTCHours()).toBe(1)
    expect(new Date(parseWallClockMs('2026-08-01T23:05')).getUTCHours()).toBe(23)
  })

  it('no cambia el día al leer horas de madrugada', () => {
    // Con parse local, un bucket de las 00:30 saltaba al día siguiente.
    const d = new Date(parseWallClockMs('2026-08-01T00:30'))
    expect(d.toISOString().slice(0, 10)).toBe('2026-08-01')
  })
})
