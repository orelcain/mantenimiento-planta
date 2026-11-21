/** Etapas 2, 5 y 1 del Grader en vivo sobre los 3 turnos reales (cifras de Hallazgos del mockup, 21-11). */
import { describe, expect, it } from 'vitest'
import {
  bordesPorGate,
  causasP0Vivo,
  escalones,
  histogramaPeso,
  loteVivo,
  ultimosMinutos,
  ultimosTurnos,
  zonaCompartida,
} from './pescaVivo'
import { TURNOS_REALES, piezasHasta, turnoReal, type TurnoReal } from './__fixtures__/turnosReales'
import resumenes from './__fixtures__/chonchi-resumenes-16-al-18-11.json'
import type { PiezaEspejo } from './espejoFilas'
import type { CalibreRange } from '../types'

/** Lo que da el cálculo del mockup (a9) por turno completo: sin gate para su peso / calidad (incluye D) / tenía gate. */
const ESPERADO: Record<TurnoReal, [number, number, number]> = {
  '2026-11-19-turno_2': [85, 120, 51],
  '2026-11-18-turno_1': [19, 84, 102],
  '2026-11-17-turno_2': [144, 314, 147],
}

describe('etapa 2: causas P0 en vivo con el seteo inferido', () => {
  it.each(TURNOS_REALES)('%s: igual al mockup y a ±13 pz de las causas oficiales (Puerta 0)', (t) => {
    const d = turnoReal(t)
    const c = causasP0Vivo(d.piezas)
    const calidad = c.causas['calidad-sin-gate'] + c.causas['calidad-d']
    expect([c.causas['sin-gate-peso'], calidad, c.causas['tenia-gate']]).toEqual(ESPERADO[t])
    const of = (k: string) => d.oficial.topP0Causes.find((x) => x.error === k)?.pieces ?? 0
    expect(Math.abs(c.causas['sin-gate-peso'] - of('fuera_de_calibre'))).toBeLessThanOrEqual(13)
    expect(Math.abs(calidad - of('fuera_de_calidad'))).toBeLessThanOrEqual(13)
    const fisica = of('no_leido_fotocelula') + of('fuera_de_limites') + of('puerta_no_preparada')
    expect(Math.abs(c.causas['tenia-gate'] - fisica)).toBeLessThanOrEqual(13)
  })

  it('19-11 a las 13:00: 72 sin gate para su peso, 44 calidad sin gate, 25 D y 32 tenía gate', () => {
    const c = causasP0Vivo(piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T13:00:00Z')))
    expect(c.total).toBe(173)
    expect(c.causas).toEqual({ 'sin-gate-peso': 72, 'calidad-sin-gate': 44, 'calidad-d': 25, 'tenia-gate': 32 })
    expect(c.pesoBajo).toBe(8)
    expect(c.pesoSinGate['12-UP lb']).toBe(64)
    expect(c.calidadSinGate).toEqual({ '2-4 lb Industrial': 27, '10-12 lb Industrial': 12, '12-UP lb Industrial': 5 })
  })
})

describe('etapa 5: lote en curso', () => {
  it('19-11 a las 13:00: lote 720260739 desde las 10:44, más pesado que el anterior', () => {
    const l = loteVivo(piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T13:00:00Z')))!
    expect(l.lote).toBe('720260739')
    expect(l.desdeTs.slice(11, 16)).toBe('10:44')
    expect(l.anterior?.lote).toBe('720260738')
    expect(l.perfil.pesoMedioKg!).toBeCloseTo(4.43, 1)
    expect(l.anterior!.perfil.pesoMedioKg!).toBeCloseTo(4.07, 1)
    expect(l.perfil.calibreDominante?.calibre).toBe('8-10 lb')
    expect(l.perfil.calibrePct['10-12 lb']!).toBeGreaterThan(l.anterior!.perfil.calibrePct['10-12 lb']! + 10)
  })

  it.each([['2026-11-18-turno_1', '00:0'], ['2026-11-17-turno_2', '09:5']] as const)('%s: un cambio de lote, a las %s·', (t, h) => {
    const l = loteVivo(turnoReal(t).piezas)!
    expect(l.anterior).not.toBeNull()
    expect(l.desdeTs.slice(11, 15)).toBe(h)
  })

  it('distribución de peso de la última hora a las 13:00 (19-11): media ~4,5 kg', () => {
    const h = histogramaPeso(ultimosMinutos(piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T13:00:00Z')), 60))
    expect(h.mediaKg!).toBeCloseTo(4.48, 1)
    expect(h.pct.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 0)
  })

  it('los 6 turnos anteriores al 19-11 T2, más recientes primero', () => {
    const f = ultimosTurnos(resumenes, '2026-11-19__Turno 2')
    expect(f.map((x) => x.rotulo)).toEqual(['18-11 T1', '18-11 T2', '17-11 T1', '17-11 T2', '16-11 T1', '16-11 T2'])
    expect(f[0]!.p0Pct).toBeCloseTo(1.2, 1)
  })
})

describe('etapa 1: zona compartida 4,59–4,99 kg', () => {
  it('19-11, última hora a las 13:00: 223 a 8-10 (FRESCO · Filete) y 311 a 10-12 (CONGELADO · HG)', () => {
    const z = zonaCompartida(ultimosMinutos(piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T13:00:00Z')), 60))
    expect(z.lados.map((l) => [l.calibre, l.piezas])).toEqual([['8-10 lb', 223], ['10-12 lb', 311]])
    expect(z.lados[0]!.destino).toMatch(/FRESCO/)
    expect(z.lados[1]!.destino).toMatch(/CONGELADO · HG/)
  })

  it('el borde por gate es dato: 19-11 a las 13:00 la G5 (6-8 Premium) lee su borde alto', () => {
    const b = bordesPorGate(ultimosMinutos(piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T13:00:00Z')), 60))
    const g5 = b.find((x) => x.gate === 5)!
    expect(g5.programa).toBe('6-8 lb · Premium')
    expect(g5.alto).not.toBeNull()
    expect(b.find((x) => x.gate === 1)!.bajo).toBeNull() // menos de 30 piezas
  })

  it('un escalón real sí avisa: el doble de piezas bajo el límite que sobre él, con masa', () => {
    const pz = (g: number, calibre: string, i: number): PiezaEspejo => ({
      cadena: `${i}`, ts: `2026-11-19T12:${String(i % 60).padStart(2, '0')}:00.000Z`, fecha: '2026-11-19', hora: '12:00:00',
      pesoKg: g / 1000, cantidad: 1, lote: 'L', gate: 5, calidad: 'Premium', conservacion: 'C', calibre: calibre as CalibreRange, producto: 'HG', turnoMatrix: '',
    })
    const p = [...Array.from({ length: 80 }, (_, i) => pz(3600, '6-8 lb', i)), ...Array.from({ length: 30 }, (_, i) => pz(3700, '8-10 lb', i))]
    expect(escalones(p)).toEqual([{ limiteG: 3665, bajo: { calibre: '6-8 lb', piezas: 80 }, alto: { calibre: '8-10 lb', piezas: 30 } }])
    expect(escalones(p.slice(0, 60).concat(p.slice(80)))).toEqual([]) // 60 contra 30 = 90 piezas: poca masa
  })

  it('un lote con menos de 30 piezas seguidas no es un cambio de lote', () => {
    const d = piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T10:00:00Z'))
    const con = [...d.slice(0, -100), ...d.slice(-100, -80).map((p) => ({ ...p, lote: 'X' })), ...d.slice(-80)]
    expect(loteVivo(con)!.anterior).toBeNull()
  })

  it.each(TURNOS_REALES)('%s: el escalón no aparece en ninguna hora del turno', (t) => {
    const d = turnoReal(t)
    const fin = Date.parse(d.piezas[d.piezas.length - 1]!.ts)
    for (let a = d.t0Ms + 60 * 60_000; a <= fin + 60_000; a += 15 * 60_000) {
      expect(escalones(ultimosMinutos(piezasHasta(d, a), 60, a)), new Date(a).toISOString()).toEqual([])
    }
  })
})
