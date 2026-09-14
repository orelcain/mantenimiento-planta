import { describe, it, expect } from 'vitest'
import { cantidadDePosicion, contarSinCantidad } from '../cantidadDePosicion'
import { buildBomIB01 } from '@/utils/repuestos/exportBomSAP'
import type { Repuesto } from '@/types/repuestos'

describe('cantidadDePosicion', () => {
  it('un número positivo es cantidad real', () => {
    expect(cantidadDePosicion(6)).toEqual({ real: true, cantidad: 6 })
    expect(cantidadDePosicion(0.5)).toEqual({ real: true, cantidad: 0.5 })
  })

  it('cero NO es una cantidad: el cilindro 3300138386 decía «×0» en verde', () => {
    expect(cantidadDePosicion(0)).toEqual({ real: false, cantidad: 1 })
  })

  it('ausente, nulo, negativo o basura: sin cantidad, sale como 1', () => {
    for (const v of [undefined, null, -2, NaN, '', '  ', 'abc', true]) {
      expect(cantidadDePosicion(v)).toEqual({ real: false, cantidad: 1 })
    }
  })

  it('un texto numérico del import cuenta como el número', () => {
    expect(cantidadDePosicion('4')).toEqual({ real: true, cantidad: 4 })
  })

  it('cuenta las posiciones sin cantidad', () => {
    expect(contarSinCantidad([{ cantidadPorMaquina: 2 }, { cantidadPorMaquina: 0 }, {}])).toBe(2)
  })
})

describe('la pantalla, el PDF y el Excel de SAP dicen lo mismo', () => {
  it('lo que la pantalla marca «sin cant.» es exactamente lo que el Excel cuenta y sube como 1', () => {
    const valores = [3, 0, undefined, 1, -1]
    const reps = valores.map((v, i) => ({ id: `r${i}`, codigoSAP: `330000000${i}`, textoBreve: 'X', cantidadPorMaquina: v }) as unknown as Repuesto)
    const bom = buildBomIB01(reps, { equipoCodigo: '720013104', equipoNombre: 'KNURO N1', centro: 'CL04' })
    expect(bom.resumen.sinCantidadReal).toBe(contarSinCantidad(reps))
    expect(bom.rows.map((r) => r.cantidad)).toEqual(valores.map((v) => cantidadDePosicion(v).cantidad))
  })
})
