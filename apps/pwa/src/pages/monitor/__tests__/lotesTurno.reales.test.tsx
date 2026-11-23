/**
 * «Lotes del turno» con el 18-11 Turno 1 real a las 04:30: lote 737 hasta el hueco del espejo (23:39 → 00:28), lote 738
 * después, «lote distinto» por +10 puntos en 8-10 lb (calibre por peso, como el mockup v4: 50 % → 61 %).
 */
import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import extra from '@/services/grader/espejo/__fixtures__/chonchi-2026-11-18-turno_1-extra.json'
import { turnoReal } from '@/services/grader/espejo/__fixtures__/turnosReales'
import { calibrePorPeso, lotesDelTurno } from '@/services/grader/espejo/pescaVivo'
import {
  ROTULO_LOTE_LARGO_PX,
  ROTULO_LOTE_MIN_PX,
  filasLotes,
  franjaLotes,
  indiceLote,
  loteDelMinuto,
  loteLegible,
  rotuloFranja,
  type FilaLote,
} from '../lotesTurnoDatos'
import { HojaLote, LotesDelTurno } from '../LotesDelTurno'

const HUECO = ['2026-11-18T23:39:26', '2026-11-19T00:28:51'] as const
const t0 = Date.parse(extra.t0)
const minDe = (ts: string) => Math.floor((Date.parse(`${ts}Z`) - t0) / 60_000)

function a0430() {
  const d = turnoReal('2026-11-18-turno_1')
  const pz = d.piezas.filter((p) => p.ts >= extra.t0 && p.ts < '2026-11-19T04:30:00' && !(p.ts >= HUECO[0] && p.ts < HUECO[1]))
  const hueco: [number, number] = [minDe(HUECO[0]), minDe(HUECO[1])]
  return filasLotes(lotesDelTurno(pz), t0, [hueco], true)
}

describe('Lotes del turno, 18-11 T1 a las 04:30', () => {
  const filas = a0430()
  const lotes = filas.filter((f): f is FilaLote => f.tipo === 'lote')

  it('dos lotes con el hueco del espejo entre ellos, marcado como cambio de lote', () => {
    expect(filas.map((f) => (f.tipo === 'lote' ? f.lote : 'hueco'))).toEqual(['720260737', 'hueco', '720260738'])
    expect(filas[1]).toMatchObject({ tipo: 'hueco', cambio: true })
  })

  it('piezas, peso medio y tramos', () => {
    expect(lotes.map((l) => l.piezas)).toEqual([5530, 8179])
    expect(lotes[0]!.t.perfil.pesoMedioKg!).toBeCloseTo(4.39, 2)
    expect(lotes[1]!.t.perfil.pesoMedioKg!).toBeCloseTo(4.12, 2)
    expect(lotes.map((l) => l.enCurso)).toEqual([false, true])
  })

  it('calibre por peso como el mockup: 8-10 lb de 50 % a 61 %, 10-12 lb de 39 % a 21 %', () => {
    expect(lotes[0]!.t.perfil.calibrePesoPct['8-10 lb']!).toBeCloseTo(50.5, 1)
    expect(lotes[0]!.t.perfil.calibrePesoPct['10-12 lb']!).toBeCloseTo(38.6, 1)
    expect(lotes[1]!.t.perfil.calibrePesoPct['8-10 lb']!).toBeCloseTo(60.7, 1)
    expect(lotes[1]!.t.perfil.dominantePeso?.calibre).toBe('8-10 lb')
  })

  it('el 738 es distinto: sube 8-10 lb, baja 10-12 lb, peso −6 %', () => {
    const c = lotes[1]!.cmp!
    expect(c).toMatchObject({ distinto: true, sube: { calibre: '8-10 lb' }, baja: { calibre: '10-12 lb' } })
    expect(c.pesoPct!).toBeCloseTo(-6.3, 1)
    expect(lotes[0]!.cmp).toBeNull()
  })

  it('franja del gráfico, lote de un minuto y la acción apunta al lote en curso', () => {
    const fr = franjaLotes(filas)
    expect(fr.map((f) => [f.k, f.distinto])).toEqual([[0, false], [1, true]])
    expect(loteDelMinuto(fr, 30)?.lote).toBe('720260737')
    expect(loteDelMinuto(fr, minDe('2026-11-19T00:00:00'))).toBeNull()
    expect(indiceLote(filas, '720260738')).toBe(1)
    expect(indiceLote(filas, 'otro')).toBeNull()
  })

  it('rótulo de la franja según el ancho', () => {
    const f = franjaLotes(filas)[1]!
    expect(rotuloFranja(f, ROTULO_LOTE_MIN_PX)).toBe('')
    expect(rotuloFranja(f, ROTULO_LOTE_MIN_PX + 1)).toBe('…738')
    expect(rotuloFranja(f, ROTULO_LOTE_LARGO_PX + 1)).toBe('lote 738 · distinto')
  })

  it('tarjeta: lote legible, «en curso», «lote distinto» y la ficha con el anterior entre paréntesis', () => {
    const t0Ms = t0
    let abierto: number | null = null
    const { rerender } = render(<LotesDelTurno filas={filas} t0Ms={t0Ms} hastaMin={lotes[1]!.hastaMin} onAbrir={(k) => { abierto = k }} />)
    expect(screen.getByText('720.260.737')).toBeTruthy()
    expect(screen.getByText('en curso')).toBeTruthy()
    expect(screen.getByText('lote distinto')).toBeTruthy()
    expect(screen.getByText(/23:39 → 00:28 · cambio de lote/)).toBeTruthy()
    fireEvent.click(screen.getByText('720.260.738'))
    expect(abierto).toBe(1)
    rerender(<HojaLote filas={filas} k={1} t0Ms={t0Ms} onCerrar={() => {}} />)
    expect(screen.getByText('Revisar gates de 8-10 lb')).toBeTruthy()
    expect(screen.getByText('61 % (50)')).toBeTruthy()
  })
})

describe('calibre por peso', () => {
  it('cada 2 lb, 12 lb o más es 12-UP', () => {
    expect(calibrePorPeso(4130)).toBe('8-10 lb')
    expect(calibrePorPeso(4536)).toBe('10-12 lb')
    expect(calibrePorPeso(5500)).toBe('12-UP lb')
    expect(calibrePorPeso(800)).toBe('0-2 lb')
  })
  it('lote legible', () => {
    expect(loteLegible('720260737')).toBe('720.260.737')
    expect(loteLegible('A-1')).toBe('A-1')
  })
})
