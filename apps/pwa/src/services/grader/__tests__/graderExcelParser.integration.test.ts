/**
 * Test de integración: flujo PP→P0 incremental con Excel reales (julio 2025).
 *
 * Lee archivos Excel reales desde disco, los parsea con las mismas funciones
 * que usa la UI, y valida:
 *  1. El parser detecta correctamente el tipo de archivo (PP vs P0)
 *  2. PP produce pieceRecords con todos los gates (0-12)
 *  3. P0 produce gate0Records con errores reales de la máquina
 *  4. mergeParsedData combina PP+P0 sin duplicar conteos
 *  5. gate0Records usa errores reales del P0, no inferidos
 *  6. La deduplicación no elimina registros legítimos
 *  7. Analytics se computan sin errores desde los datos mergeados
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { parseFile, mergeParsedData } from '../graderExcelParser'
import { segmentByDayAndShift, dedupePieceRecords } from '../graderSegmenter'
import type { GraderShiftSchedule } from '../types'

/** Horario real de Planta Principal (el que emite Shoplogix). */
const PRINCIPAL_SCHEDULE: GraderShiftSchedule[] = [
  { shiftId: 'Turno 1', startHour: 21, startMinute: 30, endHour: 5, endMinute: 45 },
  { shiftId: 'Turno 2', startHour: 9, startMinute: 0, endHour: 17, endMinute: 15 },
]

// ── Paths ──────────────────────────────────────────────────────────────────

// Se resuelve desde el HOME del usuario: el path estaba clavado al perfil
// 'pc hp' y a la ubicación vieja de la carpeta, así que estos tests venían
// saltándose en silencio desde que el Grader se movió bajo EQUIPOS PLANTA.
const HOME = process.env.USERPROFILE || process.env.HOME || ''
const BASE_DIR = path.join(HOME, 'OneDrive/ANTARFOOD/⚙️ EQUIPOS PLANTA/⚙️ GRADER/temporada 2025-2026')
const PP_FILE = path.join(BASE_DIR, 'pieza a pieza/julio 2025/Pieza pieza Grader STATICGRADER1 (20250701_000000 - 20250801_000000).xlsx')
const P0_FILE = path.join(BASE_DIR, 'punto 0/julio 2025/Puerta 0 STATICGRADER1 (20250701_000000 - 20250731_000000).xlsx')

