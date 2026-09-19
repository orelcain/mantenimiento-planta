import { describe, expect, it } from 'vitest'
import {
  compararPeriodos,
  minutosProduccion,
  parteParada,
  porcentajeFino,
  promedioParadaPorTurno,
  type ResumenPeriodo,
} from '../historialBitacora'

/** Un período con N turnos de 8 h y lo mínimo para las referencias. */
const periodo = (turnos: number, extra: Partial<ResumenPeriodo> = {}): ResumenPeriodo =>
  ({ turnos, minutosTurnos: turnos * 480, minutosParada: 0, fallas: 0, mttrMin: null, mtbfMin: null, ...extra }) as ResumenPeriodo

describe('referencias del historial: ¿es mucho? ¿mejoramos? ¿es normal?', () => {
  it('el tiempo de producción descuenta 1 h 30 min sin producción por turno', () => {
    // 30 turnos × (8 h − 1 h 30 min) = 195 h
    expect(minutosProduccion(periodo(30))).toBe(30 * 390)
  })

  it('11 h 35 min de parada en 30 turnos es el 5,9 % del tiempo de producción', () => {
    const p = parteParada(periodo(30, { minutosParada: 695 }))!
    expect(porcentajeFino(p)).toBe('5,9 %')
  })

  it('una parada chica no se lee «0 %», y sin turnos no hay base', () => {
    expect(porcentajeFino(0.004)).toBe('0,4 %')
    expect(porcentajeFino(0.57)).toBe('57 %')
    expect(parteParada(periodo(0, { minutosParada: 30 }))).toBeNull()
  })

  it('sin período anterior completo NO se compara (la bitácora parte el 15-09)', () => {
    expect(compararPeriodos(periodo(30, { minutosParada: 600 }), null)).toBeNull()
    expect(compararPeriodos(periodo(30, { minutosParada: 600 }), periodo(10, { minutosParada: 100 }))).toBeNull()
  })

  it('menos parada que el período anterior es mejora, y dice cuánto era antes', () => {
    const c = compararPeriodos(periodo(30, { minutosParada: 585 }), periodo(30, { minutosParada: 1170 }))!
    expect(c.parada).toEqual({ sentido: 'baja', mejora: true, antes: '10 %' })
  })

  it('las fallas se comparan POR TURNO: 20 en 30 turnos no es peor que 14 en 20', () => {
    const c = compararPeriodos(periodo(30, { fallas: 20 }), periodo(20, { fallas: 14 }))!
    expect(c.fallas?.sentido).toBe('igual')
    expect(c.fallas?.antes).toBe('14')
  })

  it('MTBF que sube es mejora; MTTR que sube es empeora', () => {
    const c = compararPeriodos(periodo(30, { mttrMin: 40, mtbfMin: 600 }), periodo(30, { mttrMin: 30, mtbfMin: 400 }))!
    expect(c.mttr).toMatchObject({ sentido: 'sube', mejora: false })
    expect(c.mtbf).toMatchObject({ sentido: 'sube', mejora: true })
  })

  it('un cambio menor al 5 % se lee igual (no se pinta por ruido)', () => {
    const c = compararPeriodos(periodo(30, { mttrMin: 31 }), periodo(30, { mttrMin: 30 }))!
    expect(c.mttr).toMatchObject({ sentido: 'igual', mejora: null })
  })

  it('el promedio por turno cuenta los turnos sin parada', () => {
    const f = (m: number) => ({ resumen: { minutosParada: m } }) as Parameters<typeof promedioParadaPorTurno>[0][number]
    expect(promedioParadaPorTurno([f(30), f(0), f(0)])).toBe(10)
    expect(promedioParadaPorTurno([])).toBe(0)
  })
})
