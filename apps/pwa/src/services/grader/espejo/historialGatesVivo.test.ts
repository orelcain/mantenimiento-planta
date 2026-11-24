/** Historial de cambios: el antes y después del único cambio del 18-11 T1 (G11 a las 03:21), con las cifras del mockup. */
import { describe, expect, it } from 'vitest'
import { efectoDeCambios, textoGates } from './historialGatesVivo'
import { seteoGatesVivo } from './seteoGatesVivo'
import { piezasHasta, turnoReal } from './__fixtures__/turnosReales'

const t = turnoReal('2026-11-18-turno_1')
const en = (hhmm: string) => Date.parse(`2026-11-19T${hhmm}:00.000Z`)
const medir = (hhmm: string) => {
  const ps = piezasHasta(t, en(hhmm))
  const s = seteoGatesVivo(ps, en(hhmm))!
  return efectoDeCambios(ps, s, Date.parse(s.referenciaTs))
}

describe('G11 a las 03:21 (confirmado, vista de las 04:30)', () => {
  const r = medir('04:30')
  const c = r[0]!
  it('un solo cambio, con su hora y programas', () => {
    expect(r).toHaveLength(1)
    expect(c.cambio).toMatchObject({ gate: 11, antes: '10-12 lb · Premium', despues: '8-10 lb · Premium', estado: 'confirmado' })
    expect(c.cambio.desdeTs.slice(11, 16)).toBe('03:21')
  })
  it('60 minutos con producción de cada lado y las piezas del mockup (2.940 y 2.715)', () => {
    expect([c.antes!.minutos, c.despues!.minutos]).toEqual([60, 60])
    expect([c.antes!.piezas, c.despues!.piezas]).toEqual([2940, 2715])
  })
  it('P0 0,75 → 0,74 %, con 22 y 20 piezas, y se dice «igual»', () => {
    expect([c.antes!.p0Piezas, c.despues!.p0Piezas]).toEqual([22, 20])
    expect(c.antes!.p0Pct!).toBeCloseTo(0.75, 2)
    expect(c.despues!.p0Pct!).toBeCloseTo(0.74, 2)
    expect(c.p0).toBe('igual')
  })
  it('8-10 Premium por gate: de G8–G10 a G8–G11, bajó de 12,2 a 7,8 pz/min (el mockup dice 12,1)', () => {
    expect(c.gatesNuevo).toEqual([8, 9, 10])
    expect(c.gatesNuevoDespues).toEqual([8, 9, 10, 11])
    expect(c.antes!.pzMinNuevo!).toBeCloseTo(12.16, 1)
    expect(c.despues!.pzMinNuevo!).toBeCloseTo(7.82, 1)
  })
  it('G12, la que se quedó con 10-12 Premium: de 1,0 a 3,7 pz/min', () => {
    expect(c.gatesViejo).toEqual([12])
    expect(c.antes!.pzMinViejo!).toBeCloseTo(0.98, 2)
    expect(c.despues!.pzMinViejo!).toBeCloseTo(3.73, 2)
  })
})

describe('sin confirmar (03:24, menos de 100 piezas)', () => {
  it('el cambio está provisional y no lleva comparación', () => {
    const [c] = medir('03:24')
    expect(c!.cambio.estado).toBe('provisional')
    expect(c!.cambio.piezas).toBeLessThan(100)
    expect(c!.antes).toBeNull()
    expect(c!.despues).toBeNull()
    expect(c!.p0).toBeNull()
  })
})

describe('otros turnos', () => {
  it('19-11 T2 a las 10:00: sin cambios', () => {
    const t19 = turnoReal('2026-11-19-turno_2')
    const ps = piezasHasta(t19, Date.parse('2026-11-19T10:00:00Z'))
    const s = seteoGatesVivo(ps, Date.parse('2026-11-19T10:00:00Z'))!
    expect(efectoDeCambios(ps, s, Date.parse(s.referenciaTs))).toEqual([])
  })
  it('17-11 T2: dos cambios, cada uno con ventanas de a lo más 60 minutos', () => {
    const t17 = turnoReal('2026-11-17-turno_2')
    const s = seteoGatesVivo(t17.piezas)!
    const r = efectoDeCambios(t17.piezas, s, Date.parse(s.referenciaTs))
    expect(r.map((x) => x.cambio.gate).sort((a, b) => a - b)).toEqual([5, 7])
    for (const x of r) {
      expect(x.antes?.minutos ?? 0).toBeLessThanOrEqual(60)
      expect(x.despues?.minutos ?? 0).toBeLessThanOrEqual(60)
    }
  })
})

describe('textoGates', () => {
  it('junta tramos de 3 o más y deja sueltas las salteadas', () => {
    expect(textoGates([8, 9, 10, 11])).toBe('G8–G11')
    expect(textoGates([12])).toBe('G12')
    expect(textoGates([5, 8, 9])).toBe('G5, G8, G9')
    expect(textoGates([])).toBe('')
  })
})
