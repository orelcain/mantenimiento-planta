import { describe, expect, it } from 'vitest'
import { horaExtraDelTurno } from '../horaExtra'

describe('horaExtraDelTurno', () => {
  it('separa la cola después del horario (Chonchi 11-11 T2: 16.855 en horario + 2.195 hasta 15:55)', () => {
    const r = horaExtraDelTurno({
      outsideRanges: [{ from: '2026-11-11T15:00:00.000Z', to: '2026-11-11T15:55:00.000Z', pieces: 2195, kind: 'despues' }],
    }, 19050)
    expect(r).toEqual({ despues: { piezas: 2195, desde: '2026-11-11T15:00:00.000Z', hasta: '2026-11-11T15:55:00.000Z' }, antes: 0, enHorario: 16855 })
  })

  it('el arranque anticipado se informa aparte y no es hora extra', () => {
    const r = horaExtraDelTurno({
      outsideRanges: [{ from: '2026-11-15T22:10:00.000Z', to: '2026-11-16T00:00:00.000Z', pieces: 2384, kind: 'antes' }],
    }, 10000)
    expect(r?.despues).toBeNull()
    expect(r?.antes).toBe(2384)
    expect(r?.enHorario).toBe(7616)
  })

  it('varios tramos después: suma y toma la primera y la última hora', () => {
    const r = horaExtraDelTurno({
      outsideRanges: [
        { from: '2026-11-05T15:40:00.000Z', to: '2026-11-05T16:10:00.000Z', pieces: 30, kind: 'despues' },
        { from: '2026-11-05T15:00:00.000Z', to: '2026-11-05T15:20:00.000Z', pieces: 80, kind: 'despues' },
      ],
    }, 1000)
    expect(r?.despues).toEqual({ piezas: 110, desde: '2026-11-05T15:00:00.000Z', hasta: '2026-11-05T16:10:00.000Z' })
    expect(r?.enHorario).toBe(890)
  })

  it('sin piezas fuera del horario no dice nada', () => {
    expect(horaExtraDelTurno({ outsideRanges: [] }, 500)).toBeNull()
    expect(horaExtraDelTurno({}, 500)).toBeNull()
    expect(horaExtraDelTurno({ outsideRanges: [{ from: 'a', to: 'b', pieces: 0, kind: 'despues' }] }, 500)).toBeNull()
  })
})
