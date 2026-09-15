import { describe, expect, it } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { fechaDesde, filasPorTurno, porcentaje, resumirPeriodo, tesisDelPeriodo } from '../historialBitacora'
import { resumirBitacora } from '../resumenBitacora'

const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: Math.random().toString(36).slice(2),
  plantId: 'chonchi',
  turnoId: '2026-09-15_tarde',
  fechaTurno: '2026-09-15',
  banda: 'tarde',
  tipo: 'falla',
  equipo: 'EVISCERADORA BAADER 142 N3',
  descripcion: 'x',
  horaInicio: '16:20',
  horaTermino: '16:55',
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u',
  autorNombre: 'mantencion.plantach',
  registradoPor: 'Danilo Cortes',
  ...p,
})

describe('historial del período', () => {
  const eventos = [
    ev({ turnoId: '2026-09-15_tarde', impacto: 'con-parada', minutosParada: 35 }),
    ev({ turnoId: '2026-09-15_tarde', impacto: 'en-ventana', ventana: 'Colación HG', registradoPor: 'Matias Serpa' }),
    ev({ turnoId: '2026-09-15_tarde', pendiente: true }),
    ev({ turnoId: '2026-09-15_dia', equipo: 'KNURO N1', impacto: 'con-parada', minutosParada: 25 }),
    ev({ turnoId: '2026-09-14_noche', impacto: 'en-ventana', ventana: 'Aseo', registradoPor: 'Leandro Igor' }),
    ev({ turnoId: '2026-09-14_noche', resuelvePendiente: { id: 'p', turnoId: '2026-09-13_tarde', equipo: 'x', descripcion: 'y', registradoPor: 'z' } }),
  ]

  it('un renglón por turno CON eventos, del más reciente al más antiguo', () => {
    const filas = filasPorTurno(eventos)
    expect(filas.map((f) => f.turnoId)).toEqual(['2026-09-15_tarde', '2026-09-15_dia', '2026-09-14_noche'])
    expect(filas[0]?.resumen.eventos).toBe(3)
    expect(filas[0]?.pendientesAbiertos).toBe(1)
    expect(filasPorTurno([ev({ turnoId: 'basura' })])).toEqual([])
  })

  it('los totales del período coinciden con sumar los turnos (una sola definición)', () => {
    const r = resumirPeriodo(eventos, '2026-09-02', '2026-09-15')
    const filas = filasPorTurno(eventos)
    expect(r.turnos).toBe(3)
    expect(r.eventos).toBe(filas.reduce((s, f) => s + f.resumen.eventos, 0))
    expect(r.minutosParada).toBe(60)
    expect(r.mttrMin).toBe(30)
    expect(r.sinDetener).toBe(2)
    expect(porcentaje(r.parteSinDetener)).toBe('33%')
    expect(r.pendientesCerrados).toBe(1)
    expect(r.pendientesAbiertos).toBe(1)
    expect(r.turnosSinParada).toBe(1) // el turno noche no tuvo paradas
    // El MTTR del período usa la misma regla que el del turno.
    expect(r.mttrMin).toBe(resumirBitacora(eventos).mttrMin)
  })

  it('ordena los equipos por minutos parados con su parte del total', () => {
    const r = resumirPeriodo(eventos, '2026-09-02', '2026-09-15')
    expect(r.equipos.map((e) => [e.equipo, e.minutos, e.paradas])).toEqual([
      ['EVISCERADORA BAADER 142 N3', 35, 1],
      ['KNURO N1', 25, 1],
    ])
    expect(porcentaje(r.equipos[0]!.parte)).toBe('58%')
  })

  it('cuenta quién registró, con el técnico y no la cuenta compartida', () => {
    const r = resumirPeriodo(eventos, '2026-09-02', '2026-09-15')
    expect(r.porTecnico).toEqual([
      { nombre: 'Danilo Cortes', eventos: 4 },
      { nombre: 'Matias Serpa', eventos: 1 },
      { nombre: 'Leandro Igor', eventos: 1 },
    ])
  })

  it('la tesis encabeza lo hecho sin detener, y aguanta el período vacío', () => {
    expect(tesisDelPeriodo(resumirPeriodo(eventos, 'a', 'b'))).toBe('De 6 intervenciones, 2 se hicieron sin detener la línea.')
    expect(tesisDelPeriodo(resumirPeriodo([], 'a', 'b'))).toBe('Todavía no hay eventos registrados en este período.')
    expect(tesisDelPeriodo(resumirPeriodo([ev({})], 'a', 'b'))).toBe('1 intervención registrada en el período.')
  })

  it('el período incluye HOY (14 días = hoy y los 13 anteriores)', () => {
    expect(fechaDesde(14, new Date(2026, 8, 15))).toBe('2026-09-02')
    expect(fechaDesde(1, new Date(2026, 8, 15))).toBe('2026-09-15')
    expect(fechaDesde(30, new Date(2026, 0, 5))).toBe('2025-12-07')
  })
})
