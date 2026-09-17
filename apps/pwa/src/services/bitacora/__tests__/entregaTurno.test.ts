import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { EventoBitacora } from '../bitacora.types'
import { copiaDeOrigen, etiquetaCortaTurno, origenDePendiente, pendientesAnteriores, turnosEntre } from '../entregaTurno'
import { resumirBitacora } from '../resumenBitacora'
import { bitacoraAHtmlCorreo, bitacoraATextoPlano, lineaImpacto } from '../bitacoraCorreo'
import { turnoDesdeId } from '../turnoMantencion'

// Las etiquetas cortas muestran el año solo si no es el actual: el reloj de
// estas pruebas queda en 2026 para que no cambien al pasar de año.
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-17T12:00:00') })
})
afterAll(() => {
  vi.useRealTimers()
})


const ev = (p: Partial<EventoBitacora>): EventoBitacora => ({
  id: 'x',
  plantId: 'chonchi',
  turnoId: '2026-09-15_tarde',
  fechaTurno: '2026-09-15',
  banda: 'tarde',
  tipo: 'novedad',
  equipo: 'Enzunchadora TP-6000',
  descripcion: 'Motor de tensado con ruido.',
  horaInicio: '22:30',
  horaTermino: null,
  impacto: 'no-aplica',
  minutosParada: null,
  ventana: null,
  pendiente: true,
  fotos: [],
  creadoPor: 'u',
  autorNombre: 'mantencion.plantach',
  registradoPor: 'Matias Serpa',
  ...p,
})

const noche16 = turnoDesdeId('2026-09-16_noche')!

describe('hallazgos de la revisión adversaria (15-09)', () => {
  it('#7 un evento un poco ANTES del inicio del turno va primero, no último', async () => {
    const { ordenarEventos } = await import('../resumenBitacora')
    const tarde = turnoDesdeId('2026-09-15_tarde')!
    const orden = ordenarEventos(tarde, [ev({ id: 'tarde', horaInicio: '17:00' }), ev({ id: 'antes', horaInicio: '15:50' }), ev({ id: 'cruza', horaInicio: '00:10' })])
    expect(orden.map((e) => e.id)).toEqual(['antes', 'tarde', 'cruza'])
  })

  it('#12 una parada sin duración cuenta como parada pero no entra al MTTR', () => {
    const r = resumirBitacora([
      ev({ id: 'a', pendiente: false, impacto: 'con-parada', minutosParada: 30, horaInicio: '16:00', horaTermino: '16:30' }),
      ev({ id: 'b', pendiente: false, impacto: 'con-parada', minutosParada: null, horaTermino: null }),
    ])
    expect([r.conParada, r.paradasSinDuracion, r.minutosParada, r.mttrMin]).toEqual([2, 1, 30, 30])
    const html = bitacoraAHtmlCorreo({ turno: noche16, eventos: [ev({ pendiente: false, impacto: 'con-parada', minutosParada: null, horaTermino: null })], tecnicos: [], planta: 'P' })
    expect(html).toContain('de parada (1, 1 sin duración)')
  })
})

describe('entrega de turno', () => {
  it('etiqueta corta y distancia en turnos (cruza medianoche)', () => {
    expect(etiquetaCortaTurno('2026-09-15_tarde')).toBe('Turno tarde 15-09')
    expect(etiquetaCortaTurno('2026-12-29_noche', 2027)).toBe('Turno noche 29-12-2026')
    expect(etiquetaCortaTurno('2027-01-02_dia', 2027)).toBe('Turno día 02-01')
    expect(turnosEntre('2026-09-15_tarde', noche16)).toBe(1)
    expect(turnosEntre('2026-09-15_dia', noche16)).toBe(2)
    expect(turnosEntre('basura', noche16)).toBe(0)
  })

  it('solo pendientes abiertos de turnos ANTERIORES, del más reciente al más antiguo', () => {
    const lista = pendientesAnteriores(
      [
        ev({ id: 'dia15', turnoId: '2026-09-15_dia', horaInicio: '11:40' }),
        ev({ id: 'tarde15', turnoId: '2026-09-15_tarde' }),
        ev({ id: 'mismoTurno', turnoId: '2026-09-16_noche' }),
        ev({ id: 'futuro', turnoId: '2026-09-16_dia' }),
        ev({ id: 'cerrado', turnoId: '2026-09-14_noche', pendiente: false, cierre: { tipo: 'resuelto', turnoId: '2026-09-15_dia', porNombre: 'X' } }),
        ev({ id: 'noPendiente', turnoId: '2026-09-14_noche', pendiente: false }),
      ],
      noche16,
    )
    expect(lista.map((e) => e.id)).toEqual(['tarde15', 'dia15'])
  })

  it('el origen dice turno, hora, técnico y antigüedad desde 2 turnos', () => {
    expect(origenDePendiente(ev({}), noche16)).toBe('Turno tarde 15-09 · 22:30 · Matias Serpa')
    expect(origenDePendiente(ev({ turnoId: '2026-09-15_dia', horaInicio: '11:40' }), noche16)).toBe('Turno día 15-09 · 11:40 · Matias Serpa · hace 2 turnos')
  })

  it('el evento que resuelve cuenta como pendiente cerrado y lo dice en el correo', () => {
    const origen = ev({ id: 'p1' })
    const resuelve = ev({
      id: 'r1',
      turnoId: '2026-09-16_noche',
      pendiente: false,
      tipo: 'ajuste',
      impacto: 'en-ventana',
      ventana: 'Línea sin producción',
      horaInicio: '02:10',
      horaTermino: '02:45',
      resuelvePendiente: copiaDeOrigen(origen),
    })
    expect(resumirBitacora([resuelve]).pendientesCerrados).toBe(1)
    expect(lineaImpacto(resuelve)).toBe('Ajuste · Sin detener: Línea sin producción · Cierra pendiente del Turno tarde 15-09')
    const html = bitacoraAHtmlCorreo({ turno: noche16, eventos: [resuelve], tecnicos: [], planta: 'Planta Chonchi' })
    expect(html).toContain('pendiente cerrado')
    // Sin pendientes cerrados no se agrega la celda (no ensucia el correo).
    expect(bitacoraAHtmlCorreo({ turno: noche16, eventos: [ev({ pendiente: false, turnoId: noche16.id })], tecnicos: [], planta: 'P' })).not.toContain('pendiente cerrado')
  })

  it('lista al final lo que sigue abierto de turnos anteriores, escapado', () => {
    const abierto = ev({ id: 'k', equipo: 'KNURO N1', descripcion: 'Pusher <irregular>', turnoId: '2026-09-15_dia', registradoPor: 'Leandro Igor' })
    const datos = { turno: noche16, eventos: [], tecnicos: [], planta: 'Planta Chonchi', pendientesAnteriores: [abierto] }
    const html = bitacoraAHtmlCorreo(datos)
    expect(html).toContain('Sigue pendiente de turnos anteriores')
    expect(html).toContain('KNURO N1 · Pusher &lt;irregular&gt; · desde Turno día 15-09 (Leandro Igor)')
    expect(bitacoraATextoPlano(datos)).toContain('SIGUE PENDIENTE DE TURNOS ANTERIORES\n\n- KNURO N1 · Pusher <irregular> · desde Turno día 15-09 (Leandro Igor)')
  })
})
