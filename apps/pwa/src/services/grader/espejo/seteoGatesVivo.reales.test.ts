/** Seteo de las 12 gates en vivo (E-F) sobre los 3 turnos reales y casos armados. Cifras del mockup v5 (21-11). */
import { describe, expect, it } from 'vitest'
import { seteoGatesVivo, tramosDeGate } from './seteoGatesVivo'
import { TURNOS_REALES, piezasHasta, turnoReal, type TurnoReal } from './__fixtures__/turnosReales'
import type { PiezaEspejo } from './espejoFilas'
import type { CalibreRange } from '../types'

/** Los cambios de programa conocidos (nadie los registró en la app): gate, hora de la 1.ª pieza, antes → después. */
const CAMBIOS: Record<TurnoReal, string[]> = {
  '2026-11-19-turno_2': ['G6 10:44:57 6-8 lb · Premium → 12-UP lb · Premium'],
  '2026-11-18-turno_1': ['G11 03:21:38 10-12 lb · Premium → 8-10 lb · Premium'],
  '2026-11-17-turno_2': ['G5 09:53:06 8-10 lb · Industrial → 6-8 lb · Premium', 'G7 09:53:59 6-8 lb · Premium → 8-10 lb · Industrial'],
}
const texto = (c: { gate: number; desdeTs: string; antes: string; despues: string }) => `G${c.gate} ${c.desdeTs.slice(11, 19)} ${c.antes} → ${c.despues}`
const h1230 = Date.parse('2026-11-19T12:30:00Z')

describe('cambio de programa: provisional a 3 seguidas, confirmado con 100 piezas', () => {
  it.each(TURNOS_REALES)('%s: confirma exactamente los cambios conocidos y ninguno más (ni el barrido del final)', (t) => {
    const s = seteoGatesVivo(turnoReal(t).piezas)!
    expect(s.cambios.filter((c) => c.estado === 'confirmado').map(texto)).toEqual(CAMBIOS[t])
    expect(s.cambios.filter((c) => c.estado === 'provisional')).toEqual([])
  })

  it('19-11 a las 12:30: el cambio de G6 sigue provisional (60 de 100 piezas) pero ya manda en la fila', () => {
    const s = seteoGatesVivo(piezasHasta(turnoReal('2026-11-19-turno_2'), h1230), h1230)!
    expect(s.cambios.map((c) => [texto(c), c.estado, c.piezas])).toEqual([['G6 10:44:57 6-8 lb · Premium → 12-UP lb · Premium', 'provisional', 60]])
    const g6 = s.gates[5]!
    expect(g6.programa).toBe('12-UP lb · Premium')
    expect(g6.desdeTs?.slice(11, 16)).toBe('10:44')
    // Peso solo del programa vigente (mockup 5,51–6,43), no la mezcla 2,77–6,41.
    expect(g6.pesoKg![0]).toBeCloseTo(5.53, 2)
    expect(g6.pesoKg![1]).toBeCloseTo(6.43, 2)
  })

  it('el aviso provisional sale a las 3 piezas seguidas', () => {
    const ps = piezasHasta(turnoReal('2026-11-19-turno_2'), Date.parse('2026-11-19T11:00:00Z')).filter((p) => p.gate === 6)
    const i = ps.findIndex((p) => p.calibre === '12-UP lb')
    expect(tramosDeGate(6, ps.slice(0, i + 2)).provisional).toBeNull()
    expect(tramosDeGate(6, ps.slice(0, i + 3)).provisional?.piezas).toBe(3)
  })
})

describe('la tabla de las 12 gates', () => {
  const s = seteoGatesVivo(piezasHasta(turnoReal('2026-11-19-turno_2'), h1230), h1230)!

  it('19-11 a las 12:30: programas de la máquina', () => {
    expect(s.gates.map((g) => g.programa)).toEqual([
      '2-4 lb · Premium', '4-6 lb · Industrial', '4-6 lb · Premium', '6-8 lb · Industrial', '6-8 lb · Premium', '12-UP lb · Premium',
      '8-10 lb · Industrial', '8-10 lb · Premium', '8-10 lb · Premium', '8-10 lb · Premium', '10-12 lb · Premium', '10-12 lb · Premium',
    ])
  })

  it('G1 sin piezas hace 85 min: gris; las demás con flujo, no', () => {
    expect(s.gates[0]!.minSinPiezas).toBe(85)
    expect(s.gates.filter((g) => g.apagada).map((g) => g.gate)).toEqual([1])
  })

  it('pz/min por minuto con producción (22 de los últimos 60): G8 7,9 en la hora y 9,2 en el turno', () => {
    expect(s.minutosActivosHora).toBe(22)
    expect(s.gates[7]!.pzMinHora).toBeCloseTo(7.95, 2)
    expect(s.gates[7]!.pzMinTurno).toBeCloseTo(9.17, 2)
    // % del flujo de la hora: las 12 gates más la Gate 0 suman 100.
    expect(s.gates.reduce((a, g) => a + g.pctHora, 0) + s.gate0.pctHora).toBeCloseTo(100, 6)
  })

  it('Gate 0 al pie: P0 1,5 % de la última hora, 160 piezas en el turno', () => {
    expect(s.gate0.pctHora).toBeCloseTo(1.5, 1)
    expect(s.gate0.piezasTurno).toBe(160)
  })

  it('franja de solape 4,59–4,92 kg entre 8-10 y 10-12 Premium, derivada de lo observado', () => {
    expect(s.solapes).toEqual([{ bajo: '8-10 lb', alto: '10-12 lb', calidad: 'Premium', desdeKg: 4.59, hastaKg: 4.92 }])
    expect(s.gates[9]!.pesoKg![1]).toBeCloseTo(4.58, 2) // G10 corta antes
  })

  it('la gate gris se mide contra lo leído, no contra el reloj', () => {
    const tarde = seteoGatesVivo(piezasHasta(turnoReal('2026-11-19-turno_2'), h1230), h1230 + 45 * 60_000)!
    expect(tarde.gates.every((g) => g.apagada)).toBe(true)
    expect(s.gates[7]!.apagada).toBe(false)
  })
})

