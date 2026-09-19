import { describe, expect, it } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { filasPorTurno, resumirPeriodo } from '../historialBitacora'
import {
  agrupacionPara,
  duracionesFallas,
  fallasRepetidas,
  paretoEquipos,
  respuestaIntervenciones,
  respuestaReparacion,
  respuestaRepetidas,
  respuestaTendencia,
  serieIntervenciones,
  serieParada,
} from '../preguntasHistorial'

const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: Math.random().toString(36).slice(2),
  plantId: 'chonchi',
  turnoId: '2026-09-15_tarde',
  fechaTurno: '2026-09-15',
  banda: 'tarde',
  tipo: 'correctivo',
  equipo: 'KNURO N1',
  descripcion: 'x',
  horaInicio: '16:20',
  horaTermino: null,
  impacto: 'con-parada',
  minutosParada: 20,
  ventana: null,
  pendiente: false,
  fotos: [],
  creadoPor: 'u',
  autorNombre: 'mantencion.plantach',
  registradoPor: 'Danilo Cortes',
  ...p,
})
const enTurno = (turnoId: string, p: Partial<EventoBitacora> = {}) => ev({ turnoId, fechaTurno: turnoId.slice(0, 10), banda: turnoId.split('_')[1] as EventoBitacora['banda'], ...p })

describe('1 · ¿La línea está parando más o menos?', () => {
  it('agrupa por día hasta 14 días y por semana con 30', () => {
    expect(agrupacionPara(7)).toBe('dia')
    expect(agrupacionPara(14)).toBe('dia')
    expect(agrupacionPara(30)).toBe('semana')
  })

  it('un día con 39 min de parada en un turno registrado es el 10 % de 6 h 30 min', () => {
    const serie = serieParada(filasPorTurno([enTurno('2026-09-15_dia', { minutosParada: 39 })]), 'dia')
    expect(serie).toHaveLength(1)
    expect(serie[0]).toMatchObject({ etiqueta: '15-09', minutosParada: 39, minutosProduccion: 390 })
    expect(serie[0]!.parte).toBeCloseTo(0.1)
  })

  it('con menos de 4 días no anuncia tendencia', () => {
    const serie = serieParada(filasPorTurno([enTurno('2026-09-15_dia', { minutosParada: 39 })]), 'dia')
    expect(respuestaTendencia(serie).titulo).toBe('10 % del tiempo de producción parado — pocos días para ver tendencia')
  })

  it('bajar a la mitad se dice «parando menos», con las dos cifras', () => {
    const dias = ['15', '16', '17', '18'].map((d, i) => enTurno(`2026-09-${d}_dia`, { minutosParada: [39, 39, 20, 19][i] }))
    const t = respuestaTendencia(serieParada(filasPorTurno(dias), 'dia'))
    expect(t.titulo).toBe('Parando menos: de 10 % a 5,0 % del tiempo de producción')
  })

  it('un cambio menor al 10 % es «estable» (no se anuncia ruido)', () => {
    const dias = ['15', '16', '17', '18'].map((d, i) => enTurno(`2026-09-${d}_dia`, { minutosParada: [40, 40, 38, 38][i] }))
    expect(respuestaTendencia(serieParada(filasPorTurno(dias), 'dia')).titulo).toMatch(/^Parada estable/)
  })

  it('el día con el turno en curso no cuenta para la tendencia ni el promedio', () => {
    const dias = ['15', '16', '17', '18'].map((d) => enTurno(`2026-09-${d}_dia`, { minutosParada: 39 }))
    const serie = serieParada(filasPorTurno(dias), 'dia').map((p, i) => (i === 3 ? { ...p, parcial: true, minutosParada: 2, parte: 2 / 390 } : p))
    const t = respuestaTendencia(serie)
    expect(t.promedio).toBeCloseTo(0.1)
    expect(t.titulo).toBe('10 % del tiempo de producción parado — pocos días para ver tendencia')
  })

  it('por semana, la clave es el lunes', () => {
    const serie = serieParada(filasPorTurno([enTurno('2026-09-17_dia'), enTurno('2026-09-19_noche')]), 'semana')
    expect(serie.map((p) => p.etiqueta)).toEqual(['sem. 14-09'])
  })
})

