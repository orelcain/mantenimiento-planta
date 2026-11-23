/**
 * Respaldo de 5 min (mockup v4): sin serie por minuto, las Baader salen de las cubetas de 5 min de Shoplogix repartidas
 * en sus 5 minutos, y el gráfico y la línea manual lo dicen. Con el 18-11 Turno 1 real a las 04:30.
 */
import { describe, expect, it } from 'vitest'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { cubetasDe } from '@/services/grader/espejo/espejoMinutos'
import { CUBETA_RESPALDO_MIN, baaderEnEje, serieDesdeCada5 } from '@/services/grader/espejo/graderVivo'
import { armarGraderVivo } from '../graderVivoDatos'
import { datosGrafico } from '../graficoVivoDatos'
import { filasManual, textoFila } from '../lineaManualDatos'

const T0 = Date.parse(extra.t0)
const HUECO = ['2026-11-18T23:39:26', '2026-11-19T00:28:51'] as const
const CUBETAS = (() => {
  const m = new Map<string, number>()
  for (const maq of extra.b5) for (const iv of maq.intervals) m.set(iv.s, (m.get(iv.s) ?? 0) + iv.c)
  return [...m.entries()].map(([t, pieces]) => ({ t, pieces }))
})()

describe('serieDesdeCada5', () => {
  it('reparte cada cubeta en sus 5 minutos', () => {
    const s = serieDesdeCada5([{ t: '2026-11-18T21:15:00.000Z', pieces: 50 }, { t: '2026-11-18T21:20:00.000Z', pieces: 100 }])!
    expect(CUBETA_RESPALDO_MIN).toBe(5)
    expect(s.desde).toBe('2026-11-18T21:15:00.000Z')
    expect(s.maquinas[0]!.cycles).toEqual([10, 10, 10, 10, 10, 20, 20, 20, 20, 20])
  })

  it('solo cubetas cerradas; una que falta queda sin cobertura (NaN), no en 0', () => {
    const c = [{ t: '2026-11-18T21:15:00.000Z', pieces: 50 }, { t: '2026-11-18T21:25:00.000Z', pieces: 50 }, { t: '2026-11-18T21:30:00.000Z', pieces: 50 }]
    const s = serieDesdeCada5(c, Date.parse('2026-11-18T21:33:00.000Z'))!
    expect(s.maquinas[0]!.cycles.length).toBe(15)
    expect(s.maquinas[0]!.cycles.slice(5, 10).every(Number.isNaN)).toBe(true)
    expect(serieDesdeCada5([], 0)).toBeNull()
    expect(serieDesdeCada5(c, Date.parse('2026-11-18T21:19:00.000Z'))).toBeNull()
  })
})

describe('respaldo de 5 min, 18-11 T1 a las 04:30', () => {
  const hasta = 435
  const lim = new Date(T0 + hasta * 60_000).toISOString()
  const t = turnoReal('2026-11-18-turno_1')
  const piezas = t.piezas.filter((p) => p.ts >= extra.t0 && p.ts < lim && !(p.ts >= HUECO[0] && p.ts < HUECO[1]))
  const serie = serieDesdeCada5(CUBETAS, T0 + (hasta - 3) * 60_000)!
  const d = armarGraderVivo({
    cubetas: cubetasDe(piezas),
    inicioMs: T0,
    finMs: T0 + 12 * 60 * 60_000,
    baader: serie,
    baaderCada5: true,
    paradas: [],
    minutosSinLatido: 0,
    turnoEnCurso: true,
    leidoHastaMs: T0 + hasta * 60_000,
  })

  it('las piezas de las Baader son las de las cubetas cerradas (hasta 04:25)', () => {
    const eje = baaderEnEje(serie, T0)!
    const suma = eje.filter(Number.isFinite).reduce((a, b) => a + b, 0)
    const esperado = CUBETAS.filter((c) => Date.parse(c.t) + 5 * 60_000 <= T0 + (hasta - 3) * 60_000).reduce((a, c) => a + c.pieces, 0)
    expect(Math.round(suma)).toBe(esperado)
  })

  it('el gráfico y la línea manual llevan la marca «cada 5 min»', () => {
    expect(d.baader5).toBe(true)
    expect(datosGrafico(d).baader5).toBe(true)
    expect(d.manual.length).toBeGreaterThan(0)
  })

  it('sin la marca, la misma serie no se rotula como respaldo', () => {
    const sin = armarGraderVivo({ cubetas: cubetasDe(piezas), inicioMs: T0, finMs: T0 + 12 * 60 * 60_000, baader: serie, paradas: [], minutosSinLatido: 0, turnoEnCurso: true })
    expect(sin.baader5).toBe(false)
  })

  it('la línea manual con el respaldo: cifras enteras; 02:00 pasa de −11 a +14 (el exceso por minuto sale grueso)', () => {
    const f = filasManual(d.manual, T0, [], d.serie.hastaMin, true)
    expect(f.map((x) => [x.hora, textoFila(x)])).toEqual([
      ['22:00', '+39'],
      ['23:00', 'sin lectura'],
      ['00:00', 'sin lectura'],
      ['01:00', '−21 · ≈ 0'],
      ['02:00', '+14'],
      ['03:00', '−46 · ≈ 0'],
      ['04:00', 'en curso'],
    ])
  })
})
