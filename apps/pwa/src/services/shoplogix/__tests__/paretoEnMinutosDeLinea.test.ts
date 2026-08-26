/**
 * «Qué se repite» —el bloque con el que se decide QUÉ atacar— valorizaba cada
 * causa con sus minutos de MÁQUINA (`min`) en vez de los de LÍNEA (`lineMin`).
 * Con tres Baader eso multiplica todo por más de cinco.
 *
 * Medido sobre los turnos reales que publicaba el monitor el 26-08:
 *
 *     turno                    min(maq)   lineMin   recoverableMin
 *     26-08 Turno 2                 151        19               12
 *     25-08 Turno 1                 103         7                6
 *     25-08 Turno 2                  96        18               17
 *     24-08 Turno 1                  52         2                1
 *     24-08 Turno 2                  78        18               13
 *     24-08 Turno 1 Lunes            51         4                1
 *     22-08 Turno 2                 138        75               72
 *     ──────────────────────────────────────────────────────────
 *     total                    669 (11,2 h)  143      122 (2,0 h)
 *
 *     piezas con `min`   : 24.517
 *     piezas con línea   :  4.383      ← 5,6 veces menos
 *
 * En pantalla eso era «≈41.900 pz · ≈3,5 turnos completos de producción»
 * cuando la cifra defendible es del orden de medio turno. Un Pareto inflado no
 * solo exagera: manda a atacar la causa equivocada, porque las que más se
 * inflan son las que paran UNA máquina muchas veces (las microdetenciones), no
 * las que frenan la línea entera.
 */
import { describe, it, expect } from 'vitest'
import { buildPareto } from '../monitorPareto'

/** El turno del 26-08 tal como lo publicó el backend. */
const TURNO = {
  total: 13_689,
  producingMin: 392,
  recoverableMin: 12,
  causas: [
    { reason: 'KNURO', min: 88, count: 14, lineMin: 8 },
    { reason: 'Micro Detencion', min: 39, count: 71, lineMin: 3 },
    { reason: 'Detencion', min: 10, count: 2, lineMin: 3 },
    { reason: 'LOGICA', min: 8, count: 1, lineMin: 0 },
    { reason: 'ACUMULACION RECHAZO', min: 6, count: 1, lineMin: 5 },
  ],
} as never

describe('el Pareto cuenta minutos de LÍNEA', () => {
  it('OJO: no suma los 151 min de máquina sino los 12 de línea', () => {
    const r = buildPareto([TURNO])
    expect(r.totalMin).toBe(12)
    expect(r.totalMin).not.toBe(151)
  })

  it('las piezas salen de esos minutos, no de los de máquina', () => {
    const r = buildPareto([TURNO])
    // 12 min a 34,9 pz/min andando.
    expect(r.totalPiezas).toBeGreaterThan(350)
    expect(r.totalPiezas).toBeLessThan(500)
  })

  it('OJO: la causa que para UNA máquina muchas veces deja de dominar', () => {
    // KNURO tiene 88 min de máquina (el más grande de lejos) pero 8 de línea.
    // ACUMULACION RECHAZO tiene 6 de máquina y 5 de línea.
    const r = buildPareto([TURNO])
    const knuro = r.rows.find((f) => /knuro/i.test(f.label))!
    const acum = r.rows.find((f) => /acumulacion/i.test(f.label))!
    expect(knuro.minutes / acum.minutes).toBeLessThan(3)   // antes era 88/6 = 14,7
  })

  it('el conteo de veces NO se toca: 71 microparadas son 71', () => {
    const r = buildPareto([TURNO])
    const micro = r.rows.find((f) => /micro/i.test(f.label))!
    expect(micro.count).toBe(71)
  })

  it('un turno sin `lineMin` (payload viejo) sigue usando `min`', () => {
    const viejo = {
      total: 10_000, producingMin: 400, recoverableMin: null,
      causas: [{ reason: 'Detencion', min: 30, count: 3 }],
    } as never
    expect(buildPareto([viejo]).totalMin).toBe(30)
  })
})