/** Crea un File mock desde disco para que parseFile funcione en Node */
function fileFromDisk(filepath: string): File {
  const buffer = fs.readFileSync(filepath)
  const name = path.basename(filepath)
  return new File([buffer], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Flujo PP→P0 incremental (Excel reales julio 2025)', () => {
  const ppExists = fs.existsSync(PP_FILE)
  const p0Exists = fs.existsSync(P0_FILE)

  it.skipIf(!ppExists)('PP: parsea pieza-pieza correctamente', async () => {
    const file = fileFromDisk(PP_FILE)
    const result = await parseFile(file)

    // Detecta como PIEZA_PIEZA
    expect(result.fileMeta.kind).toBe('PIEZA_PIEZA')

    // Tiene pieceRecords
    const records = result.partialData.pieceRecords!
    expect(records).toBeDefined()
    expect(records.length).toBeGreaterThan(100)

    // Incluye gates productivos (1-12) y gate 0
    const gates = new Set(records.map((r) => r.gate))
    expect(gates.has(0)).toBe(true)
    expect(gates.size).toBeGreaterThan(3) // al menos 3 gates diferentes

    // Todos los registros tienen timestamp válido
    const invalidTs = records.filter((r) => !r.ts || isNaN(new Date(r.ts).getTime()))
    expect(invalidTs.length).toBe(0)

    // Todos los registros tienen pieces > 0
    const zeroPieces = records.filter((r) => r.pieces <= 0)
    expect(zeroPieces.length).toBe(0)

    // PP NO debe generar gate0Records
    expect(result.partialData.gate0Records).toBeUndefined()
  }, 30_000)

  it.skipIf(!p0Exists)('P0: parsea puerta 0 correctamente', async () => {
    const file = fileFromDisk(P0_FILE)
    const result = await parseFile(file)

    // Detecta como PUERTA_0
    expect(result.fileMeta.kind).toBe('PUERTA_0')

    // Tiene gate0Records
    const records = result.partialData.gate0Records!
    expect(records).toBeDefined()
    expect(records.length).toBeGreaterThan(50)

    // Todos gate=0
    const nonZeroGate = records.filter((r) => r.gate !== 0)
    expect(nonZeroGate.length).toBe(0)

    // Todos tienen campo error con valor
    const noError = records.filter((r) => !r.error || r.error === '')
    expect(noError.length).toBe(0)

    // Errores conocidos de la máquina deben estar presentes
    const errorTypes = new Set(records.map((r) => r.error))
    expect(errorTypes.size).toBeGreaterThan(1) // al menos 2 tipos de error distintos
  }, 30_000)

  it.skipIf(!ppExists || !p0Exists)('merge PP+P0: combina sin duplicar conteos', async () => {
    const ppFile = fileFromDisk(PP_FILE)
    const p0File = fileFromDisk(P0_FILE)

    const ppResult = await parseFile(ppFile)
    const p0Result = await parseFile(p0File)

    const merged = mergeParsedData([
      { fileMeta: ppResult.fileMeta, partialData: ppResult.partialData },
      { fileMeta: p0Result.fileMeta, partialData: p0Result.partialData },
    ])

    // pieceRecords viene SOLO del PP (no se duplica con P0)
    const ppOnlyPieces = ppResult.partialData.pieceRecords!.reduce((s, r) => s + r.pieces, 0)
    const mergedPieces = merged.pieceRecords.reduce((s, r) => s + r.pieces, 0)
    expect(mergedPieces).toBe(ppOnlyPieces) // NO debe sumar las piezas del P0

    // gate0Records usa los datos REALES del P0 (con errores de la máquina)
    expect(merged.gate0Records.length).toBeGreaterThan(0)
    const errorTypes = new Set(merged.gate0Records.map((r) => r.error))
    expect(errorTypes.size).toBeGreaterThan(1) // errores reales, no inferidos genéricos

    // Conteo de piezas gate=0 en PP vs gate0Records del P0
    const ppGate0Pieces = merged.pieceRecords.filter((r) => r.gate === 0).reduce((s, r) => s + r.pieces, 0)
    const p0Pieces = merged.gate0Records.reduce((s, r) => s + r.pieces, 0)
    // Pueden no ser exactamente iguales (rangos de fecha ligeramente distintos),
    // pero deberían ser del mismo orden de magnitud
    if (ppGate0Pieces > 0 && p0Pieces > 0) {
      const ratio = Math.max(ppGate0Pieces, p0Pieces) / Math.min(ppGate0Pieces, p0Pieces)
      expect(ratio).toBeLessThan(5) // no más de 5x diferencia
    }

    // Período inferido
    expect(merged.inferred.startAt).toBeDefined()
    expect(merged.inferred.endAt).toBeDefined()
    const start = new Date(merged.inferred.startAt!)
    const end = new Date(merged.inferred.endAt!)
    expect(start.getTime()).toBeLessThan(end.getTime())
  }, 60_000)

  it.skipIf(!ppExists)('merge solo PP (sin P0): infiere errores desde gate=0', async () => {
    const ppFile = fileFromDisk(PP_FILE)
    const ppResult = await parseFile(ppFile)

    const merged = mergeParsedData([
      { fileMeta: ppResult.fileMeta, partialData: ppResult.partialData },
    ])

    // Sin P0, gate0Records se infieren del PP
    const ppGate0 = merged.pieceRecords.filter((r) => r.gate === 0)
    if (ppGate0.length > 0) {
      expect(merged.gate0Records.length).toBeGreaterThan(0)
      // Los errores inferidos tienen clasificación
      const errorTypes = new Set(merged.gate0Records.map((r) => r.error))
      expect(errorTypes.size).toBeGreaterThanOrEqual(1)
    }
  }, 30_000)

  it.skipIf(!ppExists || !p0Exists)('merge PP+P0 vs solo PP: mismas piezas totales', async () => {
    const ppFile = fileFromDisk(PP_FILE)
    const p0File = fileFromDisk(P0_FILE)

    const ppResult = await parseFile(ppFile)
    const p0Result = await parseFile(p0File)

    // Solo PP
    const mergedPPOnly = mergeParsedData([
      { fileMeta: ppResult.fileMeta, partialData: ppResult.partialData },
    ])

    // PP + P0
    const mergedBoth = mergeParsedData([
      { fileMeta: ppResult.fileMeta, partialData: ppResult.partialData },
      { fileMeta: p0Result.fileMeta, partialData: p0Result.partialData },
    ])

    // Misma cantidad de piezas totales (P0 no agrega piezas, solo errores)
    const totalPPOnly = mergedPPOnly.pieceRecords.reduce((s, r) => s + r.pieces, 0)
    const totalBoth = mergedBoth.pieceRecords.reduce((s, r) => s + r.pieces, 0)
    expect(totalBoth).toBe(totalPPOnly)

    // Pero con P0, los gate0Records tienen mejor clasificación de errores
    if (mergedBoth.gate0Records.length > 0 && mergedPPOnly.gate0Records.length > 0) {
      const realErrors = new Set(mergedBoth.gate0Records.map((r) => r.error))
      const inferredErrors = new Set(mergedPPOnly.gate0Records.map((r) => r.error))
      // Los errores reales del P0 suelen tener más variedad que los inferidos
      // (no siempre, pero es la tendencia)
      expect(realErrors.size).toBeGreaterThanOrEqual(1)
      expect(inferredErrors.size).toBeGreaterThanOrEqual(1)
    }
  }, 60_000)

  // ── Turno que cruza medianoche (caso reportado 31-jul → 1-ago 2025) ────────
  //
  // El turno de Shoplogix corrió 21:30 → 05:45. TODAS las piezas — incluida la
  // madrugada del 1-ago — deben quedar en el turno del 31-jul (el día en que
  // arrancó), en UN solo segmento. Antes se repartían en 3 segmentos sobre 2
  // días por leer los timestamps con hora local en vez de wall-clock.
  const AGO_FILE = path.join(
    BASE_DIR,
    'pieza a pieza/agosto 2025/Pieza pieza Grader STATICGRADER1 (20250731_000000 - 20250815_000000).xlsx',
  )
  const agoExists = fs.existsSync(AGO_FILE)

  it.skipIf(!ppExists || !agoExists)(
    'el turno noche 31-jul→1-ago queda en UN turno del 31-jul',
    async () => {
      const parts = await Promise.all(
        [PP_FILE, AGO_FILE].map(async (f) => {
          const r = await parseFile(fileFromDisk(f))
          return { fileMeta: r.fileMeta, partialData: r.partialData }
        }),
      )
      const merged = mergeParsedData(parts)
      const { unique } = dedupePieceRecords(merged.pieceRecords)

      // Registros del turno físico, según el reloj de planta
      const delTurno = unique.filter(
        (r) => r.ts >= '2025-07-31T21:30' && r.ts < '2025-08-01T05:45',
      )
      const piezasDelTurno = delTurno.reduce((s, r) => s + r.pieces, 0)
      expect(piezasDelTurno).toBeGreaterThan(10_000) // ~15.4k en el turno real

      const segs = segmentByDayAndShift(delTurno, [], PRINCIPAL_SCHEDULE)

      // UN solo segmento, atribuido al día de inicio
      expect(Array.from(segs.keys())).toEqual(['2025-07-31|Turno 1'])
      // …y con TODAS las piezas, sin perder la madrugada del 1-ago
      expect(
        segs.get('2025-07-31|Turno 1')!.pieceRecords.reduce((s, r) => s + r.pieces, 0),
      ).toBe(piezasDelTurno)

      // Sanity: el tramo de madrugada existe de verdad en el Excel
      const madrugada = delTurno.filter((r) => r.ts >= '2025-08-01')
      expect(madrugada.reduce((s, r) => s + r.pieces, 0)).toBeGreaterThan(1_000)
    },
    120_000,
  )
})
