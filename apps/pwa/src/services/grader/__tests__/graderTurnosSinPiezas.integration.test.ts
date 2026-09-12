/**
 * El caso medido, fijado como test: con los dos Excel reales de julio 2025
 * —el uso normal— el Wizard detecta 54 turnos y **37 no tienen ni una pieza**.
 *
 * Reproduce el pipeline del Wizard: parseFile → mergeParsedData → dedupe →
 * segmentByDayAndShift, y cuenta los segmentos sin piezas con la misma
 * expresión que usa `multiDayInfo`.
 *
 * Se salta si los Excel no están en disco (viven en el OneDrive del usuario).
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseFile, mergeParsedData } from '../graderExcelParser'
import { segmentByDayAndShift, dedupePieceRecords, dedupeGate0Records, sortedSegmentEntries } from '../graderSegmenter'
import { avisoDeTurnosSinPiezas } from '../graderTurnosSinPiezas'
import type { GraderShiftSchedule } from '../types'

/** Horario de Planta Principal, el mismo del test de integración del parser. */
const PRINCIPAL: GraderShiftSchedule[] = [
  { shiftId: 'Turno 1', startHour: 21, startMinute: 30, endHour: 5, endMinute: 45 },
  { shiftId: 'Turno 2', startHour: 9, startMinute: 0, endHour: 17, endMinute: 15 },
]

const HOME = process.env.USERPROFILE || process.env.HOME || ''
const BASE = path.join(HOME, 'OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ GRADER/temporada 2025-2026')
const PP_FILE = path.join(BASE, 'pieza a pieza/julio 2025/Pieza pieza Grader STATICGRADER1 (20250701_000000 - 20250801_000000).xlsx')
const P0_FILE = path.join(BASE, 'punto 0/julio 2025/Puerta 0 STATICGRADER1 (20250701_000000 - 20250731_000000).xlsx')
const hayArchivos = fs.existsSync(PP_FILE) && fs.existsSync(P0_FILE)
const asFile = (fp: string) => new File([new Uint8Array(fs.readFileSync(fp))], path.basename(fp))

describe('Turnos sin piezas con los Excel reales de julio 2025', () => {
  it.skipIf(!hayArchivos)('los dos archivos del mismo mes NO cubren el mismo rango', async () => {
    const pp = await parseFile(asFile(PP_FILE))
    const p0 = await parseFile(asFile(P0_FILE))
    expect(pp.partialData.inferred?.endAt?.slice(0, 10)).toBe('2025-07-14')
    expect(p0.partialData.inferred?.endAt?.slice(0, 10)).toBe('2025-07-30')
  }, 600000)

  it.skipIf(!hayArchivos)('de los 54 turnos detectados, 37 no tienen ninguna pieza', async () => {
    const pp = await parseFile(asFile(PP_FILE))
    const p0 = await parseFile(asFile(P0_FILE))
    const merged = mergeParsedData([pp, p0])
    const entries = sortedSegmentEntries(segmentByDayAndShift(
      dedupePieceRecords(merged.pieceRecords).unique,
      dedupeGate0Records(merged.gate0Records).unique,
      PRINCIPAL, [], merged.notApplicableRecords ?? [],
    ))

    // La misma expresión que usa `multiDayInfo` en el Wizard.
    const soloP0 = entries.filter(([, s]) => s.pieceRecords.length === 0).length

    expect(entries.length).toBe(54)
    expect(soloP0).toBe(37)
    expect(avisoDeTurnosSinPiezas(entries.length - soloP0, soloP0))
      .toContain('37 de los 54 turnos no tienen ninguna pieza')
  }, 600000)
})
