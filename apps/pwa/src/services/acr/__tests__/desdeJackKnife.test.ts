import { describe, expect, it } from 'vitest'
import type { TurnoJK } from '@/services/shoplogix/jackKnife'
import type { Acr } from '../acr.types'
import {
  detencionesDeCausa,
  esEventoJK,
  eventoDesdeDetencion,
  eventoRefDesdeAcr,
} from '../desdeJackKnife'

function turno(id: string, dateKey: string, eventos: [string, number, number][], comentarios: [string, number, string][] = []): TurnoJK {
  return {
    id,
    dateKey,
    shiftId: id.endsWith('dia') ? 'dia' : 'noche',
    resumen: {
      v: 1,
      eventos,
      sinImputar: [],
      sinImputarLinea: [],
      comentarios,
      conCausaMin: 0,
      sinCausaMin: 0,
      uptimeMin: 480,
    },
  }
}

const TURNOS: TurnoJK[] = [
  turno('2026-09-20_dia', '2026-09-20', [['Empaquetadura Rota', 1000, 30], ['Atasco', 5000, 10]], [['Empaquetadura Rota', 1030, 'Cambio empaquetadura']]),
  turno('2026-09-21_noche', '2026-09-21', [['Empaquetadura Rota', 9000, 134]], [['Empaquetadura Rota', 9000 + 90_000, 'Fuera de rango']]),
  turno('2026-09-22_dia', '2026-09-22', [['Empaquetadura Rota', 2000, 50]], [['Empaquetadura Rota', 2000 + 59_999, 'Justo en el borde']]),
  turno('2026-09-23_dia', '2026-09-23', [['Empaquetadura Rota', 3000, 50]], []),
]

describe('esEventoJK', () => {
  it('reconoce el prefijo jk:', () => {
    expect(esEventoJK('jk:chonchi:2026-09-20_dia:1000')).toBe(true)
    expect(esEventoJK('abc123')).toBe(false)
  })
})

describe('detencionesDeCausa', () => {
  it('toma solo la causa dentro del rango de turnos, incluidos los extremos', () => {
    const d = detencionesDeCausa(TURNOS, 0, 1, 'Empaquetadura Rota')
    expect(d.map((x) => x.turnoId)).toEqual(['2026-09-21_noche', '2026-09-20_dia'])
    expect(d.every((x) => x.dateKey !== '2026-09-22')).toBe(true)
  })

  it('ordena por minutos, de la más larga a la más corta', () => {
    const d = detencionesDeCausa(TURNOS, 0, 3, 'Empaquetadura Rota')
    expect(d.map((x) => x.min)).toEqual([134, 50, 50, 30])
  })

  it('toma el comentario solo si su inicio está a menos de 60 s', () => {
    const d = detencionesDeCausa(TURNOS, 0, 3, 'Empaquetadura Rota')
    const porInicio = Object.fromEntries(d.map((x) => [x.inicioMs, x.comentario]))
    expect(porInicio[9000]).toBeNull()
    expect(porInicio[1000]).toBe('Cambio empaquetadura')
    expect(porInicio[2000]).toBe('Justo en el borde')
    expect(porInicio[3000]).toBeNull()
  })

  it('ignora otras causas y devuelve lista vacía si no hay detenciones', () => {
    expect(detencionesDeCausa(TURNOS, 0, 3, 'Sin esta causa')).toEqual([])
    expect(detencionesDeCausa(TURNOS, 0, 3, 'Atasco').map((x) => x.min)).toEqual([10])
  })
})

describe('eventoDesdeDetencion y eventoRefDesdeAcr', () => {
  it('arma el id jk: y lo reconstruye igual desde el ACR', () => {
    const [d] = detencionesDeCausa(TURNOS, 1, 1, 'Empaquetadura Rota')
    expect(d).toBeDefined()
    const ev = eventoDesdeDetencion('chonchi', d!, 'Empaquetadura Rota')
    expect(ev).toEqual({
      id: 'jk:chonchi:2026-09-21_noche:9000',
      tipo: 'correctivo',
      turnoId: '2026-09-21_noche',
      fechaTurno: '2026-09-21',
      equipo: 'Empaquetadura Rota',
      descripcion: '',
      minutosParada: 134,
      fotos: [],
    })

    const acr = {
      id: 'a1',
      equipo: ev.equipo,
      fechaTurno: ev.fechaTurno,
      definicion: 'Se rompe la empaquetadura',
      minutosDetencion: 134,
      eventoBitacoraIds: [ev.id],
    } as unknown as Acr
    const vuelta = eventoRefDesdeAcr(acr)
    expect(vuelta.id).toBe(ev.id)
    expect(vuelta.turnoId).toBe('2026-09-21_noche')
    expect(vuelta.fechaTurno).toBe('2026-09-21')
    expect(vuelta.equipo).toBe('Empaquetadura Rota')
    expect(vuelta.descripcion).toBe('Se rompe la empaquetadura')
    expect(vuelta.minutosParada).toBe(134)
    expect(vuelta.tipo).toBe('correctivo')
    expect(vuelta.fotos).toEqual([])
  })

  it('redondea los minutos y no deja ningún campo undefined', () => {
    const ev = eventoDesdeDetencion('chonchi', { turnoId: 't', dateKey: 'd', shiftId: 's', inicioMs: 1, min: 12.4, comentario: null }, 'C')
    expect(ev.minutosParada).toBe(12)
    expect(Object.values(ev).includes(undefined)).toBe(false)
  })
})
