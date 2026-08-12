/**
 * monitorPace — el ritmo que hace falta para llegar a la cuota.
 *
 * La pregunta de Orel: a mitad de turno, ¿se puede compensar? Para que la
 * respuesta sirva tiene que ser honesta en los dos sentidos: decir cuánto hay
 * que acelerar cuando alcanza, y decir que NO se llega cuando no alcanza.
 */
import { describe, it, expect } from 'vitest'
import { computePaceToTarget, lineMaxPerHour } from '../monitorPace'

const INICIO = Date.parse('2026-08-12T07:15:00Z')
const CIERRE = Date.parse('2026-08-12T15:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

/** Turno de Chonchi: 07:15–15:00, meta 20.000 pz. */
function base(over: Partial<Parameters<typeof computePaceToTarget>[0]> = {}) {
  return computePaceToTarget({
    targetPieces: 20_000,
    producedPieces: 5_453,
    scheduledEnd: iso(CIERRE),
    nowWallMs: Date.parse('2026-08-12T11:00:00Z'),
    currentPerHour: 1_449,
    maxPerHour: 2_768,
    ...over,
  })
}

describe('computePaceToTarget', () => {
  it('calcula cuánto falta y en cuánto tiempo', () => {
    const p = base()!
    expect(p.remainingPieces).toBe(20_000 - 5_453)
    expect(p.remainingMin).toBe(4 * 60) // 11:00 → 15:00
  })

  it('da el ritmo requerido en pz/h y pz/min', () => {
    const p = base()!
    // 14.547 piezas en 240 min = 3.636,75 pz/h
    expect(p.requiredPerHour).toBeCloseTo((14_547 / 240) * 60, 2)
    expect(p.requiredPerMinute).toBeCloseTo(p.requiredPerHour / 60, 6)
  })

  it('dice cuánto hay que ACELERAR sobre el ritmo actual', () => {
    const p = base()!
    expect(p.gapPerHour).toBeCloseTo(p.requiredPerHour - 1_449, 4)
    expect(p.gapPerHour).toBeGreaterThan(0)
  })

  it('AVISA cuando la cuota no se alcanza — no promete lo imposible', () => {
    // Requiere 3.637 pz/h y la línea da 2.768 como máximo.
    expect(base()!.verdict).toBe('fuera-de-alcance')
  })

  it('y la da por alcanzable cuando el ritmo requerido cabe en el techo', () => {
    const p = base({ targetPieces: 10_000 })!
    // 4.547 pz en 4 h = 1.137 pz/h, muy por debajo de 2.768.
    expect(p.verdict).toBe('alcanzable')
    expect(p.requiredPerHour).toBeLessThan(p.maxPerHour!)
  })

  it('con el ritmo actual alcanzando, la brecha es negativa', () => {
    const p = base({ targetPieces: 10_000 })!
    expect(p.gapPerHour).toBeLessThan(0)
  })

  it('proyecta a dónde llega si sigue al ritmo actual', () => {
    const p = base()!
    // 5.453 + 4 h × 1.449 = 11.249
    expect(p.projectedPieces).toBe(Math.round(5_453 + 4 * 1_449))
  })

  it('cuota cumplida: lo dice y no pide acelerar', () => {
    const p = base({ producedPieces: 21_000 })!
    expect(p.verdict).toBe('cumplida')
    expect(p.remainingPieces).toBe(0)
    expect(p.requiredPerHour).toBe(0)
    expect(p.gapPerHour).toBe(0)
  })

  it('sin techo conocido NO marca imposible — subestimarlo es la peor forma de errar', () => {
    const p = base({ maxPerHour: null })!
    expect(p.verdict).toBe('alcanzable')
    expect(p.maxPerHour).toBeNull()
  })

  it('no recomienda nada con el turno cerrado', () => {
    expect(base({ shiftClosed: true })).toBeNull()
  })

  it('sin cuota cae al objetivo del sensor — la mayoría de los links no trae meta', () => {
    const p = base({ targetPieces: null, expectedPieces: 21_225 })!
    expect(p.targetSource).toBe('objetivo-sensor')
    expect(p.targetPieces).toBe(21_225)
    expect(p.remainingPieces).toBe(21_225 - 5_453)
  })

  it('la cuota le gana al objetivo del sensor cuando están las dos', () => {
    const p = base({ targetPieces: 20_000, expectedPieces: 21_225 })!
    expect(p.targetSource).toBe('cuota')
    expect(p.targetPieces).toBe(20_000)
  })

  it('sin cuota NI objetivo no inventa una meta', () => {
    expect(base({ targetPieces: null, expectedPieces: null })).toBeNull()
    expect(base({ targetPieces: 0, expectedPieces: 0 })).toBeNull()
  })

  it('no divide por cero cuando ya no queda tiempo', () => {
    expect(base({ nowWallMs: CIERRE })).toBeNull()
    expect(base({ nowWallMs: CIERRE + 60_000 })).toBeNull()
  })

  it('pero SÍ informa la cuota cumplida aunque el turno ya haya terminado su horario', () => {
    // El orden importa: "cumplida" se evalúa ANTES que "sin tiempo", porque es
    // la buena noticia y no depende de que queden minutos.
    const p = computePaceToTarget({
      targetPieces: 20_000,
      producedPieces: 20_500,
      scheduledEnd: iso(CIERRE),
      nowWallMs: CIERRE + 10 * 60_000,
      currentPerHour: 1_400,
    })!
    expect(p.verdict).toBe('cumplida')
    expect(p.remainingMin).toBe(0)
  })

  it('sin cierre programado no inventa una ventana', () => {
    expect(base({ scheduledEnd: null })).toBeNull()
    expect(base({ scheduledEnd: 'no-es-fecha' })).toBeNull()
  })
})

describe('lineMaxPerHour', () => {
  it('reparte lo que el sensor espera del turno sobre sus horas programadas', () => {
    // 21.225 pz esperadas en 7,75 h = 2.738,7 pz/h
    const max = lineMaxPerHour(21_225, iso(INICIO), iso(CIERRE))
    expect(max).toBeCloseTo(21_225 / 7.75, 1)
  })

  it('ante la duda devuelve null en vez de un techo subestimado', () => {
    expect(lineMaxPerHour(null, iso(INICIO), iso(CIERRE))).toBeNull()
    expect(lineMaxPerHour(0, iso(INICIO), iso(CIERRE))).toBeNull()
    expect(lineMaxPerHour(21_225, null, iso(CIERRE))).toBeNull()
    expect(lineMaxPerHour(21_225, iso(INICIO), null)).toBeNull()
    expect(lineMaxPerHour(21_225, 'x', iso(CIERRE))).toBeNull()
  })

  it('no acepta una ventana invertida o de duración cero', () => {
    expect(lineMaxPerHour(21_225, iso(CIERRE), iso(INICIO))).toBeNull()
    expect(lineMaxPerHour(21_225, iso(INICIO), iso(INICIO))).toBeNull()
  })
})
