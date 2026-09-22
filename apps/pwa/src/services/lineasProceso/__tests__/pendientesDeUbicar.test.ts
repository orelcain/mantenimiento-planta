import { describe, expect, it } from 'vitest'
import { claveDeNombre, pendientesDeUbicar } from '../pendientesDeUbicar'
import type { EventoBitacora } from '@/services/bitacora/bitacora.types'

/**
 * El caso real (Orel, 21-09-2026): un técnico escribió «baader 143» —no le atinó a la
 * búsqueda— y era la BAADER 142 N1, que sí existe. El evento quedó sin `equipoId` y nadie se
 * enteró hasta intentar ubicarlo en el diagrama.
 */
const ev = (p: Partial<EventoBitacora>): EventoBitacora =>
  ({
    id: 'e',
    plantId: 'chonchi',
    turnoId: '2026-09-21_noche',
    fechaTurno: '2026-09-21',
    banda: 'noche',
    tipo: 'correctivo',
    equipo: 'baader 143',
    equipoId: null,
    equipoCodigo: null,
    descripcion: 'cuchillo trabado',
    pendiente: false,
    fotos: [],
    ...p,
  }) as EventoBitacora

const conocidos = ['EVISCERADORA BAADER 142 N1', 'EVISCERADORA BAADER 142 N2', 'Cinta larga grader']

describe('pendientesDeUbicar', () => {
  it('agrupa por nombre normalizado y cuenta los eventos', () => {
    const lista = pendientesDeUbicar(
      [ev({ id: '1', equipo: 'baader 143' }), ev({ id: '2', equipo: 'BAADER  143 ', fechaTurno: '2026-09-18' }), ev({ id: '3', equipo: 'Sala de bombas NH3' })],
      { nombresConocidos: conocidos },
    )
    expect(lista.map((g) => [g.clave, g.eventos.length])).toEqual([
      ['baader 143', 2],
      ['sala de bombas nh3', 1],
    ])
  })

  it('el que más se repite va primero; el nombre es como lo escribieron la última vez', () => {
    const lista = pendientesDeUbicar(
      [ev({ id: '1', equipo: 'baader 143', fechaTurno: '2026-09-18' }), ev({ id: '2', equipo: 'Baader 143', fechaTurno: '2026-09-21' }), ev({ id: '3', equipo: 'Tolva' })],
      { nombresConocidos: [] },
    )
    expect(lista[0]?.nombre).toBe('Baader 143')
    expect(lista[0]?.ultimo).toBe('2026-09-21')
    expect(lista[0]?.eventos.map((e) => e.id)).toEqual(['2', '1'])
  })

  it('lo que ya está ligado al árbol no se lista, aunque el nombre no calce', () => {
    const lista = pendientesDeUbicar([ev({ equipoId: 'n1', equipo: 'nombre raro' })], { nombresConocidos: [] })
    expect(lista).toEqual([])
  })

  it('lo que calza con el árbol o con un manual del diagrama no se lista', () => {
    const lista = pendientesDeUbicar(
      [ev({ id: '1', equipo: 'Eviscerador​a baader 142 n1'.replace('​', '') }), ev({ id: '2', equipo: 'CINTA LARGA GRADER' })],
      { nombresConocidos: conocidos },
    )
    expect(lista).toEqual([])
  })

  it('«no es un equipo» lo saca de la bandeja, y no vuelve', () => {
    const lista = pendientesDeUbicar([ev({ equipo: 'Sala de bombas NH3' })], {
      nombresConocidos: [],
      descartados: [claveDeNombre('sala de bombas nh3')],
    })
    expect(lista).toEqual([])
  })

  it('sin nombre, o «Sin equipo», no hay nada que ubicar', () => {
    const lista = pendientesDeUbicar([ev({ equipo: '' }), ev({ equipo: 'Sin equipo' }), ev({ equipo: '   ' })], { nombresConocidos: [] })
    expect(lista).toEqual([])
  })
})

describe('claveDeNombre', () => {
  it('sin tildes, sin dobles espacios, en minúscula', () => {
    expect(claveDeNombre('  Tolva  RIÑONES ')).toBe('tolva rinones')
  })
})
