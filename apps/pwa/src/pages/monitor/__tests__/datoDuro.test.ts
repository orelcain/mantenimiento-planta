/**
 * Derivados del dato duro (buckets de 1 min) — media 15, piezas por máquina
 * y la hora en curso. Nacen del careo del 29-08: la media de 5 min decía
 * 26,3 con la línea a 33,1 reales.
 */
import { describe, expect, it } from 'vitest'
import { media15DelDuro, piezasDelDuro, horaEnCursoDelDuro } from '../datoDuro'
import type { PulsoMonitor } from '@/services/shoplogix/publicShiftMonitor.service'

const pulso = (p: Partial<PulsoMonitor>): PulsoMonitor => ({
  at: '2026-08-29T13:00:00.000Z', totalCycles: 0, cpm: null, ...p,
})

const serie = (desde: string, porMaquina: Record<string, number[]>) => ({
  desde,
  maquinas: Object.entries(porMaquina).map(([id, cycles]) => ({ id, esperado: 19, cycles })),
})

describe('media15DelDuro', () => {
  it('promedia los últimos 15 minutos cerrados y el reparto SUMA la línea', () => {
    // 20 minutos: los primeros 5 quedan fuera de la ventana.
    const a = [9, 9, 9, 9, 9, ...Array<number>(15).fill(10)]
    const b = [9, 9, 9, 9, 9, ...Array<number>(15).fill(14)]
    const m = media15DelDuro(pulso({ serieMinuto: serie('2026-08-29T08:00:00.000Z', { a, b }) }))!
    expect(m.cpm).toBe(24)
    expect(m.cpmReloj).toBe(24)
    expect(m.porMaquina.map((x) => x.cpm)).toEqual([10, 14])
    // fin del último minuto cerrado: 08:00 + 20 min
    expect(new Date(m.hastaWallMs).toISOString()).toBe('2026-08-29T08:20:00.000Z')
  })

  it('un minuto con la línea EN CERO no entra al denominador andando, sí al de reloj', () => {
    const a = [...Array<number>(12).fill(10), 0, 0, 0]
    const b = [...Array<number>(12).fill(10), 0, 0, 0]
    const m = media15DelDuro(pulso({ serieMinuto: serie('2026-08-29T08:00:00.000Z', { a, b }) }))!
    expect(m.cpm).toBe(20)            // 240 / 12 andando
    expect(m.cpmReloj).toBe(16)       // 240 / 15 de reloj
    expect(m.minAndando).toBe(12)
  })

  it('con la serie corta (<5 min) o ausente no opina', () => {
    expect(media15DelDuro(pulso({ serieMinuto: serie('2026-08-29T08:00:00.000Z', { a: [1, 2] }) }))).toBeNull()
    expect(media15DelDuro(pulso({}))).toBeNull()
    expect(media15DelDuro(null)).toBeNull()
  })
})

describe('piezasDelDuro', () => {
  it('prefiere el acumulado por máquina de la última lectura (incluye el minuto parcial)', () => {
    const p = pulso({
      lecturas: [{ at: 'x', totalCycles: 100 }, { at: 'y', totalCycles: 120, porMaquina: { a: 70, b: 50 } }],
      serieMinuto: serie('2026-08-29T08:00:00.000Z', { a: [10, 10], b: [10, 10] }),
    })
    expect(Object.fromEntries(piezasDelDuro(p)!.piezas)).toEqual({ a: 70, b: 50 })
  })

  it('sin lecturas con desglose, suma la serie de minutos cerrados', () => {
    const p = pulso({ serieMinuto: serie('2026-08-29T08:00:00.000Z', { a: [10, 12], b: [5, 5] }) })
    expect(Object.fromEntries(piezasDelDuro(p)!.piezas)).toEqual({ a: 22, b: 10 })
  })
})

describe('horaEnCursoDelDuro', () => {
  it('recuenta la hora en curso desde su inicio con los minutos cerrados', () => {
    // Serie de 08:00 a 08:20 (20 min); la hora en curso arrancó 08:10.
    const a = Array<number>(20).fill(10)
    const b = Array<number>(20).fill(5)
    const h = horaEnCursoDelDuro(
      pulso({ serieMinuto: serie('2026-08-29T08:00:00.000Z', { a, b }) }),
      { from: '2026-08-29T08:10:00.000Z' },
    )!
    expect(h.pieces).toBe(150)          // 10 min × 15 pz
    expect(h.minutesCovered).toBe(10)
    expect(h.piecesPerHour).toBe(900)
  })

  it('si la hora arrancó antes que la serie, no opina (no puede recontar completa)', () => {
    const h = horaEnCursoDelDuro(
      pulso({ serieMinuto: serie('2026-08-29T08:00:00.000Z', { a: [1, 1] }) }),
      { from: '2026-08-29T07:00:00.000Z' },
    )
    expect(h).toBeNull()
  })
})
