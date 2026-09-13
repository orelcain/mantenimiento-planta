/**
 * El Wizard monta esta pagina SIEMPRE con `compact` (es el unico que la monta).
 * La rama compacta cortaba antes de la lista de archivos, asi que los avisos
 * del parser, el «Sin Puerta 0» y los errores se dibujaban solo en la rama que
 * nadie monta: en pantalla quedaba un boton con un contador.
 *
 * Estos tests montan la pagina como la monta el Wizard.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AnalisisGraderUploadPage, type FileParsed } from '../AnalisisGraderUploadPage'

vi.mock('@/services/grader/graderUpload.service', () => ({
  listGraderUploads: vi.fn().mockResolvedValue([]),
  saveGraderUpload: vi.fn(),
  updateGraderUpload: vi.fn(),
  uploadGraderFile: vi.fn(),
  deleteGraderUpload: vi.fn(),
}))
vi.mock('@/services/grader/graderModuleConfig.service', () => ({
  getModuleRanges: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/services/grader/graderDailySummary.service', () => ({
  deleteDailySummary: vi.fn(),
}))
vi.mock('@/store', () => ({ useAuthStore: () => null }))

afterEach(cleanup)

const AVISO = '1075 registros sin pieza ("No aplicable"): el Matrix los cuenta como registros, la app no como piezas.'

function archivo(over: Partial<FileParsed['fileMeta']> = {}): FileParsed {
  return {
    fileMeta: {
      id: 'u1',
      name: 'pieza-pieza-julio.xlsx',
      kind: 'PIEZA_PIEZA',
      sizeBytes: 1,
      uploadedAt: '2025-07-01T00:00:00Z',
      warnings: [AVISO],
      ...over,
    } as FileParsed['fileMeta'],
    partialData: { pieceRecords: [], inferred: {} },
    file: new File([''], 'x.xlsx'),
  }
}

function montar(files: FileParsed[]) {
  return render(
    <MemoryRouter>
      <AnalisisGraderUploadPage compact onComplete={() => {}} initialFiles={files} />
    </MemoryRouter>,
  )
}

describe('AnalisisGraderUploadPage · como la monta el Wizard (compact)', () => {
  it('muestra el nombre del archivo cargado, no solo un contador', () => {
    montar([archivo()])
    expect(screen.getByText('pieza-pieza-julio.xlsx')).toBeTruthy()
  })

  it('muestra los avisos que el parser dejo en el archivo', () => {
    montar([archivo()])
    expect(screen.getByText(AVISO)).toBeTruthy()
  })

  it('avisa que sin Puerta 0 el desglose se infiere desde los pesos', () => {
    montar([archivo({ warnings: [] })])
    expect(screen.getByText(/Sin Puerta 0/)).toBeTruthy()
  })

  it('no avisa de Puerta 0 cuando el Puerta 0 esta cargado', () => {
    montar([archivo({ warnings: [] }), archivo({ id: 'u2', kind: 'PUERTA_0', name: 'p0.xlsx' })])
    expect(screen.queryByText(/Sin Puerta 0/)).toBeNull()
  })
})
