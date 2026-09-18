import { describe, expect, it } from 'vitest'
import { turnoDesdeId } from '../turnoMantencion'
import { MINUTOS_SIN_PRODUCCION_POR_TURNO, explicacionMtbfMttr, explicacionMtbfMttrPeriodo, minutosDelTurno, mtbf, mtbfDelTurno } from '../mtbf'

const turno = turnoDesdeId('2026-09-17_dia')!

describe('MTBF de la bitácora (sobre las horas del turno menos lo sin producción)', () => {
  it('un turno de 8 h con 2 paradas de 25 min: (480 − 90 − 25) ÷ 2', () => {
    expect(minutosDelTurno(turno)).toBe(480)
    expect(MINUTOS_SIN_PRODUCCION_POR_TURNO).toBe(90)
    expect(mtbfDelTurno(turno, { minutosParada: 25, conParada: 2 })).toBe(182.5)
    // Sin fallas con parada no existe (null), no es cero.
    expect(mtbfDelTurno(turno, { minutosParada: 0, conParada: 0 })).toBeNull()
    // Un período: 3 turnos de 8 h, 3 paradas que suman 60 min.
    expect(mtbf(1440, 60, 3, 3)).toBe((1440 - 270 - 60) / 3)
  })

  it('la línea dice las dos siglas con su definición y el cálculo con los números del turno', () => {
    const linea = explicacionMtbfMttr(turno, { minutosParada: 25, conParada: 2, mttrMin: 12.5 })
    expect(linea).toBe(
      'MTTR 13 min (tiempo promedio en reparar cada falla: 25 min de parada ÷ 2 fallas). ' +
        'MTBF 3 h 03 min (tiempo promedio operando entre fallas: 8 h de turno − 1 h 30 min sin producción (colación, reunión, ejercicios) − 25 min de parada = 6 h 05 min ÷ 2).',
    )
    expect(explicacionMtbfMttr(turno, { minutosParada: 0, conParada: 0, mttrMin: null })).toBe('MTTR y MTBF: sin fallas con parada en el turno, no aplican.')
    // Una parada sin duración todavía: MTTR no se puede, MTBF sí (cuenta la falla).
    expect(explicacionMtbfMttr(turno, { minutosParada: 0, conParada: 1, mttrMin: null })).toContain('MTTR — (tiempo promedio en reparar cada falla: la falla no tiene duración todavía)')
    const periodo = explicacionMtbfMttrPeriodo(1440, 3, { minutosParada: 60, conParada: 3, mttrMin: 20 })
    expect(periodo).toContain('MTBF 6 h 10 min (tiempo promedio operando entre fallas: 24 h en 3 turnos − 4 h 30 min sin producción − 1 h de parada = 18 h 30 min ÷ 3)')
    expect(periodo).toContain('Aproximado')
  })
})
