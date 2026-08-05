/**
 * Prioridad de fuentes del eje temporal del panel upstream.
 *
 * Regresión real (2026-08-01): el encuadre "solo con proceso" viajaba por
 * `shiftWindow`, que estaba DESPUÉS de los bounds del snapshot en la cadena de
 * prioridad. Resultado: el chip cambiaba de estado y el eje seguía dibujando las
 * 24 h del snapshot. El botón no hacía nada.
 */
import { describe, it, expect } from 'vitest'
import { resolvePanelWindow, resolveFraming } from '../shiftTimelineHelpers'

const win = (a: string, b: string) => ({ startAt: a, endAt: b })
const bounds = (a: string, b: string) => ({ start: new Date(a), end: new Date(b) })

const TURNO_24H = win('2026-07-28T08:00:00Z', '2026-07-29T08:00:00Z')
const SOLO_PROCESO = win('2026-07-28T09:45:00Z', '2026-07-28T16:25:00Z')
const SNAPSHOT_24H = bounds('2026-07-28T08:00:00Z', '2026-07-29T08:00:00Z')

describe('resolvePanelWindow', () => {
  it('con encuadre activo, la ventana acotada le GANA a los bounds del snapshot', () => {
    const r = resolvePanelWindow({
      framedOnProduction: true, shiftWindow: SOLO_PROCESO, snapshotBounds: SNAPSHOT_24H,
    })!
    expect(r.start.toISOString()).toBe('2026-07-28T09:45:00.000Z')
    expect(r.end.toISOString()).toBe('2026-07-28T16:25:00.000Z')
  })

  it('sin encuadre, mandan los bounds del snapshot (comportamiento histórico)', () => {
    const r = resolvePanelWindow({
      framedOnProduction: false, shiftWindow: TURNO_24H, snapshotBounds: bounds('2026-05-08T15:00:00Z', '2026-05-08T23:40:00Z'),
    })!
    expect(r.start.toISOString()).toBe('2026-05-08T15:00:00.000Z')
  })

  it('el zoom del usuario gana sobre todo lo demás', () => {
    const r = resolvePanelWindow({
      zoom: { startMs: Date.parse('2026-07-28T15:00:00Z'), endMs: Date.parse('2026-07-28T16:00:00Z') },
      framedOnProduction: true, shiftWindow: SOLO_PROCESO, snapshotBounds: SNAPSHOT_24H,
    })!
    expect(r.start.toISOString()).toBe('2026-07-28T15:00:00.000Z')
  })

  it('sin snapshot cae al prop, con o sin encuadre', () => {
    expect(resolvePanelWindow({ shiftWindow: TURNO_24H, snapshotBounds: null })!.start.toISOString())
      .toBe('2026-07-28T08:00:00.000Z')
    expect(resolvePanelWindow({ framedOnProduction: true, shiftWindow: SOLO_PROCESO, snapshotBounds: null })!.start.toISOString())
      .toBe('2026-07-28T09:45:00.000Z')
  })

  it('sin ninguna fuente devuelve null (cada máquina usa su propio rango)', () => {
    expect(resolvePanelWindow({})).toBeNull()
    expect(resolvePanelWindow({ shiftWindow: win('no-es-fecha', 'tampoco') })).toBeNull()
  })
})

// ── Override del encuadre ────────────────────────────────────────────────────
// Regresión real: el estado era un booleano "ver turno completo" y el encuadre
// siempre pasaba por la heurística. En Yal y Chonchi (turno ya acotado, la
// heurística dice que no hace falta) el botón no podía forzar nada.

describe('resolveFraming', () => {
  it('auto: manda la heurística', () => {
    expect(resolveFraming({ override: 'auto', hasProductionWindow: true, autoDecision: true })).toBe(true)
    expect(resolveFraming({ override: 'auto', hasProductionWindow: true, autoDecision: false })).toBe(false)
  })

  it('el usuario puede FORZAR el encuadre donde la heurística dice que no (Yal)', () => {
    expect(resolveFraming({ override: 'produccion', hasProductionWindow: true, autoDecision: false })).toBe(true)
  })

  it('el usuario puede FORZAR el turno completo donde la heurística acota (Filete)', () => {
    expect(resolveFraming({ override: 'turno', hasProductionWindow: true, autoDecision: true })).toBe(false)
  })

  it('sin ventana de producción no se acota nunca, ni forzando', () => {
    expect(resolveFraming({ override: 'produccion', hasProductionWindow: false, autoDecision: true })).toBe(false)
    expect(resolveFraming({ override: 'auto', hasProductionWindow: false, autoDecision: true })).toBe(false)
  })
})
