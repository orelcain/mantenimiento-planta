import { describe, it, expect } from 'vitest'
import { ultimaCargaDateKey, dateKeyDdMm } from '../graderUltimaCarga'

describe('ultimaCargaDateKey', () => {
  it('devuelve el dateKey más reciente con piezas', () => {
    expect(ultimaCargaDateKey([
      { dateKey: '2026-09-03', totalPieces: 100 },
      { dateKey: '2026-09-12', totalPieces: 50 },
      { dateKey: '2026-09-08', totalPieces: 10 },
    ])).toBe('2026-09-12')
  })
  it('ignora resúmenes sin piezas', () => {
    expect(ultimaCargaDateKey([
      { dateKey: '2026-09-20', totalPieces: 0 },
      { dateKey: '2026-09-05', totalPieces: 7 },
    ])).toBe('2026-09-05')
  })
  it('null si no hay ninguno', () => {
    expect(ultimaCargaDateKey([])).toBeNull()
    expect(ultimaCargaDateKey([{ dateKey: '2026-09-20', totalPieces: 0 }])).toBeNull()
  })
})

describe('dateKeyDdMm', () => {
  it('formatea dd-mm', () => expect(dateKeyDdMm('2026-09-12')).toBe('12-09'))
})
