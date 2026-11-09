import { describe, expect, it } from 'vitest'
import type { Acr, AccionAcr } from '../acr.types'
import type { ResumenJK } from '@/services/shoplogix/jackKnife'
import {
  agruparHistorial,
  equiposDe,
  fechaVerificacion,
  fuerzaMaxima,
  resumenAcrPorCausa,
  sugerirCausaJK,
  tieneAccionFuerteHecha,
  verificacionVencida,
  type FiltrosAcr,
} from '../acrHistorial'

const SIN_FILTROS: FiltrosAcr = { equipo: null, dias: null, estado: null, fuerza: null }

const accion = (fuerza: AccionAcr['fuerza'], estado: AccionAcr['estado'] = 'pendiente'): AccionAcr => ({
  id: `a-${fuerza}-${estado}`,
  texto: 'x',
  fuerza,
  causaId: null,
  responsable: '',
  fechaLimite: null,
  estado,
  hechaEn: null,
})

const acr = (over: Partial<Acr>): Acr =>
  ({
    id: 'acr-x',
    version: 2,
    plantId: 'chonchi',
    eventoBitacoraIds: [],
    equipo: 'EVISCERADORA BAADER 142 N1',
    fechaTurno: '2026-09-24',
    definicion: '',
    minutosDetencion: 7,
    evidencias: [],
    piezaGuardada: false,
    causas: [],
    acciones: [],
    verificacion: { criterio: 'Sin repetir', dias: 30, resultado: 'pendiente' },
    estado: 'cerrado',
    createdBy: '',
    createdByNombre: '',
    createdAt: new Date(2026, 8, 24),
    updatedAt: new Date(2026, 8, 24),
    ...over,
  }) as Acr

const resumen = (eventos: [string, number, number][]): ResumenJK => ({
  v: 1,
  eventos,
  sinImputar: [],
  sinImputarLinea: [],
  comentarios: [],
  conCausaMin: 0,
  sinCausaMin: 0,
  uptimeMin: 480,
})

describe('fechas de verificación', () => {
  it('vence fecha del turno + días, sin zona horaria', () => {
    expect(fechaVerificacion(acr({ fechaTurno: '2026-09-24' }))).toBe('2026-10-24')
    expect(fechaVerificacion(acr({ fechaTurno: '2026-12-15', verificacion: { criterio: '', dias: 60, resultado: 'pendiente' } }))).toBe('2027-02-13')
  })

  it('vencida el día justo después del vencimiento y no el mismo día', () => {
    const a = acr({ fechaTurno: '2026-09-24' })
    expect(verificacionVencida(a, '2026-10-24')).toBe(false)
    expect(verificacionVencida(a, '2026-10-25')).toBe(true)
  })

  it('un borrador nunca está vencido', () => {
    expect(verificacionVencida(acr({ estado: 'borrador', fechaTurno: '2026-01-01' }), '2026-12-31')).toBe(false)
  })
})

describe('agruparHistorial', () => {
  const borrador = acr({ id: 'b', estado: 'borrador', fechaTurno: '2026-11-01' })
  const vencida = acr({ id: 'v', fechaTurno: '2026-01-05', equipo: 'BAADER 200' })
  const reciente = acr({ id: 'r', fechaTurno: '2026-11-03', acciones: [accion('fuerte', 'hecha')] })
  const antiguo = acr({ id: 'o', fechaTurno: '2026-02-01', verificacion: { criterio: '', dias: 30, resultado: 'eficaz' } })
  const todos = [antiguo, reciente, vencida, borrador]

  it('reparte cada ACR en un solo grupo', () => {
    const g = agruparHistorial(todos, SIN_FILTROS, '2026-11-08')
    expect(g.porCerrar.map((a) => a.id)).toEqual(['b'])
    expect(g.vencidas.map((a) => a.id)).toEqual(['v'])
    expect(g.historial.map((a) => a.id)).toEqual(['r', 'o'])
  })

  it('cada grupo va por fecha de turno descendente', () => {
    const g = agruparHistorial(todos, SIN_FILTROS, '2026-11-08')
    expect(g.historial.map((a) => a.fechaTurno)).toEqual(['2026-11-03', '2026-02-01'])
  })

  it('dias filtra solo el historial: lo vencido no se esconde por período', () => {
    const g = agruparHistorial(todos, { ...SIN_FILTROS, dias: 30 }, '2026-11-08')
    expect(g.vencidas.map((a) => a.id)).toEqual(['v'])
    expect(g.historial.map((a) => a.id)).toEqual(['r'])
    expect(g.porCerrar.map((a) => a.id)).toEqual(['b'])
  })

  it('equipo y estado filtran los tres grupos', () => {
    const porEquipo = agruparHistorial(todos, { ...SIN_FILTROS, equipo: 'BAADER 200' }, '2026-11-08')
    expect(porEquipo.vencidas.map((a) => a.id)).toEqual(['v'])
    expect(porEquipo.porCerrar).toEqual([])
    const porEstado = agruparHistorial(todos, { ...SIN_FILTROS, estado: 'borrador' }, '2026-11-08')
    expect(porEstado.porCerrar.map((a) => a.id)).toEqual(['b'])
    expect(porEstado.vencidas).toEqual([])
    expect(porEstado.historial).toEqual([])
  })

  it('fuerza filtra por la fuerza máxima de cada ACR', () => {
    const g = agruparHistorial(todos, { ...SIN_FILTROS, fuerza: 'fuerte' }, '2026-11-08')
    expect(g.historial.map((a) => a.id)).toEqual(['r'])
  })
})

