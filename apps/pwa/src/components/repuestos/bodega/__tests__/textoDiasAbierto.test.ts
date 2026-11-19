/**
 * Cuánto lleva abierto un inventario en curso, en la franja de Bodega.
 * Fechas locales (new Date(año, mes-1, día)): una cadena ISO se corre un día en UTC-3.
 */
import { describe, it, expect } from 'vitest'
import { textoDiasAbierto } from '@/components/repuestos/bodega/LineaInventarioEnCurso'

const DIA = 86_400_000
const ahora = new Date(2026, 10, 19, 12, 0) // 19-11-2026, mediodía

describe('textoDiasAbierto', () => {
  it('0 días → «desde hoy»', () => {
    expect(textoDiasAbierto(new Date(ahora.getTime()), ahora)).toBe('desde hoy')
  })

  it('1 día → «hace 1 día»', () => {
    expect(textoDiasAbierto(new Date(ahora.getTime() - DIA), ahora)).toBe('hace 1 día')
  })

  it('54 días → «hace 54 días»', () => {
    expect(textoDiasAbierto(new Date(ahora.getTime() - 54 * DIA), ahora)).toBe('hace 54 días')
  })
})
