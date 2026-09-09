import { describe, it, expect } from 'vitest'
import { mergeParsedData } from '../graderExcelParser'
import type { PieceRecord, Gate0Record, UploadedMatrixFile } from '../types'

const meta = (kind: UploadedMatrixFile['kind'], name: string): UploadedMatrixFile =>
  ({ id: name, name, kind, sizeBytes: 1, parsedAt: '2026-09-09T05:37:00.000Z', warnings: [] } as unknown as UploadedMatrixFile)
const pieza = (ts: string, gate: number, kg: number): PieceRecord => ({ ts, gate, pieces: 1, weightKg: kg, quality: 'Premium', calibre: gate === 0 ? undefined : '8-10 lb' })
const p0 = (ts: string, error: string, kg: number): Gate0Record => ({ ts, gate: 0, pieces: 1, weightKg: kg, error } as Gate0Record)

describe('mergeParsedData · el Excel de Puerta 0 cubre menos que el pieza a pieza (2026-09-08 T1)', () => {
  const pp = { fileMeta: meta('PIEZA_PIEZA', 'pp.xlsx'), partialData: { pieceRecords: [
    pieza('2026-09-08T22:00:00.000Z', 8, 4.1),
    pieza('2026-09-08T22:10:00.000Z', 0, 0.5),   // dentro de la ventana del P0: ya viene en el P0
    pieza('2026-09-09T01:10:00.000Z', 0, 0.6),   // fuera: el P0 termina a las 23:57
    pieza('2026-09-09T01:20:00.000Z', 0, 0),     // fuera, sin peso
  ] } }
  const p0file = { fileMeta: meta('PUERTA_0', 'p0.xlsx'), partialData: { gate0Records: [p0('2026-09-08T22:10:00.000Z', 'Fuera de límites', 0.5), p0('2026-09-08T23:57:00.000Z', 'No leído por fotocélula', 0)] } }

  it('suma los gate=0 del pieza a pieza que quedan fuera de la ventana del P0, con causa inferida', () => {
    const m = mergeParsedData([pp, p0file])
    expect(m.gate0Records).toHaveLength(4)
    expect(m.gate0Records.slice(0, 2).map((r) => r.error)).toEqual(['Fuera de límites', 'No leído por fotocélula'])
    const inferidos = m.gate0Records.slice(2)
    expect(inferidos.map((r) => r.ts)).toEqual(['2026-09-09T01:10:00.000Z', '2026-09-09T01:20:00.000Z'])
    expect(inferidos.every((r) => r.error && r.error.length > 0)).toBe(true)
    expect(m.inferred.p0CoverageWarning).toMatch(/cubre 22:10–23:57 .* 22:00–01:20: 2 rechazos/)
    expect(m.files.find((f) => f.kind === 'PUERTA_0')?.warnings).toHaveLength(1)
  })

  it('con ventanas iguales no agrega nada ni avisa', () => {
    const p0Completo = { fileMeta: meta('PUERTA_0', 'p0.xlsx'), partialData: { gate0Records: [p0('2026-09-08T22:10:00.000Z', 'Fuera de límites', 0.5), p0('2026-09-09T01:20:00.000Z', 'No leído por fotocélula', 0)] } }
    const m = mergeParsedData([pp, p0Completo])
    expect(m.gate0Records).toHaveLength(2)
    expect(m.inferred.p0CoverageWarning).toBeUndefined()
  })
})
