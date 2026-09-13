/**
 * Cargar un Excel NO invalida el resumen del turno, y quitar un archivo que el
 * servidor no pudo borrar NO lo saca de la pantalla.
 *
 * Historia: al aceptar un archivo el flujo llamaba a `deleteDailySummary`.
 * #960 dejó de hacerlo para turnos que el archivo no contiene; acá se quita del
 * todo, porque `saveDailySummaryBatch` ya pisa el documento al guardar
 * (`batch.set` sin merge) y `deleteDoc` no se deshace: si la carga no llegaba a
 * guardarse, el turno quedaba sin resumen.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AnalisisGraderUploadPage, type FileParsed } from '../AnalisisGraderUploadPage'
import { deleteDailySummary } from '@/services/grader/graderDailySummary.service'
import { deleteGraderUpload, listGraderUploads } from '@/services/grader/graderUpload.service'
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

/** Rango real del pieza a pieza de julio 2025. */
const JULIO_PP = { startAt: '2025-07-01T00:46:48.000Z', endAt: '2025-07-14T23:24:05.000Z' }

function parseoDevuelve(inferred: object) {
  vi.mocked(parseFile).mockImplementation(async () => ({
    fileMeta: { id: '', name: 'julio.xlsx', kind: 'PIEZA_PIEZA', sizeBytes: 1, uploadedAt: '', warnings: [] },
    partialData: { pieceRecords: [], inferred },
  } as unknown as Awaited<ReturnType<typeof parseFile>>))
}

function soltarUnArchivo() {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  Object.defineProperty(input, 'files', { value: [new File([''], 'julio.xlsx')], configurable: true })
  fireEvent.change(input)
}

function montar(turno: string, initialFiles?: FileParsed[]) {
  return render(
    <MemoryRouter initialEntries={[`/x?date=${turno}&shift=Turno%201`]}>
      <AnalisisGraderUploadPage compact onComplete={() => {}} initialFiles={initialFiles} />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(deleteDailySummary).mockClear()
  vi.mocked(deleteGraderUpload).mockReset()
  vi.mocked(listGraderUploads).mockResolvedValue([])
})
afterEach(cleanup)

describe('cargar un Excel no toca el resumen del turno', () => {
  it('no invalida el resumen aunque el turno esté en el archivo', async () => {
    parseoDevuelve(JULIO_PP)
    montar('2025-07-08')
    soltarUnArchivo()
    await waitFor(() => expect(screen.getByText('julio.xlsx')).toBeTruthy())
    expect(deleteDailySummary).not.toHaveBeenCalled()
  })

  it('tampoco cuando el turno NO está en el archivo (ahí solo avisa)', async () => {
    parseoDevuelve(JULIO_PP)
    montar('2025-07-20')
    soltarUnArchivo()
    await waitFor(() => expect(screen.getByText(/no está adentro/)).toBeTruthy())
    expect(deleteDailySummary).not.toHaveBeenCalled()
  })
})

describe('quitar un archivo', () => {
  const cargado = (): FileParsed => ({
    fileMeta: { id: 'u1', name: 'julio.xlsx', kind: 'PIEZA_PIEZA', sizeBytes: 1, uploadedAt: '', warnings: [] },
    partialData: { pieceRecords: [], inferred: JULIO_PP },
    file: new File([''], 'julio.xlsx'),
  } as unknown as FileParsed)

  it('lo saca de la pantalla cuando el servidor lo borró', async () => {
    vi.mocked(listGraderUploads).mockResolvedValue([
      { id: 'u1', fileMeta: { name: 'julio.xlsx' } } as never,
    ])
    vi.mocked(deleteGraderUpload).mockResolvedValue(undefined as never)
    montar('2025-07-08', [cargado()])
    fireEvent.click(screen.getByTitle('Eliminar'))
    await waitFor(() => expect(screen.queryByText('julio.xlsx')).toBeNull())
  })

  it('lo DEJA en la pantalla si el servidor no pudo borrarlo', async () => {
    vi.mocked(listGraderUploads).mockResolvedValue([
      { id: 'u1', fileMeta: { name: 'julio.xlsx' } } as never,
    ])
    vi.mocked(deleteGraderUpload).mockRejectedValue(new Error('sin permisos'))
    montar('2025-07-08', [cargado()])
    await waitFor(() => expect(screen.getByTitle('Eliminar')).toBeTruthy())
    fireEvent.click(screen.getByTitle('Eliminar'))
    await waitFor(() => expect(screen.getByText(/Sigue cargado/)).toBeTruthy())
    expect(screen.getByText('julio.xlsx')).toBeTruthy()
  })
})
