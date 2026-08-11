/**
 * Ante ventanas de turno que se SOLAPAN gana la más específica (la más corta).
 *
 * Caso real Chonchi (reporte de Orel, 11-ago-2026): el schedule conserva
 * `Turno día` 07:00–19:00 y `Turno noche` 19:00–07:00 —nombres que la planta
 * dejó de emitir en 2026-05— junto a los vigentes `Turno 1` 21:30–05:45 y
 * `Turno 2` 09:00–17:15. Recorriendo el schedule en su orden de declaración,
 * "Turno día" ganaba: a las 16:00, con el Turno 2 real ya cerrado (07:15–15:00),
 * la app anunciaba "En curso · Turno día" y al tocarlo llevaba a la MISMA
 * jornada pero sin el Excel del Grader, que se guarda bajo "Turno 2".
 */
import { describe, it, expect } from 'vitest'
import { bySpecificity, shiftWindowMinutes } from '../graderShiftSchedule'
import type { GraderShiftSchedule } from '../types'

/** El schedule real de chonchi-eviscerado, en su orden de declaración. */
const CHONCHI: GraderShiftSchedule[] = [
  { shiftId: 'Turno día',     startHour: 7,  startMinute: 0,  endHour: 19, endMinute: 0  },
  { shiftId: 'Turno noche',   startHour: 19, startMinute: 0,  endHour: 7,  endMinute: 0  },
  { shiftId: 'Turno 1',       startHour: 21, startMinute: 30, endHour: 5,  endMinute: 45 },
  { shiftId: 'Turno 1 Lunes', startHour: 0,  startMinute: 0,  endHour: 7,  endMinute: 0  },
  { shiftId: 'Turno 2',       startHour: 9,  startMinute: 0,  endHour: 17, endMinute: 15 },
]

describe('bySpecificity', () => {
  it('los turnos vigentes ganan a las ventanas anchas heredadas', () => {
    const orden = bySpecificity(CHONCHI).map(s => s.shiftId)
    // Los dos legacy de 12 h quedan últimos: dejan de ganarle a los reales.
    expect(orden.slice(-2).sort()).toEqual(['Turno día', 'Turno noche'])
    expect(orden[0]).toBe('Turno 1 Lunes')   // 7 h, la más corta
  })

  it('el primero que contiene las 16:00 pasa a ser Turno 2, no Turno día', () => {
    const contiene = (s: GraderShiftSchedule, min: number) => {
      const ini = s.startHour * 60 + s.startMinute
      const fin = s.endHour * 60 + s.endMinute
      return fin > ini ? min >= ini && min < fin : min >= ini || min < fin
    }
    const min16 = 16 * 60
    expect(bySpecificity(CHONCHI).find(s => contiene(s, min16))!.shiftId).toBe('Turno 2')
    // Con el orden de declaración ganaba el legacy — esto es lo que se corrigió.
    expect(CHONCHI.find(s => contiene(s, min16))!.shiftId).toBe('Turno día')
  })

  it('mide bien las ventanas que cruzan medianoche', () => {
    expect(shiftWindowMinutes({ shiftId: 'x', startHour: 21, startMinute: 30, endHour: 5, endMinute: 45 })).toBe(8 * 60 + 15)
    expect(shiftWindowMinutes({ shiftId: 'x', startHour: 9,  startMinute: 0,  endHour: 17, endMinute: 15 })).toBe(8 * 60 + 15)
  })

  it('no muta el schedule original', () => {
    const antes = CHONCHI.map(s => s.shiftId)
    bySpecificity(CHONCHI)
    expect(CHONCHI.map(s => s.shiftId)).toEqual(antes)
  })
})
