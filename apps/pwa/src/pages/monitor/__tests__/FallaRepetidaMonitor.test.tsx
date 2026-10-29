/**
 * Falla repetida en el Monitor (28-10-2026): la tarjeta «¿Las reparaciones
 * aguantan?» de Análisis y el aviso de El turno. Cifras reales de Chonchi.
 */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { AnalisisV2, type AnalisisV2Props } from '../AnalisisV2'
import { AvisoFallaRepetida } from '../AvisoFallaRepetida'
import { avisosVigentes } from '../avisosVigentes'
import type { FallaRepetidaAviso, FallaRepetidaMonitor } from '@/services/shoplogix/publicShiftMonitor.service'

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia
  }
})
afterEach(cleanup)

const fr: FallaRepetidaMonitor = {
  meses: [
    { mes: '2026-02', episodios: 27, vuelven: 10, tasa: 10 / 27, pocosDatos: true },
    { mes: '2026-08', episodios: 170, vuelven: 105, tasa: 105 / 170, pocosDatos: false },
    { mes: '2026-09', episodios: 47, vuelven: 20, tasa: 20 / 47, pocosDatos: false },
    { mes: '2026-10', episodios: 76, vuelven: 23, tasa: 23 / 76, pocosDatos: false },
  ],
  causas: [
    { causa: 'Lógica', episodios: 64, vuelven: 41, tasa: 41 / 64, azar: 0.068 },
    { causa: 'Motores', episodios: 60, vuelven: 42, tasa: 0.7, azar: 0.062 },
    { causa: 'Correas', episodios: 16, vuelven: 1, tasa: 1 / 16, azar: 0.037 },
  ],
  avisos: [],
  desde: '2026-01-01',
  calculadoEl: '2026-10-28T08:45:00.000Z',
}

const props = (extra: Partial<AnalisisV2Props> = {}): AnalisisV2Props => ({
  pareto: null, semanas: [], hoy: '2026-10-28', horas: [], metaPorHora: null, perdidas: [], causas: [], eventos: [],
  mant: null, cerrado: false, vista: 0, onVista: () => {}, ...extra,
})

describe('Tarjeta «¿Las reparaciones aguantan?»', () => {
  it('muestra el último mes con datos suficientes contra la meta y la causa que más vuelve', () => {
    render(<AnalisisV2 {...props({ fallaRepetida: fr })} />)
    const card = screen.getByRole('article', { name: 'Fallas que vuelven' })
    expect(within(card).getByText(/% de las fallas volvió · octubre/)).toBeTruthy()
    expect(within(card).getByText('30')).toBeTruthy()
    expect(within(card).getByText('En el límite de la meta')).toBeTruthy()
    expect(within(card).getByText(/Motores vuelve 7 de cada 10 veces \(42 de 60\)/)).toBeTruthy()
    // Febrero con 27 fallas va marcado como pocos datos.
    expect(within(card).getByText(/10 de 27 · pocos datos/)).toBeTruthy()
  })

  it('abre el detalle por causa con el azar', () => {
    render(<AnalisisV2 {...props({ fallaRepetida: fr })} />)
    fireEvent.click(screen.getByRole('button', { name: 'Ver detalle: fallas que vuelven' }))
    expect(screen.getByText(/41 de 64 volvieron · azar 7 %/)).toBeTruthy()
  })

  it('no aparece sin datos del backend', () => {
    render(<AnalisisV2 {...props()} />)
    expect(screen.queryByRole('article', { name: 'Fallas que vuelven' })).toBeNull()
  })
})

describe('Aviso «Falla que suele volver»', () => {
  const aviso: FallaRepetidaAviso = { machineId: 'm2', machineName: 'YAL Evisceradora 2', causa: 'Knuro', finAt: '2026-10-28T10:00:00.000Z', vuelven: 17, episodios: 29, deCada10: 6, esRepeticion: true }
  const relojWall = (isoWall: string) => { const t = Date.parse(isoWall); return t + new Date(t).getTimezoneOffset() * 60_000 }

  it('vigente 30 min desde que terminó el paro, según la hora de planta', () => {
    expect(avisosVigentes([aviso], relojWall('2026-10-28T10:10:00Z'))).toHaveLength(1)
    expect(avisosVigentes([aviso], relojWall('2026-10-28T10:31:00Z'))).toHaveLength(0)
    expect(avisosVigentes([aviso], relojWall('2026-10-28T09:59:00Z'))).toHaveLength(0)
    expect(avisosVigentes(undefined, Date.now())).toHaveLength(0)
  })

  it('dice máquina, causa y la tasa', () => {
    render(<AvisoFallaRepetida avisos={[aviso]} />)
    const s = screen.getByTestId('aviso-falla-repetida')
    expect(s.textContent).toContain('YAL Evisceradora 2 · Knuro')
    expect(s.textContent).toContain('6 de cada 10 veces')
    expect(s.textContent).toContain('(17 de 29)')
    expect(s.textContent).toContain('No es la primera vez en este turno')
  })
})
