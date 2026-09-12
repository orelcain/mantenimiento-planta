/**
 * Los dos Excel truncados de la temporada, fijados como test.
 *
 * Su `sheet1.xml` corta a media celda (~fila 204.100 de 308.539 declaradas), así
 * que SheetJS devuelve cero celdas sin lanzar error. El aviso tiene que decir
 * que el archivo está incompleto — no que falta la cabecera.
 *
 * Se salta si los Excel no están en disco (viven en el OneDrive del usuario).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseFile } from '../graderExcelParser'

const HOME = process.env.USERPROFILE || process.env.HOME || ''
const DIR = path.join(HOME, 'OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ GRADER/temporada 2025-2026/pieza a pieza/noviembre 2025')
const TRUNCADO = path.join(DIR, 'Pieza pieza Grader STATICGRADER1 (20251110_000000 - 20251120_000000).xlsx')
const SANO = path.join(DIR, 'Pieza pieza Grader STATICGRADER1 (20251110_000000 - 20251115_000000).xlsx')
const hay = fs.existsSync(TRUNCADO) && fs.existsSync(SANO)
const asFile = (fp: string) => new File([new Uint8Array(fs.readFileSync(fp))], path.basename(fp))

describe('Excel truncado de la temporada 2025-26', () => {
  it.skipIf(!hay)('avisa que el archivo está incompleto, no que falta la cabecera', async () => {
    const r = await parseFile(asFile(TRUNCADO))
    expect(r.partialData.pieceRecords ?? []).toHaveLength(0)
    expect(r.fileMeta.warnings.join(' ')).toContain('El archivo está incompleto')
    expect(r.fileMeta.warnings.join(' ')).not.toContain('cabecera')
  }, 900000)

  it.skipIf(!hay)('el archivo sano de los mismos días no lleva ese aviso', async () => {
    const r = await parseFile(asFile(SANO))
    expect(r.partialData.pieceRecords ?? []).toHaveLength(167738)
    expect(r.fileMeta.warnings.join(' ')).not.toContain('incompleto')
  }, 900000)
})
