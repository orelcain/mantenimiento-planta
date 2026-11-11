import { describe, expect, it } from 'vitest'
import { formatoValorCompacto, resumenStock, type FilaResumenStock } from '../resumenStock'

type Fila = FilaResumenStock & { comun?: boolean }
const f = (stockStatus: Fila['stockStatus'], extra: Partial<Fila> = {}): Fila => ({ stockStatus, ...extra })
const esComun = (r: Fila) => !!r.comun

describe('resumenStock', () => {
  it('cuenta por estado y el total', () => {
    const r = resumenStock([f('ok'), f('ok'), f('low'), f('out'), f('unset')], esComun)
    expect(r).toMatchObject({ total: 5, ok: 2, low: 1, out: 1, unset: 1, comunSinStock: 0, valor: 0 })
  })

  it('común sin stock = común y agotado', () => {
    const r = resumenStock([f('out', { comun: true }), f('out'), f('ok', { comun: true }), f('low', { comun: true })], esComun)
    expect(r.comunSinStock).toBe(1)
    expect(r.out).toBe(2)
  })

  it('valor = (costoCompra ?? valorUnitario ?? 0) × stock', () => {
    const r = resumenStock([
      f('ok', { costoCompra: 1000, valorUnitario: 5, stockActual: 3 }),
      f('ok', { valorUnitario: 200, stockActual: 2 }),
      f('out', { valorUnitario: 900, stockActual: 0 }),
      f('unset'),
    ], esComun)
    expect(r.valor).toBe(3400)
  })

  it('sin filas da ceros', () => {
    expect(resumenStock([], esComun)).toEqual({ total: 0, ok: 0, low: 0, out: 0, unset: 0, comunSinStock: 0, valor: 0 })
  })
})

describe('formatoValorCompacto', () => {
  it('formatea millones, miles y pesos', () => {
    expect(formatoValorCompacto(1_234_567)).toBe('$1,2 M')
    expect(formatoValorCompacto(559_000)).toBe('$559 mil')
    expect(formatoValorCompacto(850)).toBe('$850')
    expect(formatoValorCompacto(12_000_000)).toBe('$12 M')
  })
  it('vacío si es 0 o inválido', () => {
    expect(formatoValorCompacto(0)).toBe('')
    expect(formatoValorCompacto(NaN)).toBe('')
  })
})