describe('2 · ¿Dónde se concentra la parada?', () => {
  it('los equipos que juntos pasan el 70 % son la respuesta, con % acumulado', () => {
    const eventos = [
      ev({ equipo: 'EVISCERADORA BAADER 142 N3', minutosParada: 60 }),
      ev({ equipo: 'KNURO N1', minutosParada: 30 }),
      ev({ equipo: 'ENZUNCHADORA N1', minutosParada: 10 }),
    ]
    const p = paretoEquipos(resumirPeriodo(eventos, '2026-09-15', '2026-09-15'))
    expect(p.titulo).toBe('2 equipos son el 90% de la parada')
    expect(p.barras.map((b) => [b.nombre, Math.round(b.acumulado * 100), b.prioridad])).toEqual([
      ['EVISCERADORA BAADER 142 N3', 60, true],
      ['KNURO N1', 90, true],
      ['ENZUNCHADORA N1', 100, false],
    ])
  })

  it('un solo equipo que pasa el 70 % se nombra', () => {
    const p = paretoEquipos(resumirPeriodo([ev({ minutosParada: 80 }), ev({ equipo: 'GRADER', minutosParada: 20 })], '2026-09-15', '2026-09-15'))
    expect(p.titulo).toBe('KNURO N1 es el 80% de la parada')
  })

  it('la parada sin equipo va a «Otros», que nunca es prioridad', () => {
    const p = paretoEquipos(resumirPeriodo([ev({ minutosParada: 50 }), ev({ equipo: '', minutosParada: 50 })], '2026-09-15', '2026-09-15'))
    expect(p.barras[p.barras.length - 1]).toMatchObject({ nombre: 'Otros', esOtros: true, prioridad: false })
  })
})

describe('3 · ¿Mantención interviene sin detener la línea?', () => {
  it('cuenta sin detener y con parada, y dice si sube', () => {
    const eventos = [
      enTurno('2026-09-15_dia'),
      enTurno('2026-09-16_dia'),
      enTurno('2026-09-17_dia', { impacto: 'en-ventana', minutosParada: null, ventana: 'Colación HG' }),
      enTurno('2026-09-18_dia', { impacto: 'en-ventana', minutosParada: null, ventana: 'Colación HG' }),
    ]
    const serie = serieIntervenciones(filasPorTurno(eventos), 'dia')
    expect(serie.map((p) => [p.sinDetener, p.conParada])).toEqual([[0, 1], [0, 1], [1, 0], [1, 0]])
    expect(respuestaIntervenciones(serie).titulo).toBe('50% de las intervenciones, sin detener la línea, y subiendo')
  })
})

describe('4 · ¿Cuánto tardamos en reparar?', () => {
  it('solo fallas publicadas con duración, de menor a mayor', () => {
    const d = duracionesFallas([
      ev({ minutosParada: 30 }),
      ev({ minutosParada: 10 }),
      ev({ tipo: 'preventivo', minutosParada: 90 }),
      ev({ estado: 'borrador', minutosParada: 5 }),
    ])
    expect(d).toEqual([10, 30])
  })

  it('con pocas fallas las nombra; con 5 o más, mediana y 8 de cada 10', () => {
    expect(respuestaReparacion([5, 20]).titulo).toBe('2 fallas en el período: 5 min y 20 min')
    const r = respuestaReparacion([8, 10, 12, 14, 20, 25, 28, 30, 45, 140])
    expect(r.mediana).toBe(22.5)
    expect(r.p80).toBe(30)
    expect(r.promedio).toBeCloseTo(33.2)
    expect(r.titulo).toBe('La mitad de las fallas se resolvió en 23 min o menos; 8 de cada 10, en 30 min o menos')
  })
})

describe('5 · ¿Qué falla se está repitiendo?', () => {
  it('equipos con 2+ fallas, el más repetido primero, con la última', () => {
    const eventos = [
      enTurno('2026-09-15_dia', { titulo: 'Cilindro herramienta B' }),
      enTurno('2026-09-17_tarde', { titulo: 'Sensor del cilindro' }),
      enTurno('2026-09-18_tarde', { titulo: 'Cilindro otra vez' }),
      enTurno('2026-09-16_dia', { equipo: 'GRADER MS4/12' }),
      enTurno('2026-09-19_noche', { equipo: 'GRADER MS4/12', tipo: 'ajuste', impacto: 'en-ventana' }),
    ]
    const l = fallasRepetidas(eventos)
    expect(l).toEqual([{ equipo: 'KNURO N1', fallas: 3, ultimoTurnoId: '2026-09-18_tarde', ultima: 'Cilindro otra vez' }])
    expect(respuestaRepetidas(l, 14)).toBe('KNURO N1: 3 fallas en 14 días, la última en el turno tarde 18-09')
    expect(respuestaRepetidas([], 14)).toBe('Ninguna falla repetida en el período')
  })
})
