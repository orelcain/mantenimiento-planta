import { describe, expect, it } from 'vitest'
import {
  costoEnPesos,
  evitadoPorRepararRapido,
  fmtPesos,
  habitualPorCausa,
  margenClpPorKg,
  type ConfigCostoNoProducir,
} from '../costoNoProducir'
import type { CausaDelTurno, GrupoDelTurno } from '../monitorEventos'

function causa(reason: string, piezas: number | null, mins: number[]): CausaDelTurno {
  return {
    reason,
    min: mins.reduce((s, m) => s + m, 0),
    count: mins.length,
    piezas,
    categoria: null,
    extension: false,
    paradas: mins.map((min) => ({ hora: '08:00', hasta: '08:10', min, desdeMin: null, hastaMin: null })),
  }
}

/* Filete, 1 máquina: 22 pz/min, 4,6 kg por pieza, $500 por kg → $2.300 por pieza. */
const GRUPOS: GrupoDelTurno[] = [
  { dueno: 'mantencion', min: 18, piezas: 396, causas: [
    causa('Baader 200/CUCHILLERIA DORSAL', 264, [12]),
    causa('Equipo Auxiliar / CINTAS', 132, [6]),
  ] },
  { dueno: 'externo', min: 18, piezas: 396, causas: [causa('CAMBIO LOTE/MMPP', 396, [18])] },
  { dueno: 'sin-imputar', min: 9, piezas: 198, causas: [causa('Detencion', 198, [9])] },
  { dueno: 'programado', min: 30, piezas: null, causas: [causa('COLACION', null, [30])] },
]

describe('costoEnPesos', () => {
  it('multiplica las piezas ya valorizadas por kg y margen, sin recalcular el ritmo', () => {
    const r = costoEnPesos({ grupos: GRUPOS, pesoKg: 4.6, clpPorKg: 500 })
    if (!r || 'falta' in r) throw new Error('debía valorizar')
    expect(r.total.piezas).toBe(990)
    expect(r.total.min).toBe(45)
    expect(r.total.kg).toBeCloseTo(4554, 6)
    expect(r.total.pesos).toBeCloseTo(990 * 4.6 * 500, 6)
    expect(r.total.pesos).toBeCloseTo(2_277_000, 6)
  })

  it('el total es la suma de los dueños y de las detenciones', () => {
    const r = costoEnPesos({ grupos: GRUPOS, pesoKg: 4.6, clpPorKg: 500 })
    if (!r || 'falta' in r) throw new Error('debía valorizar')
    expect(r.porDueno.reduce((s, d) => s + d.pesos, 0)).toBeCloseTo(r.total.pesos, 6)
    expect(r.detenciones.reduce((s, d) => s + d.pesos, 0)).toBeCloseTo(r.total.pesos, 6)
    expect(r.porDueno.find((d) => d.dueno === 'mantencion')!.pesos).toBeCloseTo(396 * 2300, 6)
  })

  it('lo programado no entra: ahí no se pierde producción', () => {
    const r = costoEnPesos({ grupos: GRUPOS, pesoKg: 4.6, clpPorKg: 500 })
    if (!r || 'falta' in r) throw new Error('debía valorizar')
    expect(r.porDueno.map((d) => d.dueno)).toEqual(['mantencion', 'externo', 'sin-imputar'])
    expect(r.detenciones.some((d) => d.reason === 'COLACION')).toBe(false)
  })

  it('sin margen o sin peso dice qué falta y no inventa una cifra', () => {
    expect(costoEnPesos({ grupos: GRUPOS, pesoKg: 4.6, clpPorKg: null })).toEqual({ falta: 'margen' })
    expect(costoEnPesos({ grupos: GRUPOS, pesoKg: 4.6, clpPorKg: 0 })).toEqual({ falta: 'margen' })
    expect(costoEnPesos({ grupos: GRUPOS, pesoKg: null, clpPorKg: 500 })).toEqual({ falta: 'peso' })
  })

  it('sin detenciones recuperables no hay tarjeta', () => {
    expect(costoEnPesos({ grupos: [GRUPOS[3]!], pesoKg: 4.6, clpPorKg: 500 })).toBeNull()
    expect(costoEnPesos({ grupos: null, pesoKg: 4.6, clpPorKg: 500 })).toBeNull()
  })
})

describe('habitualPorCausa', () => {
  const turnos = [
    { causas: [{ reason: 'A', min: 40, count: 2 }, { reason: 'B', min: 9, count: 3 }] },
    { causas: [{ reason: 'A', min: 55, count: 3 }] },
    { causas: null },
  ]
  it('minutos totales sobre eventos totales', () => {
    const h = habitualPorCausa(turnos)
    expect(h.get('A')).toEqual({ min: 19, casos: 5 })
  })
  it('con menos de 5 casos no hay referencia', () => {
    expect(habitualPorCausa(turnos).has('B')).toBe(false)
    expect(habitualPorCausa(turnos, 3).get('B')).toEqual({ min: 3, casos: 3 })
  })
})

