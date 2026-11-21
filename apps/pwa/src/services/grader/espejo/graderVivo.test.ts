import { describe, it, expect } from 'vitest'
import real from './__fixtures__/chonchi-2026-11-19-turno2-minutos.json'
import { parsearFila } from './espejoFilas'
import { AgregadorMinutos, cubetasDe, serieDesdeCubetas } from './espejoMinutos'
import { CacheHorasEspejo } from './espejoCache'
import {
  RETRASO_REFERENCIA_MIN,
  baaderEnEje,
  lineaManualPorHora,
  medirRetraso,
  p0Por15,
  repartoDelTurno,
  retrasoOReferencia,
  salidaUltimaHora,
  totalesDelTurno,
} from './graderVivo'

/** Fila del contrato del espejo: 11 celdas + `#n`, unidas por TAB. */
function fila(hora: string, o: { gate?: number; kg?: string; lote?: string; cal?: string; calidad?: string; n?: number } = {}): string {
  return ['2026-11-19', hora, o.kg ?? '4,10 kg', '1', o.lote ?? '720260738', String(o.gate ?? 3), o.calidad ?? 'Premium', 'CONGELADO', o.cal ?? '8 - 10 LB', 'HG', '', `#${o.n ?? 0}`].join('\t')
}
const piezas = (filas: string[]) => filas.map((f) => parsearFila(f)!).filter(Boolean)

describe('cubetas por minuto', () => {
  it('Gate 0, peso nulo y peso 0 quedan fuera de kg, calibre y calidad, pero cuentan como piezas', () => {
    const c = cubetasDe(piezas([
      fila('07:20:01'),
      fila('07:20:02', { gate: 0, kg: '5,80 kg', cal: '0 - 2 LB' }),
      fila('07:20:03', { kg: '0 kg' }),
      fila('07:20:04', { kg: '' }),
      fila('07:21:00', { cal: '10 - 12 LB', calidad: 'Industrial' }),
    ]))
    expect(c).toHaveLength(2)
    const [a, b] = c
    expect(a).toMatchObject({ pz: 4, g0: 1, pzPeso: 1, kgSalida: 4.1 })
    expect(Object.keys(a!.calibre)).toEqual(['8-10 lb'])
    expect(b?.calidad).toEqual({ Industrial: 1 })
  })

  it('solo se reagrupa el documento de hora que cambió', () => {
    const cache = new CacheHorasEspejo()
    const ag = new AgregadorMinutos()
    const h07 = Array.from({ length: 600 }, (_, i) => fila(`07:${String(Math.floor(i / 10) % 60).padStart(2, '0')}:${String(i % 10).padStart(2, '0')}`))
    const h08 = h07.map((f) => f.replace('\t07:', '\t08:'))
    cache.actualizar('2026-11-19/07', h07)
    cache.actualizar('2026-11-19/08', h08)
    const claves = ['2026-11-19/07', '2026-11-19/08']
    expect(ag.unir(cache.piezasPorDoc(claves))).toHaveLength(120)
    expect(ag.agrupados).toBe(2)
    // Llega una pieza nueva a las 08: se reagrupa SOLO esa hora.
    cache.actualizar('2026-11-19/08', [...h08, fila('08:59:59')])
    ag.unir(cache.piezasPorDoc(claves))
    expect(ag.agrupados).toBe(3)
    // El mismo estado otra vez no reagrupa nada.
    ag.unir(cache.piezasPorDoc(claves))
    expect(ag.agrupados).toBe(3)
  })

  it('la serie pone cada cubeta en su minuto del eje y marca hasta dónde hay dato', () => {
    const c = cubetasDe(piezas([fila('07:15:10'), fila('07:17:59'), fila('07:17:59', { n: 1 })]))
    const s = serieDesdeCubetas(c, Date.parse('2026-11-19T07:15:00.000Z'), 10)
    expect(s.pz).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0])
    expect(s.hastaMin).toBe(3)
    expect(s.ultimaTs).toBe('2026-11-19T07:17:59.000Z')
  })

  it('el lote en curso empieza donde aparece por primera vez sin otro lote después', () => {
    const c = cubetasDe(piezas([
      fila('07:15:00', { lote: 'A' }),
      fila('07:16:00', { lote: 'A' }),
      fila('07:16:30', { lote: 'B' }),
      fila('07:18:00', { lote: 'B' }),
      fila('07:19:00', { lote: 'B' }),
    ]))
    const s = serieDesdeCubetas(c, Date.parse('2026-11-19T07:15:00.000Z'), 10)
    expect(s.lote).toEqual({ lote: 'B', desdeMin: 1, piezas: 3 })
  })
})