describe('fuerza y causa', () => {
  it('fuerzaMaxima toma la más alta; null sin acciones', () => {
    expect(fuerzaMaxima(acr({ acciones: [accion('debil'), accion('fuerte'), accion('media')] }))).toBe('fuerte')
    expect(fuerzaMaxima(acr({ acciones: [] }))).toBeNull()
  })

  it('tieneAccionFuerteHecha exige fuerza fuerte y estado hecha', () => {
    expect(tieneAccionFuerteHecha(acr({ acciones: [accion('fuerte', 'pendiente')] }))).toBe(false)
    expect(tieneAccionFuerteHecha(acr({ acciones: [accion('media', 'hecha')] }))).toBe(false)
    expect(tieneAccionFuerteHecha(acr({ acciones: [accion('fuerte', 'hecha')] }))).toBe(true)
  })

  it('resumenAcrPorCausa cuenta solo causas de texto', () => {
    const mapa = resumenAcrPorCausa([
      acr({ id: '1', causaJK: 'Lógica', acciones: [accion('fuerte', 'hecha')] }),
      acr({ id: '2', causaJK: 'Lógica' }),
      acr({ id: '3', causaJK: null }),
      acr({ id: '4' }),
    ])
    expect(mapa.size).toBe(1)
    expect(mapa.get('Lógica')).toMatchObject({ total: 2, fuertesHechas: 1 })
    expect(mapa.get('Lógica')!.acrs.map((a) => a.id)).toEqual(['1', '2'])
  })

  it('equiposDe devuelve los equipos distintos, ordenados', () => {
    expect(equiposDe([acr({ equipo: 'BAADER 200' }), acr({ equipo: 'CINTA PRISMA' }), acr({ equipo: 'BAADER 200' })])).toEqual([
      'BAADER 200',
      'CINTA PRISMA',
    ])
  })
})

describe('sugerirCausaJK', () => {
  it('evisceradora con «resorte» en el texto: Pernos / Resortes, con el evento del turno como candidato', () => {
    const s = sugerirCausaJK(
      { equipo: 'EVISCERADORA BAADER 142 N1', texto: 'Se corta resorte ingreso chapaleta', minutos: 7 },
      [resumen([['Pernos / Resortes', 1, 8]])],
    )
    expect(s.sugerida).toBe('Pernos / Resortes')
    expect(s.fueraDelGrafico).toBe(false)
    expect(s.candidatos[0]).toEqual({ causa: 'Pernos / Resortes', eventos: 1, minutos: 8 })
  })

  it('la sugerida va primero aunque ese día no tenga eventos de esa causa', () => {
    const s = sugerirCausaJK(
      { equipo: 'EVISCERADORA BAADER 142 N1', texto: 'Se corta resorte', minutos: 7 },
      [resumen([['Lógica', 1, 40]])],
    )
    expect(s.candidatos[0]).toEqual({ causa: 'Pernos / Resortes', eventos: 0, minutos: 0 })
    expect(s.candidatos[1]).toEqual({ causa: 'Lógica', eventos: 1, minutos: 40 })
  })

  it('BAADER 200 queda fuera del gráfico, sin causa sugerida', () => {
    const delDia = [{ eventos: [['Lógica', 0, 8]] }] as never
    const s = sugerirCausaJK({ equipo: 'BAADER 200', texto: 'Se cortan resortes alimentacion', minutos: 6 }, delDia)
    expect(s.sugerida).toBeNull()
    expect(s.fueraDelGrafico).toBe(true)
    expect(s.candidatos).toEqual([])
  })

  it('CINTA gana a BAADER 142: es Cintas', () => {
    const s = sugerirCausaJK({ equipo: 'CINTA PRISMA INTERIOR Y EXTERIOR BAADER 142', texto: 'Se detiene', minutos: 4 }, [])
    expect(s.sugerida).toBe('Cintas')
    expect(s.fueraDelGrafico).toBe(false)
  })

  it('un equipo sin regla no sugiere nada y no queda fuera del gráfico', () => {
    const s = sugerirCausaJK({ equipo: 'COMPRESOR AIRE N1', texto: 'Baja presión', minutos: 12 }, [resumen([['Bombas', 1, 10], ['Lógica', 2, 13]])])
    expect(s.sugerida).toBeNull()
    expect(s.fueraDelGrafico).toBe(false)
    expect(s.candidatos.map((c) => c.causa)).toEqual(['Lógica', 'Bombas'])
  })

  it('máximo 3 candidatos', () => {
    const s = sugerirCausaJK({ equipo: 'COMPRESOR', texto: '', minutos: 5 }, [
      resumen([['Bombas', 1, 1], ['Lógica', 2, 2], ['Motores', 3, 3], ['Correas', 4, 4]]),
    ])
    expect(s.candidatos).toHaveLength(3)
  })
})
