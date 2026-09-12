/**
 * Al aceptar un Excel, el flujo invalida el resumen del turno
 * (`deleteDailySummary`). Lo hacia SIEMPRE y una vez por archivo, antes de
 * saber si el archivo contenia ese turno.
 *
 * Medido sobre los Excel reales de julio 2025 (pieza a pieza 07-01 -> 07-14,
 * Puerta 0 07-01 -> 07-30): eligiendo el turno del 2025-07-20 el analisis da
 * 0 piezas y 0 rechazos, y el resumen bueno ya estaba borrado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AnalisisGraderUploadPage } from '../AnalisisGraderUploadPage'
import { deleteDailySummary } from '@/services/grader/graderDailySummary.service'
import { parseFile } from '@/services/grader/graderExcelParser'

vi.mock('@/services/grader/graderUpload.service', () => ({
  listGraderUploads: vi.fn().mockResolvedValue([]),
  saveGraderUpload: vi.fn(async (u) => u),
  updateGraderUpload: vi.fn(),
  uploadGraderFile: vi.fn().mockResolvedValue({ storagePath: 'p', downloadURL: 'u' }),
  deleteGraderUpload: vi.fn(),
}))
vi.mock('@/services/grader/graderModuleConfig.service', () => ({
  getModuleRanges: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/services/grader/graderDailySummary.service', () => ({
  deleteDailySummary: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('@/store', () => ({ useAuthStore: () => ({ id: 'orel' }) }))
vi.mock('@/services/grader/graderExcelParser', () => ({
  parseFile: vi.fn(),
  mergeParsedData: vi.fn(() => ({ files: [], pieceRecords: [], gate0Records: [], folioRecords: [], qualitySummary: [], productionSummary: [], inferred: {} })),
}))

/** Rangos reales de los Excel de julio 2025. */
const JULIO_PP = { startAt: '2025-07-01T00:46:48.000Z', endAt: '2025-07-14T23:24:05.000Z' }
const JULIO_P0 = { startAt: '2025-07-01T00:46:48.000Z', endAt: '2025-07-30T06:05:40.000Z' }

function parseoQueDevuelve(...rangos: Array<{ kind: 'PIEZA_PIEZA' | 'PUERTA_0'; inferred: object }>) {
  let i = 0
  vi.mocked(parseFile).mockImplementation(async () => {
    const r = rangos[Math.min(i++, rangos.length - 1)]!
    return {
      fileMeta: { id: '', name: `f${i}.xlsx`, kind: r.kind, sizeBytes: 1, uploadedAt: '', warnings: [] },
      partialData: { pieceRecords: [], inferred: r.inferred },
    } as any
  })
}

function soltar(n: number) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const files = Array.from({ length: n }, (_, k) => new File([''], `f${k}.xlsx`))
  Object.defineProperty(input, 'files', { value: files, configurable: true })
  fireEvent.change(input)
}

function montar(turno: string) {
  return render(
    <MemoryRouter initialEntries={[`/x?date=${turno}&shift=Turno%201`]}>
      <AnalisisGraderUploadPage compact onComplete={() => {}} />
    </MemoryRouter>,
  )
}

beforeEach(() => vi.mocked(deleteDailySummary).mockClear())
afterEach(cleanup)

describe('invalidar el resumen del turno al cargar el Excel', () => {
  it('NO borra el resumen si el archivo no contiene ese turno', async () => {
    parseoQueDevuelve({ kind: 'PIEZA_PIEZA', inferred: JULIO_PP })
    montar('2025-07-20')
    soltar(1)
    await waitFor(() => expect(screen.getByText(/no está adentro/)).toBeTruthy())
    expect(deleteDailySummary).not.toHaveBeenCalled()
  })

  it('sí lo borra cuando el turno está en el archivo', async () => {
    parseoQueDevuelve({ kind: 'PIEZA_PIEZA', inferred: JULIO_PP })
    montar('2025-07-08')
    soltar(1)
    await waitFor(() => expect(deleteDailySummary).toHaveBeenCalledTimes(1))
    expect(deleteDailySummary).toHaveBeenCalledWith('2025-07-08', 'Turno 1', expect.anything())
  })

  it('con PP y P0 del mismo turno lo borra UNA sola vez, no una por archivo', async () => {
    parseoQueDevuelve(
      { kind: 'PIEZA_PIEZA', inferred: JULIO_PP },
      { kind: 'PUERTA_0', inferred: JULIO_P0 },
    )
    montar('2025-07-08')
    soltar(2)
    await waitFor(() => expect(deleteDailySummary).toHaveBeenCalledTimes(1))
  })

  it('si el PP no cubre el turno pero el P0 sí, se borra igual: hay datos nuevos', async () => {
    parseoQueDevuelve(
      { kind: 'PIEZA_PIEZA', inferred: JULIO_PP },
      { kind: 'PUERTA_0', inferred: JULIO_P0 },
    )
    montar('2025-07-20')
    soltar(2)
    await waitFor(() => expect(deleteDailySummary).toHaveBeenCalledTimes(1))
  })
})