describe('retraso Baader → grader', () => {
  it('con el turno real del 19-11 (T2) mide 3 min, r ≥ 0,8', () => {
    const r = medirRetraso(real.baader, real.grader, real.grader.length)
    expect(r).not.toBeNull()
    expect(r!.min).toBe(3)
    expect(r!.r!).toBeGreaterThan(0.8)
  })

  it('recupera un retraso sintético de 6 min', () => {
    const b = real.baader.slice(0, 300)
    const g = [0, 0, 0, 0, 0, 0, ...b]
    expect(medirRetraso(b, g, g.length)?.min).toBe(6)
  })

  it('con menos de 120 min no mide y cae a la referencia (3 min, marcada como no medida)', () => {
    const b = real.baader.slice(0, 100)
    const g = real.grader.slice(0, 100)
    expect(medirRetraso(b, g, 100)).toBeNull()
    expect(retrasoOReferencia(b, g, 100)).toEqual({ min: RETRASO_REFERENCIA_MIN, r: null, medido: false })
  })

  it('con curvas sin relación (r bajo) no inventa un retraso', () => {
    const b = Array.from({ length: 300 }, (_, i) => (i * 7919) % 41)
    const g = Array.from({ length: 300 }, (_, i) => (i * 104729) % 37)
    expect(medirRetraso(b, g, 300)).toBeNull()
  })
})

describe('serie de las Baader en el eje del grader', () => {
  it('suma las máquinas y corre por el desfase entre el inicio del turno y el de la serie', () => {
    const b = baaderEnEje({ desde: '2026-11-19T07:17:00.000Z', maquinas: [{ cycles: [1, 2] }, { cycles: [3, 4, 5] }] }, Date.parse('2026-11-19T07:15:00.000Z'))
    expect(b).toEqual([NaN, NaN, 4, 6, 5]) // antes de la serie: sin cobertura, no 0
  })
  it('sin serie, `null` (no ceros)', () => {
    expect(baaderEnEje(null, 0)).toBeNull()
  })
})

describe('P0 cada 15 min', () => {
  it('tramos del reloj con su % y la marca de poca masa', () => {
    const s = { t0Ms: Date.parse('2026-11-19T07:15:00.000Z'), hastaMin: 19, pz: Array(19).fill(10), g0: Array(19).fill(0), kgSalida: [], pzPeso: [], calibre: [] }
    s.g0[0] = 6
    const t = p0Por15(s, 50)
    expect(t.map((x) => x.rotulo)).toEqual(['07:15–07:30', '07:30–07:34'])
    expect(t[0]!.pct).toBeCloseTo(4)
    expect(t[1]!.pocaMasa).toBe(true)
  })
})

