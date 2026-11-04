/**
 * Pruebas de perilla.ts: la vigencia de la perilla (perillaEn), la vara del minuto
 * (varaMinuto) y el umbral de ritmo (umbralARitmo). Lo que se protege: que una
 * anotación rija desde su hora y no antes, que una máquina no herede la de otra,
 * y que sin perilla la vara vuelva a Shoplogix.
 */
import { describe, expect, it } from 'vitest'
import { perillaEn, umbralARitmo, varaMinuto, type PerillasDeLinea } from '../perilla'

const HORA = 3_600_000
/** Inicio de turno de referencia (UTC). */
const INICIO = Date.parse('2026-11-04T12:00:00.000Z')
/** ISO de `h` horas respecto del inicio del turno (negativo = antes). */
const enHora = (h: number) => new Date(INICIO + h * HORA).toISOString()

/** Arma la forma de `live.perillas` desde el historial, para que `actual` no quede desfasado. */
function perillasDe(historial: Array<{ machineId: string; cpm: number; desde: string }>): PerillasDeLinea {
  const actual: PerillasDeLinea['actual'] = {}
  for (const h of historial) {
    const previo = actual[h.machineId]
    if (!previo || Date.parse(h.desde) >= Date.parse(previo.desde)) {
      actual[h.machineId] = { cpm: h.cpm, desde: h.desde, por: 'admin' }
    }
  }
  return {
    actual,
    historial: historial.map((h) => ({ cpm: h.cpm, desde: h.desde, por: 'admin', machineId: h.machineId })),
  }
}

describe('perillaEn', () => {
  it('sin perillas no hay vigente', () => {
    expect(perillaEn(null, 'ev1', INICIO)).toBeNull()
    expect(perillaEn(undefined, 'ev1', INICIO)).toBeNull()
    expect(perillaEn({ actual: {}, historial: [] }, 'ev1', INICIO)).toBeNull()
  })

  it('una anotación de antes del turno rige todo el turno', () => {
    const p = perillasDe([{ machineId: 'ev1', cpm: 17, desde: enHora(-24) }])
    expect(perillaEn(p, 'ev1', INICIO)).toBe(17)
    expect(perillaEn(p, 'ev1', INICIO + 7 * HORA)).toBe(17)
  })

  it('cambio a mitad de turno (17 → 19): cada instante ve la anotación de su hora', () => {
    const p = perillasDe([
      { machineId: 'ev1', cpm: 17, desde: enHora(-24) },
      { machineId: 'ev1', cpm: 19, desde: enHora(2) },
    ])
    expect(perillaEn(p, 'ev1', INICIO + HORA)).toBe(17)
    expect(perillaEn(p, 'ev1', INICIO + 2 * HORA)).toBe(19) // la hora exacta ya cuenta
    expect(perillaEn(p, 'ev1', INICIO + 5 * HORA)).toBe(19)
    expect(perillaEn(p, 'ev1', INICIO - HORA)).toBe(17)
  })

  it('una anotación futura no rige antes de su hora', () => {
    const p = perillasDe([
      { machineId: 'ev1', cpm: 17, desde: enHora(-24) },
      { machineId: 'ev1', cpm: 19, desde: enHora(5) },
    ])
    expect(perillaEn(p, 'ev1', INICIO + 4 * HORA)).toBe(17)
    const soloFutura = perillasDe([{ machineId: 'ev1', cpm: 19, desde: enHora(5) }])
    expect(perillaEn(soloFutura, 'ev1', INICIO)).toBeNull()
  })

  it('una máquina sin anotación no hereda la de otra', () => {
    const p = perillasDe([
      { machineId: 'ev1', cpm: 17, desde: enHora(-24) },
      { machineId: 'ev2', cpm: 15, desde: enHora(-24) },
    ])
    expect(perillaEn(p, 'ev3', INICIO)).toBeNull()
    expect(perillaEn(p, 'ev2', INICIO)).toBe(15)
  })

  it('si el historial se recortó, la anotación actual sigue valiendo', () => {
    const p: PerillasDeLinea = {
      actual: { ev1: { cpm: 17, desde: enHora(-24), por: 'admin' } },
      historial: [],
    }
    expect(perillaEn(p, 'ev1', INICIO)).toBe(17)
  })
})

describe('varaMinuto', () => {
  it('con perilla vigente manda la perilla, aunque Shoplogix diga otra cosa', () => {
    const p = perillasDe([{ machineId: 'ev1', cpm: 17, desde: enHora(-24) }])
    expect(varaMinuto(p, 'ev1', INICIO + HORA, 18)).toEqual({ cpm: 17, fuente: 'perilla' })
  })

  it('sin perilla cae al esperado de Shoplogix', () => {
    expect(varaMinuto(null, 'ev1', INICIO, 18)).toEqual({ cpm: 18, fuente: 'shoplogix' })
  })

  it('una anotación futura todavía no cambia la vara', () => {
    const p = perillasDe([{ machineId: 'ev1', cpm: 19, desde: enHora(5) }])
    expect(varaMinuto(p, 'ev1', INICIO, 18)).toEqual({ cpm: 18, fuente: 'shoplogix' })
  })

  it('sin perilla ni Shoplogix, la vara es null y la fuente sigue siendo Shoplogix', () => {
    expect(varaMinuto(null, 'ev1', INICIO, null)).toEqual({ cpm: null, fuente: 'shoplogix' })
  })
})

describe('umbralARitmo', () => {
  it.each([
    [17, 13], // 12,75 sube a 13
    [16, 12], // exacto: no sube
    [18, 14], // 13,5 sube a 14
    [15, 12], // 11,25 sube a 12
    [20, 15], // exacto
    [5, 4], // 3,75 sube a 4
    [30, 23], // 22,5 sube a 23
  ])('con %i pz/min el umbral es %i', (cpm, umbral) => {
    expect(umbralARitmo(cpm)).toBe(umbral)
  })
})
