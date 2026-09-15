import { describe, it, expect } from 'vitest'
import { dondeOcurrioLaFalla, causasDeFallaDelTurno } from '../fallaDelTurno'
import type { MaquinaConFalla } from '../fallaDelTurno'

/** Yal, 2026-09-11 Turno 2: 63 min de falla repartidos en las tres Baader. */
const YAL: MaquinaConFalla[] = [
  { nombreCorto: 'YA 1', fallaMin: 24, causas: { 'CAMBIO TURNO': 15 * 60, 'AJUSTE MANTENIMIENTO': 9 * 60 } },
  { nombreCorto: 'YA 2', fallaMin: 21, causas: { 'CAMBIO TURNO': 12 * 60, ATASCAMIENTO: 9 * 60 } },
  { nombreCorto: 'YA 3', fallaMin: 17, causas: { 'AJUSTE MANTENIMIENTO': 17 * 60 } },
]

describe('dondeOcurrioLaFalla', () => {
  it('con varias máquinas no le carga el turno entero a una', () => {
    expect(dondeOcurrioLaFalla(YAL, 62)).toBe('62 min de falla en 3 máquinas')
  })

  it('con una sola máquina la nombra', () => {
    expect(dondeOcurrioLaFalla([YAL[0]!], 24)).toBe('24 min de falla en YA 1')
  })

  it('sin fallas no dice nada', () => {
    expect(dondeOcurrioLaFalla([], 0)).toBe('')
  })
})

describe('causasDeFallaDelTurno', () => {
  it('suma las causas de todas las máquinas, no solo de la peor', () => {
    expect(causasDeFallaDelTurno(YAL)).toEqual([
      { causa: 'CAMBIO TURNO', min: 27 },
      { causa: 'AJUSTE MANTENIMIENTO', min: 26 },
      { causa: 'ATASCAMIENTO', min: 9 },
    ])
  })

  it('suma los segundos antes de redondear', () => {
    const m: MaquinaConFalla[] = [
      { nombreCorto: 'A', fallaMin: 2, causas: { ATASCAMIENTO: 90 } },
      { nombreCorto: 'B', fallaMin: 2, causas: { ATASCAMIENTO: 90 } },
    ]
    expect(causasDeFallaDelTurno(m)).toEqual([{ causa: 'ATASCAMIENTO', min: 3 }])
  })

  it('una causa que no llega al minuto no ensucia la píldora', () => {
    expect(causasDeFallaDelTurno([{ nombreCorto: 'A', fallaMin: 0.2, causas: { X: 20 } }])).toEqual([])
  })
})
