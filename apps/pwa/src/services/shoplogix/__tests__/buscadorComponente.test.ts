import { describe, it, expect } from 'vitest'
import fixture from './fixtures/jk-chonchi-expulsador.json'
import { prepararTurnos, type ResumenJK, type TurnoCrudo, type TurnoJK } from '../jackKnife'
import {
  antesDespues,
  buscarComponente,
  cambiosSinAviso,
  fechaDeCambio,
  terminosDe,
} from '../buscadorComponente'

/** El fixture trae `{id, jackKnife}`: dateKey y shiftId salen del id, como en `cargarTurnosCrudos`. */
const crudos: TurnoCrudo[] = (fixture as { id: string; jackKnife: ResumenJK }[]).map((t) => {
  const [dateKey, shiftId] = t.id.split('_')
  return { id: t.id, dateKey: dateKey!, shiftId: shiftId!, jackKnife: t.jackKnife }
})
const { turnos } = prepararTurnos(crudos)

describe('terminosDe', () => {
  it('expande «expulsador» con sus sinónimos, sin tildes ni mayúsculas', () => {
    expect(terminosDe('Expulsador')).toEqual(['expulsador', 'expulsado', 'pulsador', 'empujador'])
  })
  it('una consulta fuera de la tabla es su propio término', () => {
    expect(terminosDe('  Bomba  ')).toEqual(['bomba'])
  })
  it('consulta vacía no busca nada', () => {
    expect(terminosDe('   ')).toEqual([])
  })
})

describe('buscarComponente · golden «expulsador» (Chonchi, 10 turnos reales)', () => {
  const r = buscarComponente(turnos, [], 'expulsador')

  it('16 detenciones, 270 min redondeados, 6 turnos con detención', () => {
    expect(r.totalDetenciones).toBe(16)
    expect(Math.round(r.totalMin)).toBe(270)
    expect(r.turnosConDetencion).toBe(6)
  })

  it('1 comentario sin detención: 21-10 Turno 1 (Lógica)', () => {
    expect(r.comentariosSinDetencion).toBe(1)
    const sinDet = r.filas.filter((f) => f.detenciones.length === 0 && f.comentarios.length > 0)
    expect(sinDet.map((f) => f.turnoId)).toEqual(['2026-10-21_Turno 1'])
  })

  it('«aparece en»: Knuro 5 turnos, Lógica 2, Pernos / Resortes 1', () => {
    const mapa = Object.fromEntries(r.causas.map((c) => [c.causa, c.turnos]))
    expect(mapa).toEqual({ Knuro: 5, Lógica: 2, 'Pernos / Resortes': 1 })
  })

  it('la fila del 01-10 tiene 7 detenciones y 16 min (Knuro)', () => {
    const f = r.filas.find((x) => x.turnoId === '2026-10-01_Turno 2')!
    expect(f.detenciones).toHaveLength(7)
    expect(Math.round(f.detenciones.reduce((s, d) => s + d[2], 0))).toBe(16)
  })
})

describe('antesDespues · cambio del 23-11', () => {
  const r = buscarComponente(turnos, [], 'expulsador')

  it('la fecha de cambio es el último comentario «cambi» (23-11)', () => {
    expect(fechaDeCambio(r.filas)).toBe('2026-11-23')
  })

  it('antes 5 turnos · 135 min (incluye el del cambio y el 21-10); después 2 turnos · 135 min', () => {
    const ad = antesDespues(r.filas, '2026-11-23', 0)
    expect(ad.antes).toEqual({ turnos: 5, min: expect.any(Number) })
    expect(Math.round(ad.antes.min)).toBe(135)
    expect(ad.despues.turnos).toBe(2)
    expect(Math.round(ad.despues.min)).toBe(135)
  })

  it('sin 30 turnos con producción después no hay veredicto', () => {
    expect(antesDespues(r.filas, '2026-11-23', 2).veredicto).toBeNull()
  })
})

describe('cambiosSinAviso · fixture', () => {
  it('4 cambios sin aviso: 01-10 Lógica, 22-10 Pernos, 04-11 Correas, 23-11 Knuro', () => {
    const lista = cambiosSinAviso(turnos, [])
    expect(lista.map((c) => c.dateKey)).toEqual(['2026-10-01', '2026-10-22', '2026-11-04', '2026-11-23'])
    expect(lista.map((c) => c.causa)).toEqual(['Lógica', 'Pernos / Resortes', 'Correas', 'Knuro'])
  })
})

describe('regla del cruce · distancia a la detención (sintético)', () => {
  const T0 = Date.UTC(2026, 10, 20, 12, 0)
  const turno = (comentarioMs: number, causaComentario = 'Knuro'): TurnoJK => ({
    id: '2026-11-20_Turno 1',
    dateKey: '2026-11-20',
    shiftId: 'Turno 1',
    resumen: {
      v: 1,
      eventos: [['Knuro', T0, 5]],
      sinImputar: [],
      sinImputarLinea: [],
      comentarios: [[causaComentario, comentarioMs, 'expulsador trabado']],
      conCausaMin: 5,
      sinCausaMin: 0,
      uptimeMin: 600,
    },
  })

  it('comentario a 20 min del inicio cuenta la detención', () => {
    const r = buscarComponente([turno(T0 - 20 * 60_000)], [], 'expulsador')
    expect(r.totalDetenciones).toBe(1)
  })

  it('comentario a 40 min no cuenta: queda sin detención', () => {
    const r = buscarComponente([turno(T0 - 40 * 60_000)], [], 'expulsador')
    expect(r.totalDetenciones).toBe(0)
    expect(r.comentariosSinDetencion).toBe(1)
  })

  it('misma detención no se cuenta dos veces si dos comentarios la nombran', () => {
    const t = turno(T0 + 60_000)
    t.resumen.comentarios.push(['Knuro', T0 + 120_000, 'expulsador trabado'])
    const r = buscarComponente([t], [], 'expulsador')
    expect(r.totalDetenciones).toBe(1)
  })

  it('causa distinta no se asigna aunque esté cerca', () => {
    const r = buscarComponente([turno(T0, 'Lógica')], [], 'expulsador')
    expect(r.totalDetenciones).toBe(0)
  })
})
