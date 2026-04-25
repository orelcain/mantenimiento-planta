/**
 * Smoke tests para exportTurnToPDF (M17).
 *
 * Verifica que la función completa el ciclo sin errores, genera el PDF
 * con las secciones esperadas (encabezado, KPIs, pausas, gates, top-P0,
 * upstream Baader 142) y llama a doc.save con el nombre correcto.
 *
 * jsPDF y jspdf-autotable se mockean — no se genera PDF real.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GraderDailySummary, Pause } from '../types'
import type { UpstreamLineSnapshot } from '../../shoplogix/types'

// ── Mocks hoistados (antes de vi.mock para que el factory los vea) ─────────────

const {
  MockJsPDF,
  mockAutoTable,
  mockSave,
  mockAddImage,
  mockDoc,
} = vi.hoisted(() => {
  const mockSave         = vi.fn()
  const mockText         = vi.fn()
  const mockLine         = vi.fn()
  const mockSetFontSize  = vi.fn()
  const mockSetFont      = vi.fn()
  const mockSetDrawColor = vi.fn()
  const mockSetTextColor = vi.fn()
  const mockAddPage      = vi.fn()
  const mockSetPage      = vi.fn()
  const mockAddImage     = vi.fn()

  const mockDoc = {
    save: mockSave,
    text: mockText,
    line: mockLine,
    setFontSize: mockSetFontSize,
    setFont: mockSetFont,
    setDrawColor: mockSetDrawColor,
    setTextColor: mockSetTextColor,
    addPage: mockAddPage,
    setPage: mockSetPage,
    addImage: mockAddImage,
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    getNumberOfPages: () => 1,
    lastAutoTable: { finalY: 60 },
  }

  // Regular function (not arrow) para poder usarla como constructor con `new`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MockJsPDF = vi.fn(function (): any { return mockDoc })
  const mockAutoTable = vi.fn()

  return { MockJsPDF, mockAutoTable, mockSave, mockAddImage, mockDoc }
})

vi.mock('jspdf', () => ({ default: MockJsPDF }))
vi.mock('jspdf-autotable', () => ({ default: mockAutoTable }))

// ── Import after mocks ────────────────────────────────────────────────────────

const { exportTurnToPDF } = await import('../graderTurnToPDF')

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SUMMARY: GraderDailySummary = {
  id: '2024-01-15__Turno día',
  dateKey: '2024-01-15',
  shiftId: 'Turno día',
  totalPieces: 5000,
  pointZeroPieces: 100,
  pointZeroPct: 2.0,
  updatedBy: 'admin',
  updatedAt: '2024-01-15T20:00:00.000Z',
  totalWeightKg: 5000,
  avgWeightGrams: 1000,
  productionRatePerHour: 500,
  durationMinutes: 480,
  totalDeadTimeSec: 3600,
  pausesCount: 3,
  topP0Causes: [
    { error: 'FUERA_LIMITE', pieces: 60, pct: 60 },
    { error: 'FOTOCELTA',    pieces: 40, pct: 40 },
  ],
  gateDistribution: [
    { gate: 1, pieces: 3000, pct: 60 },
    { gate: 2, pieces: 2000, pct: 40 },
  ],
}

function makeISO(h: number, m: number): string {
  return `2024-01-15T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`
}

const PAUSES: Pause[] = [
  {
    id: 'p-1300-60m',
    startAt: makeISO(13, 0),
    endAt: makeISO(14, 0),
    durationSec: 3600,
    tier: 'parada',
    tag: 'colacion',
  },
  {
    id: 'p-0930-10m',
    startAt: makeISO(9, 30),
    endAt: makeISO(9, 40),
    durationSec: 600,
    tier: 'pausa',
  },
]

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockDoc.lastAutoTable = { finalY: 60 }
  mockDoc.addImage = mockAddImage
  // Re-aplicar implementación del constructor tras clearAllMocks
  MockJsPDF.mockImplementation(function () { return mockDoc })
})

describe('exportTurnToPDF — smoke (M17)', () => {
  it('completa sin lanzar errores con datos mínimos', async () => {
    await expect(
      exportTurnToPDF({ summary: SUMMARY, pauses: [] })
    ).resolves.toBeUndefined()
  })

  it('llama a doc.save exactamente una vez', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: PAUSES })
    expect(mockSave).toHaveBeenCalledOnce()
  })

  it('nombre de archivo contiene dateKey y shiftId sin espacios', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: PAUSES })
    const filename = mockSave.mock.calls[0]?.[0] as string
    expect(filename).toContain('2024-01-15')
    expect(filename).toContain('Turno')
    expect(filename).toMatch(/\.pdf$/)
  })

  it('genera tabla de KPIs (autoTable llamado ≥1 vez)', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: [] })
    expect(mockAutoTable).toHaveBeenCalled()
  })

  it('genera tabla de pausas cuando hay pausas', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: PAUSES })
    // Al menos 2 llamadas a autoTable: KPIs + pausas
    expect(mockAutoTable.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('genera tabla de gates cuando summary.gateDistribution está presente', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: [] })
    // KPIs + gates + top-P0 = 3 llamadas mínimo
    expect(mockAutoTable.mock.calls.length).toBeGreaterThanOrEqual(3)
  })

  it('tagLabels resuelve el tag en la tabla de pausas', async () => {
    const tagLabels = new Map([['colacion', '🍽️ Colación']])
    await exportTurnToPDF({ summary: SUMMARY, pauses: PAUSES, tagLabels })

    const pauseTableCall = mockAutoTable.mock.calls.find(
      (args) => Array.isArray((args[1] as { head?: unknown[] })?.head?.[0]) &&
                ((args[1] as { head: string[][] }).head[0] as string[]).includes('Tag'),
    )
    expect(pauseTableCall).toBeDefined()
    const body = (pauseTableCall![1] as { body: string[][] }).body
    expect(body[0]).toContain('🍽️ Colación')
  })

  it('usa el ID como fallback cuando tagLabels no contiene el tag', async () => {
    const tagLabels = new Map<string, string>()
    await exportTurnToPDF({ summary: SUMMARY, pauses: PAUSES, tagLabels })

    const pauseTableCall = mockAutoTable.mock.calls.find(
      (args) => Array.isArray((args[1] as { head?: unknown[] })?.head?.[0]) &&
                ((args[1] as { head: string[][] }).head[0] as string[]).includes('Tag'),
    )
    const body = (pauseTableCall![1] as { body: string[][] }).body
    expect(body[0]).toContain('colacion')
  })

  it('sin tagLabels, pausa con autoTag muestra "(autoTag)"', async () => {
    const pauseWithAutoTag: Pause[] = [
      { id: 'p-0100-60m', startAt: makeISO(1, 0), endAt: makeISO(2, 0), durationSec: 3600, tier: 'parada', autoTag: 'colacion' },
    ]
    await exportTurnToPDF({ summary: SUMMARY, pauses: pauseWithAutoTag })

    const pauseTableCall = mockAutoTable.mock.calls.find(
      (args) => Array.isArray((args[1] as { head?: unknown[] })?.head?.[0]) &&
                ((args[1] as { head: string[][] }).head[0] as string[]).includes('Tag'),
    )
    const body = (pauseTableCall![1] as { body: string[][] }).body
    // autoTag sin tag manual → se muestra entre paréntesis
    expect(body[0]?.join(' ')).toContain('colacion')
  })

  it('inserta imagen en el PDF cuando se provee chartImageDataUrl (P2-1)', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
    await exportTurnToPDF({ summary: SUMMARY, pauses: [], chartImageDataUrl: dataUrl })
    expect(mockAddImage).toHaveBeenCalledWith(dataUrl, 'PNG', expect.any(Number), expect.any(Number), expect.any(Number), expect.any(Number))
  })

  it('no llama a addImage cuando chartImageDataUrl no se provee', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: [] })
    expect(mockAddImage).not.toHaveBeenCalled()
  })

  it('genera menos llamadas a autoTable sin pausas que con pausas', async () => {
    const countWith = await (async () => {
      vi.clearAllMocks()
      MockJsPDF.mockImplementation(function () { return mockDoc })
      mockDoc.lastAutoTable = { finalY: 60 }
      await exportTurnToPDF({ summary: SUMMARY, pauses: PAUSES })
      return mockAutoTable.mock.calls.length
    })()

    const countWithout = await (async () => {
      vi.clearAllMocks()
      MockJsPDF.mockImplementation(function () { return mockDoc })
      mockDoc.lastAutoTable = { finalY: 60 }
      await exportTurnToPDF({ summary: SUMMARY, pauses: [] })
      return mockAutoTable.mock.calls.length
    })()

    expect(countWithout).toBeLessThan(countWith)
  })

  // ── Sección 7: upstream Baader 142 ─────────────────────────────────────────

  const UPSTREAM_SNAPSHOT: UpstreamLineSnapshot = {
    dateKey: '2024-01-15',
    shiftId: 'Turno día',
    lineThroughputActual: 400,
    lineThroughputExpected: 500,
    lineAvailability: 0.72,
    machinesProducing: 2,
    machines: [
      {
        machineid: 'uuid-1',
        machineName: 'Evisceradora 1',
        machineType: 'baader_142',
        dateKey: '2024-01-15',
        shiftId: 'Turno día',
        shiftStart: new Date('2024-01-15T12:00:00Z'),
        shiftEnd:   new Date('2024-01-16T00:00:00Z'),
        totalCycles: 5553,
        expectedTotalCycles: 6000,
        totalPieces: 5553,
        expectedTotalPieces: 6000,
        overallRatio: 0.93,
        actualRuntime: 0.11,
        expectedRuntime: 0.50,
        runtimeVariance: -0.39,
        shiftRuntime: 0.723,
        shiftRuntimeBreakdown: {
          uptimeSec: 31140, breakSec: 2700, plannedDowntimeSec: 0,
          downtimeSec: 1800, setupSec: 0, totalTrackedSec: 35640,
        },
        intervals: [],
        states: [],
        threshold: 15,
        productionUnit: 'Eviscerado',
        comments: [],
        source: 'shoplogix',
        sourceVersion: 1,
        syncedAt: new Date('2024-01-15T21:00:00Z'),
      },
    ],
  }

  it('genera tabla upstream cuando upstreamSnapshot está presente (§7)', async () => {
    const baseCount = await (async () => {
      vi.clearAllMocks()
      MockJsPDF.mockImplementation(function () { return mockDoc })
      mockDoc.lastAutoTable = { finalY: 60 }
      await exportTurnToPDF({ summary: SUMMARY, pauses: [] })
      return mockAutoTable.mock.calls.length
    })()

    vi.clearAllMocks()
    MockJsPDF.mockImplementation(function () { return mockDoc })
    mockDoc.lastAutoTable = { finalY: 60 }
    await exportTurnToPDF({ summary: SUMMARY, pauses: [], upstreamSnapshot: UPSTREAM_SNAPSHOT })
    // La sección upstream agrega 1 autoTable adicional
    expect(mockAutoTable.mock.calls.length).toBeGreaterThan(baseCount)
  })

  it('la tabla upstream contiene encabezados Uptime% y Ciclos', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: [], upstreamSnapshot: UPSTREAM_SNAPSHOT })

    const upstreamCall = mockAutoTable.mock.calls.find(
      (args) => {
        const head = (args[1] as { head?: unknown[] })?.head?.[0]
        return Array.isArray(head) && (head as string[]).includes('Uptime %')
      },
    )
    expect(upstreamCall).toBeDefined()
    const head = (upstreamCall![1] as { head: string[][] }).head[0]
    expect(head).toContain('Ciclos')
    expect(head).toContain('Produciendo')
  })

  it('la tabla upstream contiene datos de la máquina (nombre, uptime%)', async () => {
    await exportTurnToPDF({ summary: SUMMARY, pauses: [], upstreamSnapshot: UPSTREAM_SNAPSHOT })

    const upstreamCall = mockAutoTable.mock.calls.find(
      (args) => {
        const head = (args[1] as { head?: unknown[] })?.head?.[0]
        return Array.isArray(head) && (head as string[]).includes('Uptime %')
      },
    )
    const body = (upstreamCall![1] as { body: string[][] }).body
    expect(body[0]).toContain('Evisceradora 1')
    expect(body[0]).toContain('72.3%')
  })

  it('no genera sección upstream cuando upstreamSnapshot es null', async () => {
    const countWithNull = await (async () => {
      vi.clearAllMocks()
      MockJsPDF.mockImplementation(function () { return mockDoc })
      mockDoc.lastAutoTable = { finalY: 60 }
      await exportTurnToPDF({ summary: SUMMARY, pauses: [], upstreamSnapshot: null })
      return mockAutoTable.mock.calls.length
    })()

    const countWithout = await (async () => {
      vi.clearAllMocks()
      MockJsPDF.mockImplementation(function () { return mockDoc })
      mockDoc.lastAutoTable = { finalY: 60 }
      await exportTurnToPDF({ summary: SUMMARY, pauses: [] })
      return mockAutoTable.mock.calls.length
    })()

    // Con null debe ser idéntico a sin el parámetro
    expect(countWithNull).toBe(countWithout)
  })
})
