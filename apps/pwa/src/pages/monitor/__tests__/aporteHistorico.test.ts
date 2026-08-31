import { describe, expect, it } from 'vitest'
import {
  APORTE_MIN_PROD_MIN, deltaAporte, numeroDeTurno, referenciaAporte,
} from '../aporteHistorico'
import type { ShiftStat } from '../../../services/shoplogix/publicShiftMonitor.service'

/** Un turno con su desglose por máquina, como lo publica `buildShiftStats`. */
const turno = (
  dateKey: string,
  shiftId: string,
  producingMin: number,
  maquinas: Record<string, number>,
): ShiftStat => ({
  shiftDocId: `${dateKey}_${shiftId}`,
  dateKey,
  shiftId,
  total: Object.values(maquinas).reduce((a, b) => a + b, 0),
  producingMin,
  porMaquina: Object.entries(maquinas).map(([n, p]) => ({ n, p })),
})

describe('numeroDeTurno', () => {
  it('ignora el día pegado al nombre — el caso real de Chonchi', () => {
    /* El turno de hoy se llama «Turno 1 Lunes» y los otros lunes «Turno 1»:
       por nombre exacto quedaban 4 comparables en 30 días. */
    expect(numeroDeTurno('Turno 1 Lunes')).toBe('turno 1')
    expect(numeroDeTurno('Turno 1')).toBe('turno 1')
    expect(numeroDeTurno('Turno 2')).toBe('turno 2')
    expect(numeroDeTurno('Turno 1 Lunes')).not.toBe(numeroDeTurno('Turno 2'))
  })

  it('los turnos con nombre agrupan por PALABRA — el caso real de Filete', () => {
    /* Nombres medidos en el espejo: «Turno Dia» ×23, «Turno Noche» ×10 y
       «Turno Noche L» ×2. Sin esto, el turno noche de un lunes se comparaba
       solo contra los otros dos lunes y dejaba fuera diez turnos noche. */
    expect(numeroDeTurno('Turno Noche L')).toBe('turno noche')
    expect(numeroDeTurno('Turno Noche')).toBe('turno noche')
    expect(numeroDeTurno('Turno Dia')).toBe('turno dia')
    expect(numeroDeTurno('Turno Día')).toBe('turno dia')
    // Requisito de Orel: noche con noche, día con día. Nunca cruzados.
    expect(numeroDeTurno('Turno Noche L')).not.toBe(numeroDeTurno('Turno Dia'))
  })

  it('el número manda sobre la palabra, y una palabra adentro de otra no cuenta', () => {
    expect(numeroDeTurno('Turno 1 Noche')).toBe('turno 1')
    expect(numeroDeTurno('Turno Mediodia')).toBe('turno mediodia')
  })

  it('sin número ni palabra cae al nombre completo, no a otro turno', () => {
    expect(numeroDeTurno('Extraordinario')).toBe('extraordinario')
    expect(numeroDeTurno('')).toBeNull()
    expect(numeroDeTurno(null)).toBeNull()
  })
})

