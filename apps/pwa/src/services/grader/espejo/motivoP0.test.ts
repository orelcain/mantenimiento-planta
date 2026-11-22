import { describe, it, expect } from 'vitest'
import type { PiezaEspejo } from './espejoFilas'
import type { StoredGate0Record } from '../graderGate0Store'
import { clasificarP0, cruzarPuerta0, duenoDelTramo, mantPorMinuto, rafagaFotocelula, type PiezaP0 } from './motivoP0'

const pieza = (o: Partial<PiezaEspejo>): PiezaEspejo => ({
  cadena: '',
  ts: '2026-11-18T22:38:00.000Z',
  fecha: '2026-11-18',
  hora: '22:38:00',
  pesoKg: 2,
  cantidad: 1,
  lote: 'L1',
  gate: 0,
  calidad: 'A',
  conservacion: 'CONGELADO',
  calibre: '4-6 lb' as PiezaEspejo['calibre'],
  producto: 'FILETE',
  turnoMatrix: 'A',
  ...o,
})

const reg = (ts: string, weightKg: number, error: string): StoredGate0Record => ({ ts, pieces: 1, error, weightKg })

const p0 = (min: number, dueno: PiezaP0['dueno'], cantidad = 1): PiezaP0 => ({
  ts: new Date(Date.UTC(2026, 10, 18, 22, 0) + min * 60_000).toISOString(),
  cantidad,
  kg: 2,
  dueno,
  motivo: null,
  exacto: false,
  causa: null,
})

describe('cruzarPuerta0', () => {
  it('cruza por ts + peso y consume un registro por pieza en el mismo segundo', () => {
    const piezas = [
      pieza({ ts: '2026-11-18T22:38:10.000Z', pesoKg: 2.0 }),
      pieza({ ts: '2026-11-18T22:38:10.000Z', pesoKg: 2.0 }),
      pieza({ ts: '2026-11-18T22:38:10.000Z', pesoKg: 2.0 }),
    ]
    const regs = [
      reg('2026-11-18T22:38:10', 2.0, 'No leído por fotocélula'),
      reg('2026-11-18T22:38:10', 2.0, 'Puerta no preparada'),
    ]
    expect(cruzarPuerta0(piezas, regs)).toEqual(['No leído por fotocélula', 'Puerta no preparada', null])
  })

  it('no cruza si el peso no coincide a 2 decimales', () => {
    const piezas = [pieza({ pesoKg: 2.12 })]
    expect(cruzarPuerta0(piezas, [reg('2026-11-18T22:38:00', 2.11, 'Fuera de límites')])).toEqual([null])
  })

  it('pieza sin peso queda sin registro', () => {
    expect(cruzarPuerta0([pieza({ pesoKg: null })], [reg('2026-11-18T22:38:00', 2, 'Fuera de límites')])).toEqual([null])
  })
})

describe('clasificarP0', () => {
  it('pieza sin registro exacto queda estimada; «tenía gate» cuenta como Mantención estimada', () => {
    // Gate 1 corre 4-6 lb calidad A: una pieza de 2 kg calidad A «tenía gate».
    const gate1 = pieza({ gate: 1, ts: '2026-11-18T22:30:00.000Z', pesoKg: 2, calidad: 'A' })
    const tenia = pieza({ gate: 0, ts: '2026-11-18T22:38:00.000Z', pesoKg: 2, calidad: 'A' })
    const r = clasificarP0([gate1, tenia], null)
    expect(r.porPieza).toHaveLength(1)
    expect(r.porPieza[0]!.causa).toBe('tenia-gate')
    expect(r.porPieza[0]!.exacto).toBe(false)
    expect(r.mantencion.pz).toBe(1)
    expect(r.mantencion.estimadoPz).toBe(1)
    expect(r.exactitud).toBe('estimado')
    expect(r.pctExacto).toBe(0)
  })

  it('suma piezas y kg por motivo exacto y marca el resultado como mixto', () => {
    const gate1 = pieza({ gate: 1, ts: '2026-11-18T22:30:00.000Z', pesoKg: 2, calidad: 'A' })
    const a = pieza({ ts: '2026-11-18T22:38:00.000Z', pesoKg: 2.0, cantidad: 2 })
    const b = pieza({ ts: '2026-11-18T22:39:00.000Z', pesoKg: 1.5 })
    const c = pieza({ ts: '2026-11-18T22:40:00.000Z', pesoKg: 2.5 })
    const regs = [
      reg('2026-11-18T22:38:00', 2.0, 'Fuera de límites'),
      reg('2026-11-18T22:39:00', 1.5, 'No leído por fotocélula'),
    ]
    const r = clasificarP0([gate1, a, b, c], regs)
    expect(r.pz).toBe(4)
    expect(r.motivos['Fuera de límites']).toEqual({ pz: 2, kg: 2 })
    expect(r.motivos['No leído por fotocélula']).toEqual({ pz: 1, kg: 1.5 })
    expect(r.seteo.exactoPz).toBe(2)
    expect(r.mantencion.exactoPz).toBe(1)
    expect(r.exactitud).toBe('mixto')
    expect(r.pctExacto).toBe(75)
  })

  it('el motivo sin tildes se agrupa con su nombre canónico', () => {
    const b = pieza({ ts: '2026-11-18T22:39:00.000Z', pesoKg: 1.5 })
    const r = clasificarP0([b], [reg('2026-11-18T22:39:00', 1.5, 'No leido por fotocelula')])
    expect(r.motivos['No leído por fotocélula']).toEqual({ pz: 1, kg: 1.5 })
    expect(r.motivos['No leido por fotocelula']).toBeUndefined()
  })

  it('exacto cuando todas las piezas tienen motivo', () => {
    const b = pieza({ ts: '2026-11-18T22:39:00.000Z', pesoKg: 1.5 })
    const r = clasificarP0([b], [reg('2026-11-18T22:39:00', 1.5, 'Puerta no preparada')])
    expect(r.mantencion.pz).toBe(1)
    expect(r.exactitud).toBe('exacto')
  })
})

describe('duenoDelTramo y mantPorMinuto', () => {
  it('Mantención es dueño si supera la mitad de las piezas del tramo', () => {
    const porPieza = [p0(0, 'mantencion', 3), p0(1, 'seteo', 2)]
    const t0 = Date.UTC(2026, 10, 18, 22, 0)
    expect(duenoDelTramo(porPieza, t0, 0, 15)).toMatchObject({ dueno: 'mantencion', mant: 3, total: 5 })
    expect(mantPorMinuto(porPieza, t0).get(0)).toBe(3)
  })
})

describe('rafagaFotocelula', () => {
  it('11 piezas de Mantención en 15 min no disparan', () => {
    const porPieza = Array.from({ length: 11 }, (_, i) => p0(i, 'mantencion'))
    expect(rafagaFotocelula(porPieza)).toBeNull()
  })

  it('12 piezas de Mantención en 15 min disparan y suman kg', () => {
    const porPieza = Array.from({ length: 12 }, (_, i) => p0(i, 'mantencion'))
    const r = rafagaFotocelula(porPieza)
    expect(r).not.toBeNull()
    expect(r!.pz).toBe(12)
    expect(r!.kg).toBe(24)
    expect(r!.estimado).toBe(true)
  })

  it('las piezas fuera de la ventana de 15 min no cuentan', () => {
    const porPieza = Array.from({ length: 12 }, (_, i) => p0(i * 2, 'mantencion'))
    expect(rafagaFotocelula(porPieza)).toBeNull()
  })
})