describe('evitadoPorRepararRapido', () => {
  const habitual = new Map([
    ['Baader 200/CUCHILLERIA DORSAL', { min: 19, casos: 9 }],
    ['Equipo Auxiliar / CINTAS', { min: 5, casos: 14 }],
  ])

  it('lo resuelto antes de lo habitual es evitado; lo que se pasó va aparte y NO se resta', () => {
    const r = evitadoPorRepararRapido({ grupos: GRUPOS, habitual, pesoKg: 4.6, clpPorKg: 500 })!
    // Cuchillería: 12 min contra 19 → 7 min a 22 pz/min = 154 pz.
    expect(r.evitado.eventos).toBe(1)
    expect(r.evitado.min).toBe(7)
    expect(r.evitado.piezas).toBeCloseTo(154, 6)
    expect(r.evitado.pesos).toBeCloseTo(154 * 2300, 6)
    // Cintas: 6 min contra 5 → 1 min sobre = 22 pz.
    expect(r.sobre.eventos).toBe(1)
    expect(r.sobre.min).toBe(1)
    expect(r.sobre.pesos).toBeCloseTo(22 * 2300, 6)
  })

  it('compara evento por evento, no el promedio de la causa', () => {
    const grupos: GrupoDelTurno[] = [
      { dueno: 'mantencion', min: 30, piezas: 300, causas: [causa('X', 300, [5, 25])] },
    ]
    const r = evitadoPorRepararRapido({
      grupos, habitual: new Map([['X', { min: 15, casos: 8 }]]), pesoKg: 1, clpPorKg: 1,
    })!
    // El promedio (15) calza con lo habitual, pero hubo uno rápido y uno lento.
    expect(r.evitado).toEqual({ eventos: 1, min: 10, piezas: 100, pesos: 100 })
    expect(r.sobre).toEqual({ eventos: 1, min: 10, piezas: 100, pesos: 100 })
  })

  it('solo Mantención, y las causas sin historia se nombran en vez de compararse', () => {
    const r = evitadoPorRepararRapido({
      grupos: GRUPOS, habitual: new Map([['CAMBIO LOTE/MMPP', { min: 60, casos: 20 }]]), pesoKg: 4.6, clpPorKg: 500,
    })!
    expect(r.evitado.pesos).toBe(0)
    expect(r.causas).toEqual([])
    expect(r.sinReferencia).toEqual(['Baader 200/CUCHILLERIA DORSAL', 'Equipo Auxiliar / CINTAS'])
  })

  it('sin margen, sin peso o sin detenciones de Mantención no hay lectura', () => {
    expect(evitadoPorRepararRapido({ grupos: GRUPOS, habitual, pesoKg: 4.6, clpPorKg: null })).toBeNull()
    expect(evitadoPorRepararRapido({ grupos: GRUPOS, habitual, pesoKg: null, clpPorKg: 500 })).toBeNull()
    expect(evitadoPorRepararRapido({ grupos: [GRUPOS[1]!], habitual, pesoKg: 4.6, clpPorKg: 500 })).toBeNull()
  })
})

describe('margenClpPorKg', () => {
  const cfg: ConfigCostoNoProducir = {
    tipoCambioClpPorUsd: 950,
    lineas: {
      'chonchi-filete': [
        { margenPorKg: 400, moneda: 'CLP', vigenteDesde: '2026-11-01' },
        { margenPorKg: 500, moneda: 'CLP', vigenteDesde: '2026-11-20' },
      ],
      'chonchi-eviscerado': [{ margenPorKg: 0.4, moneda: 'USD', vigenteDesde: '2026-11-01' }],
    },
  }

  it('un turno pasado se valoriza con el margen que regía ese día', () => {
    expect(margenClpPorKg(cfg, 'chonchi-filete', '2026-11-19')!.clpPorKg).toBe(400)
    expect(margenClpPorKg(cfg, 'chonchi-filete', '2026-11-20')!.clpPorKg).toBe(500)
    expect(margenClpPorKg(cfg, 'chonchi-filete', '2026-10-31')).toBeNull()
  })

  it('cada línea tiene el suyo, y el dólar pasa por el tipo de cambio fijado', () => {
    expect(margenClpPorKg(cfg, 'chonchi-eviscerado', '2026-11-20')!.clpPorKg).toBeCloseTo(380, 6)
    expect(margenClpPorKg({ ...cfg, tipoCambioClpPorUsd: null }, 'chonchi-eviscerado', '2026-11-20')).toBeNull()
  })

  it('sin configuración, sin línea o fuera de rango no hay margen', () => {
    expect(margenClpPorKg(null, 'chonchi-filete', '2026-11-20')).toBeNull()
    expect(margenClpPorKg(cfg, 'yal-eviscerado', '2026-11-20')).toBeNull()
    expect(margenClpPorKg(cfg, null, '2026-11-20')).toBeNull()
    const absurdo: ConfigCostoNoProducir = {
      tipoCambioClpPorUsd: null,
      lineas: { x: [{ margenPorKg: 5_000_000, moneda: 'CLP', vigenteDesde: '2026-01-01' }] },
    }
    expect(margenClpPorKg(absurdo, 'x', '2026-11-20')).toBeNull()
  })
})

describe('fmtPesos', () => {
  it('siempre con ≈ y redondeado', () => {
    expect(fmtPesos(2_277_000)).toBe('≈ $2.280.000')
    expect(fmtPesos(354_200)).toBe('≈ $350.000')
    expect(fmtPesos(50_600)).toBe('≈ $51.000')
    expect(fmtPesos(300)).toBe('≈ $1.000')
    expect(fmtPesos(18_400_000)).toBe('≈ $18,4 M')
    expect(fmtPesos(0)).toBe('$0')
  })
})
