import { describe, it, expect } from 'vitest'
import { hayTurnoEnCurso, type TurnoLigero } from '../turnoEnCurso'

const AHORA = Date.UTC(2026, 8, 22, 15, 0)
const hace = (min: number) => ({ toMillis: () => AHORA - min * 60_000 })
const inicio = { seconds: 1 }

describe('hayTurnoEnCurso', () => {
  it('turno arrancado, sin brief de cierre y con sync reciente → en curso', () => {
    const t: TurnoLigero[] = [{ id: '2026-09-22_Turno Dia', effectiveStart: inicio, lastSyncAt: hace(4) }]
    expect(hayTurnoEnCurso(t, AHORA)).toBe(true)
  })

  it('con el brief de cierre enviado ya no está en curso', () => {
    const t: TurnoLigero[] = [{ id: '2026-09-22_Turno 2', effectiveStart: inicio, endBriefSentAt: inicio, lastSyncAt: hace(1) }]
    expect(hayTurnoEnCurso(t, AHORA)).toBe(false)
  })

  it('el Unscheduled no cuenta aunque se sincronice (duplica los intervalos)', () => {
    const t: TurnoLigero[] = [{ id: '2026-09-22_Unscheduled', effectiveStart: inicio, lastSyncAt: hace(1) }]
    expect(hayTurnoEnCurso(t, AHORA)).toBe(false)
  })

  it('un turno que nunca arrancó (effectiveStart null) no está en curso', () => {
    const t: TurnoLigero[] = [{ id: '2026-09-21_Turno Noche L', effectiveStart: null, lastSyncAt: hace(1) }]
    expect(hayTurnoEnCurso(t, AHORA)).toBe(false)
  })

  it('sin sync hace más de 20 min no se afirma el turno', () => {
    const t: TurnoLigero[] = [{ id: '2026-09-22_Turno Dia', effectiveStart: inicio, lastSyncAt: hace(25) }]
    expect(hayTurnoEnCurso(t, AHORA)).toBe(false)
  })

  it('sin lastSyncAt no se afirma el turno', () => {
    const t: TurnoLigero[] = [{ id: '2026-09-22_Turno Dia', effectiveStart: inicio }]
    expect(hayTurnoEnCurso(t, AHORA)).toBe(false)
  })
})