describe('línea manual por hora', () => {
  const t0 = Date.parse('2026-11-19T07:15:00.000Z')
  it('solo horas de reloj completas; la primera parcial y la hora en curso no entran', () => {
    const pz = Array(170).fill(40) // 07:15 → 10:05
    const b = Array(170).fill(38)
    const h = lineaManualPorHora({ t0Ms: t0, pz, hastaMin: 170 }, b, 3)
    expect(h.map((x) => x.hora)).toEqual(['08:00', '09:00'])
    expect(h[0]).toEqual({ hora: '08:00', grader: 2400, baader: 2280, diferencia: 120 })
  })
  it('la hora en curso no entra aunque Shoplogix ya tenga esa hora entera (el lector va atrasado)', () => {
    const h = lineaManualPorHora({ t0Ms: t0, pz: Array(170).fill(40), hastaMin: 170 }, Array(260).fill(38), 3)
    expect(h.map((x) => x.hora)).toEqual(['08:00', '09:00'])
  })
  it('P3: una hora sin cobertura entera de Shoplogix no se resta (antes inventaba +1.320)', () => {
    const b = baaderEnEje({ desde: '2026-11-19T08:30:00.000Z', maquinas: [{ cycles: Array(120).fill(40) }] }, t0)!
    const h = lineaManualPorHora({ t0Ms: t0, pz: Array(200).fill(40), hastaMin: 200 }, b, 3)
    expect(h.map((x) => x.hora)).toEqual(['09:00'])
    expect(h[0]?.diferencia).toBe(0)
  })
  it('P3: la correlación del retraso ignora los minutos sin cobertura', () => {
    const conHueco = [...Array(100).fill(NaN), ...real.baader.slice(100, 400)]
    expect(medirRetraso(conHueco, real.grader.slice(0, 400), 400)?.min).toBe(3)
  })
  it('usa las Baader corridas por el retraso', () => {
    const pz = Array(120).fill(0)
    const b = Array(120).fill(0)
    for (let m = 45; m < 105; m++) pz[m] = 1 // 08:00-09:00 en el grader
    for (let m = 42; m < 102; m++) b[m] = 1 // 3 min antes en las Baader
    expect(lineaManualPorHora({ t0Ms: t0, pz, hastaMin: 120 }, b, 3)[0]?.diferencia).toBe(0)
  })
  it('con la serie real del 19-11 la hora 09:00 da −41 (sumado a mano: 2.579 − 2.620)', () => {
    const h = lineaManualPorHora({ t0Ms: Date.parse(real.t0), pz: real.grader, hastaMin: real.grader.length }, real.baader, 3)
    expect(h.find((x) => x.hora === '09:00')).toMatchObject({ grader: 2579, baader: 2620, diferencia: -41 })
  })
  it('sin la serie de las Baader, nada', () => {
    expect(lineaManualPorHora({ t0Ms: t0, pz: Array(200).fill(1), hastaMin: 200 }, null, 3)).toEqual([])
  })
})

describe('cifras de salida y del turno', () => {
  it('salida de la última hora proyectada a la hora cuando el turno lleva menos', () => {
    const s = { hastaMin: 30, pz: [], g0: [], calibre: [], pzPeso: Array(30).fill(10), kgSalida: Array(30).fill(41) }
    expect(salidaUltimaHora(s)).toMatchObject({ minutos: 30, piezas: 300, piezasH: 600, kgH: 2460 })
    expect(salidaUltimaHora(s)?.pesoMedio).toBeCloseTo(4.1)
  })
  it('P0 del turno es `null` sin Gate 0 (no un 0 % inventado)', () => {
    expect(totalesDelTurno({ pz: [10, 10], g0: [0, 0], hastaMin: 2 }).p0).toBeNull()
    expect(totalesDelTurno({ pz: [10, 10], g0: [1, 0], hastaMin: 2 }).p0).toBeCloseTo(5)
  })
  it('reparto de calibre y calidad en %', () => {
    const r = repartoDelTurno({
      hastaMin: 2, pz: [], g0: [], kgSalida: [], pzPeso: [],
      calibre: [{ '8-10 lb': 3 }, { '10-12 lb': 1 }],
      calidad: [{ Premium: 4 }, undefined],
    })
    expect(r.calibre).toEqual([{ clave: '8-10 lb', n: 3, pct: 75 }, { clave: '10-12 lb', n: 1, pct: 25 }])
    expect(r.calidad[0]?.pct).toBe(100)
  })
})
