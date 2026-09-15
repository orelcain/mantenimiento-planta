import { describe, it, expect } from 'vitest'
import { syncCubreElTurno, etiquetaDeAntiguedad } from '../frescuraDelSync'

/** Filete, 2026-09-11 Turno Noche: termina 05:15 del 12 (hora de planta). */
const FIN_TURNO = new Date('2026-09-12T05:15:00Z')

describe('syncCubreElTurno', () => {
  it('un sync posterior al turno lo deja completo', () => {
    // 14-09 12:03 UTC real, dos días después del cierre.
    expect(syncCubreElTurno(new Date('2026-09-14T12:03:00Z'), FIN_TURNO)).toBe(true)
  })

  it('un sync de mitad de turno NO lo cubre', () => {
    expect(syncCubreElTurno(new Date('2026-09-12T03:00:00Z'), FIN_TURNO)).toBe(false)
  })

  it('el desfase de Chile no se da por bueno antes de tiempo', () => {
    // El fin de turno es hora de planta; en UTC real ocurre 3 o 4 h después.
    // A las +3h todavía no se afirma; a las +4h sí.
    expect(syncCubreElTurno(new Date('2026-09-12T08:14:00Z'), FIN_TURNO)).toBe(false)
    expect(syncCubreElTurno(new Date('2026-09-12T09:15:00Z'), FIN_TURNO)).toBe(true)
  })

  it('sin fecha de sync o sin fin de turno no se afirma nada', () => {
    expect(syncCubreElTurno(null, FIN_TURNO)).toBe(false)
    expect(syncCubreElTurno(new Date(), null)).toBe(false)
    expect(syncCubreElTurno(new Date(), new Date('no es fecha'))).toBe(false)
  })
})

describe('etiquetaDeAntiguedad', () => {
  it('el segundero solo en el primer minuto y los minutos hasta la hora', () => {
    expect(etiquetaDeAntiguedad(45)).toBe('hace 45s')
    expect(etiquetaDeAntiguedad(7 * 60)).toBe('hace 7m')
    expect(etiquetaDeAntiguedad(7 * 60 + 12)).toBe('hace 7m 12s')
  })

  it('un turno viejo no se cuenta en minutos', () => {
    // El caso real: «hace 1930m 54s» por un turno de hace más de un día.
    expect(etiquetaDeAntiguedad(1930 * 60 + 54)).toBe('hace 1 día')
    expect(etiquetaDeAntiguedad(2 * 3600)).toBe('hace 2 h')
    expect(etiquetaDeAntiguedad(2 * 3600 + 10 * 60)).toBe('hace 2 h 10 min')
    expect(etiquetaDeAntiguedad(3 * 86400)).toBe('hace 3 días')
  })
})
