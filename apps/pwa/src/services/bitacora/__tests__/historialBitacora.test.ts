import { describe, expect, it } from 'vitest'
import { rangoDelPeriodo } from '../historialCorreo'
import type { EventoBitacora } from '../bitacora.types'
import {
  detalleRepuesto,
  fechaDesde,
  filasPorTurno,
  lineaRepuestoDelPeriodo,
  porcentaje,
  resumenGraficoParadas,
  resumirPeriodo,
  tesisDelPeriodo,
  tituloRepuesto,
} from '../historialBitacora'
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

  it('el título del gráfico de paradas dice el hallazgo, con los mismos datos que las barras', () => {
    const filas = filasPorTurno(eventos)
    expect(resumenGraficoParadas(filas)).toEqual({ titulo: '2 de 3 turnos con parada · 1 h en total', total: 3 })
    const sinParadas = filas.map((f) => ({ ...f, resumen: { ...f.resumen, conParada: 0, minutosParada: 0 } }))
    expect(resumenGraficoParadas(sinParadas)).toEqual({ titulo: 'Sin paradas en los 3 turnos', total: 3 })
    expect(resumenGraficoParadas([sinParadas[0]!])).toEqual({ titulo: 'Sin paradas en el turno', total: 1 })
  })

  it('los totales del período coinciden con sumar los turnos (una sola definición)', () => {
    const r = resumirPeriodo(eventos, '2026-09-02', '2026-09-15')
    const filas = filasPorTurno(eventos)
    expect(r.turnos).toBe(3)
    expect(r.eventos).toBe(filas.reduce((s, f) => s + f.resumen.eventos, 0))
    expect(r.minutosParada).toBe(60)
    expect(r.mttrMin).toBe(30)
    expect(r.sinDetener).toBe(2)
    // El porcentaje se mide contra las intervenciones SOBRE LA LÍNEA (2 paradas
    // + 2 en ventana), no contra los 6 eventos: los otros 2 no tocaron producción.
    expect(r.conImpacto).toBe(4)
    expect(r.sinImpacto).toBe(2)
    expect(porcentaje(r.parteSinDetener)).toBe('50%')
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

  it('suma los repuestos usados por código: unidades, eventos, equipos y último turno (17-09)', () => {
    const filtro = { codigoSAP: '3300135877', nombre: 'FILTRO 1/2  PURGA N.A AFF40-04D-D 295734', nombreComun: 'Filtro FRL', cantidad: 1 }
    const correa = { codigoSAP: '3300011872', nombre: 'CORREA 37750006', cantidad: 2 }
    const r = resumirPeriodo(
      [
        ev({ turnoId: '2026-09-16_tarde', equipo: 'EMPACADORA E-PACK', equipoId: 'epack', equipoCodigo: '720004590', repuestos: [filtro] }),
        ev({ turnoId: '2026-09-15_dia', equipo: 'CINTAS FILETE', repuestos: [correa, { ...filtro, nombreComun: undefined, cantidad: 2 }] }),
        // Un borrador no suma; el mismo código en otro evento sí.
        ev({ turnoId: '2026-09-15_dia', estado: 'borrador', repuestos: [{ ...correa, cantidad: 9 }] }),
      ],
      '2026-09-10',
      '2026-09-16',
    )
    expect(r.repuestos.map((x) => [x.codigoSAP, x.unidades, x.eventos])).toEqual([
      ['3300135877', 3, 2],
      ['3300011872', 2, 1],
    ])
    expect(r.unidadesRepuestos).toBe(5)
    const [filtroP, correaP] = r.repuestos as [typeof r.repuestos[number], typeof r.repuestos[number]]
    expect(filtroP.nombreComun).toBe('Filtro FRL')
    expect(filtroP.equipos).toEqual(['EMPACADORA E-PACK (720004590)', 'CINTAS FILETE'])
    expect(filtroP.ultimoTurnoId).toBe('2026-09-16_tarde')
    expect(tituloRepuesto(filtroP)).toBe('Filtro FRL')
    expect(detalleRepuesto(filtroP)).toMatch(/^3300135877 · Filtro 1\/2/)
    expect(tituloRepuesto(correaP)).toBe('Correa 37750006')
    expect(detalleRepuesto(correaP)).toBe('3300011872')
    expect(lineaRepuestoDelPeriodo(filtroP)).toMatch(/^3300135877 · Filtro FRL \(Filtro 1\/2 .*\) · ×3 · 2 eventos · EMPACADORA E-PACK \(720004590\), CINTAS FILETE$/)
    expect(resumirPeriodo([], '2026-09-10', '2026-09-16').repuestos).toEqual([])
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
    expect(tesisDelPeriodo(resumirPeriodo(eventos, 'a', 'b'))).toBe('De 4 intervenciones sobre la línea, 2 se hicieron sin detenerla.')
    expect(tesisDelPeriodo(resumirPeriodo([], 'a', 'b'))).toBe('Todavía no hay eventos registrados en este período.')
  })

  it('la tesis NUNCA insinúa paradas que no ocurrieron', () => {
    // Una ronda de inspección y un ajuste en colación: cero paradas. Antes decía
    // "De 2 intervenciones, 1 se hizo sin detener la línea" y gerencia leía una parada.
    const sinParadas = [
      ev({ tipo: 'inspeccion', equipo: 'GRADER MS4/12', impacto: 'no-aplica' }),
      ev({ tipo: 'ajuste', equipo: 'KNURO N1', impacto: 'en-ventana', ventana: 'Colación HG' }),
    ]
    const r = resumirPeriodo(sinParadas, 'a', 'b')
    expect(r.conImpacto).toBe(1)
    expect(tesisDelPeriodo(r)).toBe('De 1 intervención sobre la línea, 1 se hizo sin detenerla.')

    // Solo registros sin impacto: no hay nada que comparar y hay que decirlo.
    expect(tesisDelPeriodo(resumirPeriodo([ev({}), ev({})], 'a', 'b'))).toBe('2 registros en el período, ninguno con impacto en producción.')
    expect(tesisDelPeriodo(resumirPeriodo([ev({})], 'a', 'b'))).toBe('1 registro en el período, sin impacto en producción.')

    // Todo con la máquina detenida: la frase no puede inventar un logro.
    const todoParado = [ev({ impacto: 'con-parada', minutosParada: 20 }), ev({ impacto: 'con-parada', minutosParada: 5 })]
    expect(tesisDelPeriodo(resumirPeriodo(todoParado, 'a', 'b'))).toBe('2 intervenciones sobre la línea, todas con la máquina detenida.')
  })

  it('marca el turno EN CURSO y no cuenta eventos de turnos imposibles', () => {
    // 17:30 del 15-09: el turno tarde corre, el día ya cerró.
    const ahora = new Date(2026, 8, 15, 17, 30)
    const filas = filasPorTurno(eventos, ahora)
    expect(filas.find((f) => f.turnoId === '2026-09-15_tarde')?.enCurso).toBe(true)
    expect(filas.find((f) => f.turnoId === '2026-09-15_dia')?.enCurso).toBe(false)
    // Un evento con turnoId corrupto no aparece en ninguna fila: tampoco puede
    // sumar al total, o la lista no cuadra con la tesis.
    const conBasura = [...eventos, ev({ turnoId: 'basura', impacto: 'con-parada', minutosParada: 99 })]
    const r = resumirPeriodo(conBasura, 'a', 'b')
    expect(r.eventos).toBe(6)
    expect(r.minutosParada).toBe(60)
  })

  it('el período incluye HOY (14 días = hoy y los 13 anteriores)', () => {
    expect(fechaDesde(14, new Date(2026, 8, 15))).toBe('2026-09-02')
    expect(fechaDesde(1, new Date(2026, 8, 15))).toBe('2026-09-15')
    expect(fechaDesde(30, new Date(2026, 0, 5))).toBe('2025-12-07')
  })
})

describe('el año en el título del resumen (17-09-2026)', () => {
  it('va siempre; una sola vez dentro del mismo año, en las dos fechas si lo cruza', () => {
    expect(rangoDelPeriodo('2026-09-04', '2026-09-17')).toBe('04-09 al 17-09-2026')
    expect(rangoDelPeriodo('2026-12-28', '2027-01-10')).toBe('28-12-2026 al 10-01-2027')
  })
})
