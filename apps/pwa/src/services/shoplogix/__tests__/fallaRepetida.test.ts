import { describe, expect, it } from 'vitest'
import {
  causaDeFalla,
  episodiosFalla,
  fallasRepetidasDelTurno,
  type StateFalla,
} from '../fallaRepetida'

const T0 = Date.UTC(2026, 9, 20, 8, 0, 0)
const at = (min: number) => new Date(T0 + min * 60_000)

function up(desdeMin: number, hastaMin: number): StateFalla {
  return { startAt: at(desdeMin), endAt: at(hastaMin), durationSec: (hastaMin - desdeMin) * 60, type: 'uptime', name: 'Produciendo', reason: '' }
}
function paro(min: number, durMin: number, reason: string, name = 'Detencion'): StateFalla {
  return { startAt: at(min), endAt: at(min + durMin), durationSec: durMin * 60, type: 'downtime', name, reason }
}
const maq = (states: StateFalla[]) => [{ machineid: 'm1', machineName: 'Evisceradora 3', states }]

describe('causaDeFalla', () => {
  it('acepta causas de Mantención', () => {
    expect(causaDeFalla('LOGICA')).toBe('Lógica')
    expect(causaDeFalla('BAADER 142/MOTORES')).toBe('Motores')
  })
  it('excluye Ajuste mantenimiento, Trabajos contratistas y lo que no es Mantención', () => {
    expect(causaDeFalla('AJUSTE MANTENIMIENTO')).toBeNull()
    expect(causaDeFalla('TRABAJOS CONTRATISTAS')).toBeNull()
    expect(causaDeFalla('COLACION')).toBeNull()
    expect(causaDeFalla('')).toBeNull()
  })
  it('junta las cuchillerías de la Baader 200', () => {
    expect(causaDeFalla('BAADER 200/CUCHILLERIA DORSAL')).toBe('Cuchillería')
    expect(causaDeFalla('BAADER 200/CUCHILLERIA CORTE COLA')).toBe('Cuchillería')
  })
})

describe('episodiosFalla', () => {
  it('marca repetición cuando vuelve en ≤ 8 h de operación', () => {
    const eps = episodiosFalla(maq([up(0, 60), paro(60, 10, 'LOGICA'), up(70, 200), paro(200, 5, 'LOGICA')]))
    expect(eps).toHaveLength(2)
    expect(eps[0]!.esRepeticion).toBe(false)
    expect(eps[1]!.esRepeticion).toBe(true)
    expect(eps[1]!.opHDesdeAnterior).toBeCloseTo(130 / 60, 5)
  })

  it('cuenta horas de operación, no de reloj: una parada larga sin producir no consume la ventana', () => {
    // 20 h de reloj entre paros, pero solo 2 h produciendo.
    const eps = episodiosFalla(maq([paro(0, 10, 'MOTORES'), up(10, 130), up(1100, 1210), paro(1210, 5, 'MOTORES')]))
    expect(eps[1]!.opHDesdeAnterior).toBeCloseTo(230 / 60, 5)
    expect(eps[1]!.esRepeticion).toBe(true)
  })

  it('no es repetición pasadas 8 h de operación', () => {
    const eps = episodiosFalla(maq([paro(0, 10, 'KNURO'), up(10, 10 + 8 * 60 + 1), paro(10 + 8 * 60 + 1, 5, 'KNURO')]))
    expect(eps[1]!.esRepeticion).toBe(false)
  })

  it('encadena paros de la misma causa separados por < 12 min en un episodio', () => {
    const eps = episodiosFalla(maq([paro(0, 5, 'CINTAS'), up(5, 15), paro(15, 5, 'CINTAS')]))
    expect(eps).toHaveLength(1)
    expect(eps[0]!.paros).toBe(2)
  })

  it('causas distintas no se cruzan', () => {
    const eps = episodiosFalla(maq([paro(0, 10, 'LOGICA'), up(10, 60), paro(60, 10, 'MOTORES')]))
    expect(eps.every((e) => !e.esRepeticion)).toBe(true)
  })

  it('ignora micros, paros cortos y states duplicados', () => {
    const p = paro(100, 10, 'LOGICA')
    const eps = episodiosFalla(maq([
      paro(0, 10, 'LOGICA', 'Micro Detencion'),
      paro(30, 1, 'LOGICA'),
      up(0, 100), p, { ...p }, up(110, 200),
    ]))
    expect(eps).toHaveLength(1)
    expect(eps[0]!.paros).toBe(1)
  })

  it('lista vacía sin paros', () => {
    expect(episodiosFalla(maq([up(0, 100)]))).toEqual([])
    expect(episodiosFalla([])).toEqual([])
  })
})

describe('fallasRepetidasDelTurno', () => {
  it('cuenta la vuelta de un paro del turno anterior y deja solo grupos con repeticiones', () => {
    const eps = episodiosFalla(maq([
      paro(0, 10, 'LOGICA'), up(10, 120), // turno anterior
      paro(120, 10, 'LOGICA'), up(130, 300), paro(300, 10, 'LOGICA'), // turno actual: 2 vueltas
      paro(310 + 15, 10, 'CORREAS'), up(345, 400), // una sola vez
    ]))
    const g = fallasRepetidasDelTurno(eps, at(120), at(600))
    expect(g).toHaveLength(1)
    expect(g[0]).toMatchObject({ causa: 'Lógica', episodios: 2, repeticiones: 2 })
    expect(g[0]!.ultimaRepeticion?.getTime()).toBe(at(300).getTime())
  })
})