describe('referenciaAporte', () => {
  const stats: ShiftStat[] = [
    turno('2026-08-28', 'Turno 1', 400, { 'Ev 1': 4000, 'Ev 2': 4400 }),
    turno('2026-08-27', 'Turno 1', 200, { 'Ev 1': 1000, 'Ev 2': 2400 }),
    turno('2026-08-28', 'Turno 2', 400, { 'Ev 1': 9999, 'Ev 2': 9999 }),
  ]

  it('promedia solo los turnos del MISMO número (T2 no contamina a T1)', () => {
    const r = referenciaAporte(stats, 'Turno 1 Lunes')!
    expect(r.turnos).toBe(2)
    // Ev 1: (4000/400 + 1000/200) / 2 = (10 + 5) / 2 = 7,5
    expect(r.porMaquina.get('Ev 1')).toBeCloseTo(7.5, 6)
    // Ev 2: (11 + 12) / 2 = 11,5
    expect(r.porMaquina.get('Ev 2')).toBeCloseTo(11.5, 6)
  })

  it('toma los N más recientes por FECHA, no por el orden del arreglo', () => {
    const muchos = [
      turno('2026-08-20', 'Turno 1', 100, { 'Ev 1': 100 }), // 1,0 — el más viejo
      turno('2026-08-29', 'Turno 1', 100, { 'Ev 1': 900 }), // 9,0
      turno('2026-08-28', 'Turno 1', 100, { 'Ev 1': 700 }), // 7,0
    ]
    const r = referenciaAporte(muchos, 'Turno 1', 2)!
    expect(r.turnos).toBe(2)
    expect(r.desde).toBe('2026-08-29')
    expect(r.porMaquina.get('Ev 1')).toBeCloseTo(8, 6) // (9 + 7) / 2
  })

  it('descarta turnos sin minutos o sin desglose en vez de contarlos como cero', () => {
    const sucios: ShiftStat[] = [
      turno('2026-08-28', 'Turno 1', 400, { 'Ev 1': 4000 }), // 10,0
      turno('2026-08-27', 'Turno 1', 0, { 'Ev 1': 4000 }), // producingMin 0
      { ...turno('2026-08-26', 'Turno 1', 400, {}), porMaquina: undefined }, // entrada vieja
    ]
    const r = referenciaAporte(sucios, 'Turno 1')!
    expect(r.turnos).toBe(1)
    expect(r.porMaquina.get('Ev 1')).toBeCloseTo(10, 6)
  })

  it('cada máquina se promedia sobre los turnos en que aparece', () => {
    /* Una Baader que se sumó hace poco no se castiga con los turnos en que
       todavía no existía. */
    const r = referenciaAporte([
      turno('2026-08-28', 'Turno 1', 100, { 'Ev 1': 1000, 'Ev 3': 800 }),
      turno('2026-08-27', 'Turno 1', 100, { 'Ev 1': 800 }),
    ], 'Turno 1')!
    expect(r.porMaquina.get('Ev 1')).toBeCloseTo(9, 6) // (10 + 8) / 2
    expect(r.porMaquina.get('Ev 3')).toBeCloseTo(8, 6) // solo su turno
  })

  it('sin turnos comparables no inventa referencia', () => {
    expect(referenciaAporte(stats, 'Turno 9')).toBeNull()
    expect(referenciaAporte([], 'Turno 1')).toBeNull()
    expect(referenciaAporte(stats, null)).toBeNull()
  })
})

describe('deltaAporte', () => {
  const ref = referenciaAporte([
    turno('2026-08-28', 'Turno 1', 400, { 'Ev 1': 4000 }), // 10,0
  ], 'Turno 1')

  it('resta la referencia al aporte de ahora', () => {
    expect(deltaAporte(ref, 'Ev 1', 11.7, 300)).toBeCloseTo(1.7, 6)
    expect(deltaAporte(ref, 'Ev 1', 8.5, 300)).toBeCloseTo(-1.5, 6)
  })

  it('calla mientras el turno no produjo lo suficiente', () => {
    /* A los 10 min de arrancar el aporte todavía se mueve solo: un ▼8,0 ahí no
       dice nada de la máquina. */
    expect(deltaAporte(ref, 'Ev 1', 2, APORTE_MIN_PROD_MIN - 1)).toBeNull()
    expect(deltaAporte(ref, 'Ev 1', 2, APORTE_MIN_PROD_MIN)).not.toBeNull()
  })

  it('calla sin referencia, sin aporte o con una máquina que no está en la muestra', () => {
    expect(deltaAporte(null, 'Ev 1', 11.7, 300)).toBeNull()
    expect(deltaAporte(ref, 'Ev 1', null, 300)).toBeNull()
    expect(deltaAporte(ref, 'Ev 9', 11.7, 300)).toBeNull()
  })
})
