import { describe, it, expect } from 'vitest'
import fixture from './fixtures/chonchi-2026-11-25-maquinas.json'
import { causaDeEstado, maquinasCandidatas, type MaquinaDelTurno } from '../maquinasCandidatas'

// Caso real: Chonchi, turno 2026-11-25_Turno 1. Knuro del 22:53 (124 min, `inicioMs` 1795647183251).
// Fuente: states de producción (solo lectura), recortados a 22:00–00:30.
const maquinas = fixture as MaquinaDelTurno[]
const KNURO_INI = 1795647183251
const KNURO_MIN = 124

describe('causaDeEstado', () => {
  it('KNURO es Knuro (Mantención); una micro detención no es causa de Mantención', () => {
    expect(causaDeEstado({ reason: 'KNURO', name: 'Detencion' })).toBe('Knuro')
    expect(causaDeEstado({ reason: '', name: 'Micro Detencion' })).toBeNull()
  })
})

describe('maquinasCandidatas · 25-11 Chonchi', () => {
  it('solo Evisceradora 1 marcó KNURO en el 22:53', () => {
    expect(maquinasCandidatas(maquinas, 'Knuro', KNURO_INI, KNURO_MIN)).toEqual(['Evisceradora 1'])
  })
  it('una causa que ninguna máquina marcó en ese rato no tiene candidatas', () => {
    expect(maquinasCandidatas(maquinas, 'Túneles', KNURO_INI, KNURO_MIN)).toEqual([])
  })
  it('la ventana ±5 min: un state que termina 4 min antes del inicio sí cuenta', () => {
    const sintetica: MaquinaDelTurno[] = [
      { machineName: 'Maq X', states: [{ s: KNURO_INI - 10 * 60_000, e: KNURO_INI - 4 * 60_000, reason: 'KNURO', name: 'Detencion' }] },
    ]
    expect(maquinasCandidatas(sintetica, 'Knuro', KNURO_INI, KNURO_MIN)).toEqual(['Maq X'])
  })
  it('dos máquinas con la misma causa en el rango: ambas, sin repetir', () => {
    const dos: MaquinaDelTurno[] = [
      { machineName: 'A', states: [{ s: KNURO_INI, e: KNURO_INI + 60_000, reason: 'KNURO', name: '' }, { s: KNURO_INI + 60_000, e: KNURO_INI + 120_000, reason: 'KNURO', name: '' }] },
      { machineName: 'B', states: [{ s: KNURO_INI, e: KNURO_INI + 60_000, reason: 'KNURO', name: '' }] },
    ]
    expect(maquinasCandidatas(dos, 'Knuro', KNURO_INI, KNURO_MIN)).toEqual(['A', 'B'])
  })
})
