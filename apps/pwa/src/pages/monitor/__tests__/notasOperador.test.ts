/**
 * Las notas del piso.
 *
 * ⚠ Lo que se protege acá es que no se pierda lo que el operador escribió. La
 * bitácora completa se borró del monitor porque repetía las notas que ya salen
 * pegadas a su causa — pero DOS de los últimos 8 turnos de Filete tenían
 * anotaciones que no colgaban de ninguna parada, y una era una falla mecánica:
 * el 07-08, «Se abren guías de bronce baader 200».
 */
import { describe, it, expect } from 'vitest'
import { notasDelTurno, notasPorCausa } from '../notasOperador'

/** Caso real: Filete, 07-08. Los dos comentarios cubren el turno entero. */
const DEL_07_08 = [
  { f: '2026-08-07T07:45:00.000Z', h: '2026-08-07T15:30:00.000Z', r: 'FALLA OPERACIONAL', t: 'retraso ingreso personal' },
  { f: '2026-08-07T07:45:00.000Z', h: '2026-08-07T15:30:00.000Z', r: 'Baader 200/PERNOS/RESORTES', t: 'Se abren guías de bronce baader 200' },
]

describe('notasDelTurno', () => {
  it('⚠ rescata las que cubren el turno entero: antes se descartaban', () => {
    const n = notasDelTurno(DEL_07_08)
    expect(n).toHaveLength(2)
    expect(n[1]).toBe('«Se abren guías de bronce baader 200» — Baader 200/PERNOS/RESORTES')
  })

  it('la causa va FUERA de las comillas: no la escribió el operador', () => {
    expect(notasDelTurno([{ ...DEL_07_08[0]!, r: null }])[0]).toBe('«retraso ingreso personal»')
  })

  it('una nota de una parada concreta NO entra acá: ya sale en su causa', () => {
    const corta = [{ f: '2026-08-14T12:43:00.000Z', h: '2026-08-14T13:28:00.000Z', r: 'AGUA', t: 'Falla abastecimiento agua dulce' }]
    expect(notasDelTurno(corta)).toEqual([])
    expect(notasPorCausa(corta, (iso) => iso.slice(11, 16)).get('AGUA')).toHaveLength(1)
  })

  it('el mismo texto repetido se muestra una vez', () => {
    expect(notasDelTurno([DEL_07_08[0]!, DEL_07_08[0]!])).toHaveLength(1)
  })

  it('sin comentarios no inventa una línea', () => {
    expect(notasDelTurno(undefined)).toEqual([])
    expect(notasDelTurno([{ f: '2026-08-07T07:45:00.000Z', h: '2026-08-07T15:30:00.000Z', r: null, t: '  ' }])).toEqual([])
  })
})
