/**
 * Smoke tests para StateDetailPanel — drill-down rico al clickear un segmento
 * del Gantt Baader.
 *
 * Verifica:
 *   - Renderiza datos del state seleccionado (nombre, razón, duración, hora)
 *   - "Sin categorizar" cuando reason está vacío
 *   - Cuenta correctamente estados similares (mismo name + reason)
 *   - Calcula % del turno usando shiftEnd-shiftStart
 *   - Botón cerrar invoca onClose
 *   - Badge "En curso" cuando state.isCurrent
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)
import { StateDetailPanel } from '../StateDetailPanel'
import type { UpstreamMachineShift, UpstreamMachineState } from '@/services/shoplogix/types'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function mkState(partial: Partial<UpstreamMachineState>): UpstreamMachineState {
  return {
    startAt: new Date('2026-02-26T12:00:00Z'),
    endAt:   new Date('2026-02-26T12:05:00Z'),
    durationSec: 300,
    type: 'downtime',
    name: 'Detencion',
    reason: 'COLACION',
    color: '#ff0000',
    isCurrent: false,
    ...partial,
  }
}

function mkShift(states: UpstreamMachineState[]): UpstreamMachineShift {
  return {
    machineid: 'uuid-1',
    machineName: 'Evisceradora 1',
    machineType: 'baader_142',
    dateKey: '2026-02-26',
    shiftId: 'Turno día',
    shiftStart: new Date('2026-02-26T12:00:00Z'),  // 09:00 hora Chile
    shiftEnd:   new Date('2026-02-26T22:00:00Z'),  // 19:00 hora Chile (10h)
    totalCycles: 5000,
    expectedTotalCycles: 6000,
    totalPieces: 5000,
    expectedTotalPieces: 6000,
    overallRatio: 0.83,
    actualRuntime: 0.5,
    expectedRuntime: 0.6,
    runtimeVariance: -0.1,
    shiftRuntime: 0.7,
    shiftRuntimeBreakdown: {
      uptimeSec: 25200, breakSec: 3600, plannedDowntimeSec: 0,
      downtimeSec: 7200, setupSec: 0, totalTrackedSec: 36000,
    },
    intervals: [],
    states,
    threshold: 15,
    productionUnit: 'Eviscerado',
    comments: [],
    source: 'shoplogix',
    sourceVersion: 1,
    syncedAt: new Date('2026-02-26T22:30:00Z'),
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StateDetailPanel', () => {
  it('muestra nombre, razón y duración del estado seleccionado', () => {
    const state = mkState({ name: 'Detencion', reason: 'COLACION', durationSec: 1800 })
    const shift = mkShift([state])
    render(<StateDetailPanel state={state} shift={shift} onClose={vi.fn()} />)

    expect(screen.getByText('Detencion')).toBeTruthy()
    expect(screen.getByText('COLACION')).toBeTruthy()
    expect(screen.getByText('30 min')).toBeTruthy()
  })

  it('muestra "sin categorizar" cuando reason está vacío', () => {
    const state = mkState({ reason: '' })
    const shift = mkShift([state])
    render(<StateDetailPanel state={state} shift={shift} onClose={vi.fn()} />)

    expect(screen.getByText('sin categorizar')).toBeTruthy()
  })

  it('muestra horas inicio y fin formato HH:MM:SS', () => {
    const state = mkState({
      startAt: new Date('2026-02-26T13:30:45Z'),
      endAt:   new Date('2026-02-26T13:35:15Z'),
      durationSec: 270,
    })
    const shift = mkShift([state])
    render(<StateDetailPanel state={state} shift={shift} onClose={vi.fn()} />)

    expect(screen.getByText('13:30:45')).toBeTruthy()
    expect(screen.getByText('13:35:15')).toBeTruthy()
  })

  it('cuenta estados similares (mismo name+reason) y muestra duración total', () => {
    const s1 = mkState({ name: 'Micro Detencion', reason: 'CAMBIO LOTE', durationSec: 60, startAt: new Date('2026-02-26T13:00:00Z'), endAt: new Date('2026-02-26T13:01:00Z') })
    const s2 = mkState({ name: 'Micro Detencion', reason: 'CAMBIO LOTE', durationSec: 90, startAt: new Date('2026-02-26T14:00:00Z'), endAt: new Date('2026-02-26T14:01:30Z') })
    const s3 = mkState({ name: 'Micro Detencion', reason: 'CAMBIO LOTE', durationSec: 120, startAt: new Date('2026-02-26T15:00:00Z'), endAt: new Date('2026-02-26T15:02:00Z') })
    const sOther = mkState({ name: 'Detencion', reason: 'COLACION', durationSec: 600, startAt: new Date('2026-02-26T16:00:00Z'), endAt: new Date('2026-02-26T16:10:00Z') })
    const shift = mkShift([s1, s2, s3, sOther])

    render(<StateDetailPanel state={s1} shift={shift} onClose={vi.fn()} />)

    // 3 similares: 60+90+120 = 270 s = 5 min (round)
    const similaresLabel = screen.getByText(/Similares:/)
    expect(similaresLabel).toBeTruthy()
    // El valor "3 × 5 min" debe estar presente
    expect(screen.getByText(/3 × 5 min/)).toBeTruthy()
  })

  it('NO muestra fila "Similares" si solo hay 1 estado de ese tipo', () => {
    const state = mkState({ name: 'Detencion', reason: 'ÚNICO' })
    const shift = mkShift([state])
    const { container } = render(<StateDetailPanel state={state} shift={shift} onClose={vi.fn()} />)

    // Si se renderizara, habría un texto "Similares:" como label del DataRow.
    // Match exacto para evitar false positives (ej. "Similar" en otro contexto).
    expect(container.textContent?.includes('Similares:')).toBe(false)
  })

  it('muestra posición #N de M en la secuencia', () => {
    const states = [
      mkState({ startAt: new Date('2026-02-26T13:00:00Z'), endAt: new Date('2026-02-26T13:05:00Z') }),
      mkState({ startAt: new Date('2026-02-26T14:00:00Z'), endAt: new Date('2026-02-26T14:05:00Z') }),
      mkState({ startAt: new Date('2026-02-26T15:00:00Z'), endAt: new Date('2026-02-26T15:05:00Z') }),
    ]
    const shift = mkShift(states)

    render(<StateDetailPanel state={states[1]} shift={shift} onClose={vi.fn()} />)
    expect(screen.getByText('#2 de 3')).toBeTruthy()
  })

  it('muestra badge "En curso" cuando state.isCurrent es true', () => {
    const state = mkState({ isCurrent: true })
    const shift = mkShift([state])
    render(<StateDetailPanel state={state} shift={shift} onClose={vi.fn()} />)

    expect(screen.getByText('En curso')).toBeTruthy()
  })

  it('botón cerrar invoca onClose', () => {
    const onClose = vi.fn()
    const state = mkState({})
    const shift = mkShift([state])
    render(<StateDetailPanel state={state} shift={shift} onClose={onClose} />)

    fireEvent.click(screen.getByTestId('state-detail-close'))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('% del turno se calcula correctamente (180 s / 36000 s = 0.5%)', () => {
    const state = mkState({ durationSec: 180 })
    const shift = mkShift([state])
    // shiftStart=12:00 shiftEnd=22:00 → 36000 s
    render(<StateDetailPanel state={state} shift={shift} onClose={vi.fn()} />)

    expect(screen.getByText('0.5%')).toBeTruthy()
  })
})