describe('pesca por programa y sugerencia con su costo en P0', () => {
  it('19-11 turno completo: 55,8 / 25,9 / 12,4 / 2,0 % y poco flujo 3,9 % en G1-G4 y G7', () => {
    const s = seteoGatesVivo(turnoReal('2026-11-19-turno_2').piezas)!
    expect(s.programas.map((p) => [p.programa, Math.round(p.pct * 10) / 10])).toEqual([
      ['8-10 lb · Premium', 55.8], ['10-12 lb · Premium', 25.9], ['6-8 lb · Premium', 12.4], ['12-UP lb · Premium', 2], ['Poco flujo', 3.9],
    ])
    expect(s.programas[2]!.gates).toEqual([{ gate: 5, desde: null, hasta: null }, { gate: 6, desde: null, hasta: '2026-11-19T10:44:57.000Z' }])
    expect(s.programas[4]!.gates.map((g) => g.gate)).toEqual([1, 2, 3, 4, 7])
  })

  it('19-11: pasar G7 a 8-10 Premium cuesta 212 piezas: P0 de 1,5 % a ~2,8 %', () => {
    const sg = seteoGatesVivo(turnoReal('2026-11-19-turno_2').piezas)!.sugerencia!
    expect([sg.gate, sg.deProg, sg.aProg, sg.gatesDestino]).toEqual([7, '8-10 lb · Industrial', '8-10 lb · Premium', [8, 9, 10]])
    expect(sg.costo.piezas).toBe(212)
    expect(sg.costo.p0Antes).toBeCloseTo((256 / 16634) * 100, 6)
    expect(sg.costo.p0Despues).toBeCloseTo((468 / 16634) * 100, 6)
    expect(sg.pzMinDespues).toBeCloseTo((sg.pzMinAntes * 3) / 4, 6)
  })

  it('18-11: G5 (8-10 Industrial) con su costo; 17-11: sin gate de poco flujo del mismo calibre, sin sugerencia', () => {
    const a = seteoGatesVivo(turnoReal('2026-11-18-turno_1').piezas)!.sugerencia!
    expect([a.gate, a.costo.piezas]).toEqual([5, 372])
    expect(a.costo.p0Despues).toBeGreaterThan(a.costo.p0Antes)
    expect(seteoGatesVivo(turnoReal('2026-11-17-turno_2').piezas)!.sugerencia).toBeNull()
  })
})

describe('casos armados', () => {
  let n = 0
  const pz = (gate: number, calibre: string, calidad: string, kg = 3.2): PiezaEspejo => {
    const ts = new Date(Date.parse('2026-11-21T08:00:00Z') + n++ * 7_000).toISOString()
    return { cadena: ts, ts, fecha: ts.slice(0, 10), hora: ts.slice(11, 19), pesoKg: kg, cantidad: 1, lote: '1', gate, calidad, conservacion: 'FRESCO', calibre: calibre as CalibreRange, producto: 'FILETE', turnoMatrix: '' }
  }

  it('gate con dos calidades legítimas (seteo de fotos 21-11, G5 Premium + D): nunca un cambio', () => {
    n = 0
    const ps: PiezaEspejo[] = []
    for (let i = 0; i < 600; i++) ps.push(pz(5, '6-8 lb', i % 10 < 7 ? 'Premium' : 'D'))
    const t = tramosDeGate(5, ps)
    expect(t.cambios).toEqual([])
    expect(t.provisional).toBeNull()
    expect(seteoGatesVivo(ps)!.gates[4]!.programa).toBe('6-8 lb · Premium + D')
  })

  it('barrido corto (40 piezas de otra etiqueta y vuelve): queda descartado', () => {
    n = 0
    const ps = [
      ...Array.from({ length: 200 }, () => pz(9, '8-10 lb', 'Premium', 4.2)),
      ...Array.from({ length: 40 }, () => pz(9, '10-12 lb', 'Premium', 5)),
      ...Array.from({ length: 50 }, () => pz(9, '8-10 lb', 'Premium', 4.2)),
    ]
    const t = tramosDeGate(9, ps)
    expect(t.cambios).toEqual([])
    expect(t.provisional).toBeNull()
  })

  it('una pieza suelta al arrancar no fija el programa', () => {
    n = 0
    const ps = [pz(3, '6-8 lb', 'D'), ...Array.from({ length: 150 }, () => pz(3, '4-6 lb', 'Premium', 2.3))]
    const t = tramosDeGate(3, ps)
    expect(t.tramos.map((x) => x.etiqueta)).toEqual(['4-6 lb · Premium'])
    expect(t.cambios).toEqual([])
  })
})
