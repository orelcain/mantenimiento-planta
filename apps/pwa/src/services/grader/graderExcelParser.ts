/**
 * Parser de archivos Excel exportados desde Matrix (grader).
 *
 * Soporta 5 tipos lógicos de archivo, detectados por columnas (no por nombre).
 * Maneja cabeceras desplazadas, tildes, decimales con coma/punto, etc.
 */

/**
 * Alternativa segura a `target.push(...source)` para arrays grandes (> 50k elementos).
 * `Function.prototype.apply` y el spread operator expanden los elementos como argumentos
 * de función, lo que puede desbordlar el call stack con arrays de 100k+ elementos.
 * Esta función hace push de elementos uno a uno en un loop O(n) sin overhead de stack.
 */
function pushAll<T>(target: T[], source: readonly T[]): void {
  for (let i = 0, len = source.length; i < len; i++) target.push(source[i]!)
}

import * as XLSX from 'xlsx'
import { generateId } from '@/lib/utils'
import { CALIBRE_WEIGHT_RANGES } from './graderAnalytics'
import type {
  MatrixFileKind,
  UploadedMatrixFile,
  ParsedMatrixData,
  PieceRecord,
  Gate0Record,
  FolioRecord,
  QualitySummaryRow,
  ProductionSummaryRow,
  GraderQuality,
  GraderConservation,
  GraderProduct,
  CalibreRange,
} from './types'

// ============================================================================
// NORMALIZACIÓN
// ============================================================================

/** Quita tildes, trim, lowercase */
function norm(s: unknown): string {
  if (s == null) return ''
  return String(s)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

/** Parsea número (acepta coma decimal y sufijos de unidad como "kg", "g", "lb") */
function parseNum(v: unknown): number | undefined {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return v
  // Strip unidades al final: "10,91 kg" → "10,91", "4750 g" → "4750"
  const s = String(v)
    .trim()
    .replace(/\s*(kg|lbs?|g)\s*$/i, '')
    .replace(/\s/g, '')
    .replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? undefined : n
}

/** Parsea fecha+hora combinando columnas Fecha y Hora */
function parseDatetime(dateVal: unknown, timeVal: unknown): string | undefined {
  if (dateVal == null) return undefined

  // Si es serial de Excel (number), convertir
  if (typeof dateVal === 'number') {
    const excelDate = XLSX.SSF.parse_date_code(dateVal)
    if (!excelDate) return undefined
    const d = new Date(excelDate.y, excelDate.m - 1, excelDate.d)

    if (timeVal != null) {
      if (typeof timeVal === 'number') {
        const totalSeconds = Math.round(timeVal * 86400)
        d.setHours(Math.floor(totalSeconds / 3600))
        d.setMinutes(Math.floor((totalSeconds % 3600) / 60))
        d.setSeconds(totalSeconds % 60)
      } else {
        const parts = String(timeVal).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
        if (parts) {
          d.setHours(Number(parts[1]), Number(parts[2]), Number(parts[3] || 0))
        }
      }
    }
    return d.toISOString()
  }

  // Si es string
  const ds = String(dateVal).trim()
  let base = new Date(ds)

  // Intentar formato dd/mm/yyyy o dd-mm-yyyy
  if (isNaN(base.getTime())) {
    const m = ds.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/)
    if (m) {
      const year = m[3]!.length === 2 ? 2000 + Number(m[3]) : Number(m[3])
      base = new Date(year, Number(m[2]) - 1, Number(m[1]))
    }
  }

  if (isNaN(base.getTime())) return undefined

  if (timeVal != null && typeof timeVal !== 'number') {
    const parts = String(timeVal).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/)
    if (parts) {
      base.setHours(Number(parts[1]), Number(parts[2]), Number(parts[3] || 0))
    }
  } else if (typeof timeVal === 'number') {
    const totalSeconds = Math.round(timeVal * 86400)
    base.setHours(Math.floor(totalSeconds / 3600))
    base.setMinutes(Math.floor((totalSeconds % 3600) / 60))
    base.setSeconds(totalSeconds % 60)
  }

  return base.toISOString()
}

/** Normaliza calidad a GraderQuality */
function normalizeQuality(v: unknown): GraderQuality {
  const s = norm(v)
  if (!s) return 'Unknown'
  if (s.includes('premium')) return 'Premium'
  if (s.includes('grado') || s === 'grade') return 'Grado'
  if (s.includes('industrial') || s.includes('ind')) return 'Industrial'
  // Acepta 'D', 'Descarte', 'CALIDAD D' (formato Matrix)
  if (s === 'd' || s.includes('descarte') || s.includes('calidad d') || s.endsWith(' d')) return 'D'
  return 'Unknown'
}

/** Normaliza calibre a CalibreRange.
 * Soporta formatos: "6-8", "6-8 lb", "HG 6-8", "HG6-8",
 * "10-UP", "Fuera de Rango", "fuera rango", etc.
 */
function normalizeCalibre(v: unknown): CalibreRange {
  const raw = norm(v)
  if (!raw) return 'Other'

  // "Fuera de Rango" / "Out of Range" → Other (special value kept in raw)
  if (raw.includes('fuera') && raw.includes('rango')) return 'Other'
  if (raw.includes('out') && raw.includes('range')) return 'Other'

  const s = raw.replace(/\s+/g, '').replace('–', '-').replace('—', '-')
  // Strip "HG" / "hg" prefix (e.g. "HG 6-8" → "6-8")
  const stripped = s.replace(/^hg/i, '')

  // Handle "10-UP", "12-Up", "N-UP", "10+", "10-mas" — todos al calibre máximo
  if (/\d+\s*[-]?\s*(up|mas|\+)/i.test(stripped) || /10\s*-\s*12/.test(stripped)) return '10-12 lb'
  // E.g. "6-8", "6-8 lb", "6-8lb"
  const m = stripped.match(/(\d+)\s*-\s*(\d+)/)
  if (m) {
    const lb = `${m[1]}-${m[2]} lb`
    const valid: CalibreRange[] = ['0-2 lb', '2-4 lb', '4-6 lb', '6-8 lb', '8-10 lb', '10-12 lb']
    return valid.includes(lb as CalibreRange) ? (lb as CalibreRange) : 'Other'
  }
  return 'Other'
}

function normalizeConservation(v: unknown): GraderConservation | undefined {
  const s = norm(v)
  if (!s || s === '-') return undefined
  if (s === 'congelado' || s === 'frozen') return 'CONGELADO'
  if (s === 'fresco' || s === 'fresh') return 'FRESCO'
  return 'OTRO'
}

function normalizeProduct(v: unknown): GraderProduct | string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  if (!s || s === '-') return undefined
  const u = s.toUpperCase()
  if (u === 'HG') return 'HG'
  if (u === 'DESTINO FILETE' || u === 'FILETE') return 'DESTINO FILETE'
  return s // preservar string legacy/desconocido
}

/** Extrae el calibre original ("HG 6-8", "Fuera de Rango") para mostrar en reportes */
function extractRawCalibre(v: unknown): string {
  if (v == null) return 'Sin dato'
  const s = String(v).trim()
  return s || 'Sin dato'
}

// ============================================================================
// COLUMN DETECTION (ESQUEMA POR TIPO DE ARCHIVO)
// ============================================================================

/** Columnas clave para detección de tipo de archivo */
const DETECTION_SCHEMAS: Record<MatrixFileKind, { required: string[][]; optional: string[][] }> = {
  PIEZA_PIEZA: {
    required: [
      ['gate', 'compuerta', 'puerta'],
      ['cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad'],
    ],
    optional: [
      ['calidad', 'quality'],
      ['calibre', 'size', 'tamano'],
      ['peso de las piezas', 'peso piezas', 'peso', 'weight'],
    ],
  },
  PUERTA_0: {
    required: [
      ['error', 'motivo', 'causa', 'reason'],
      ['cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad'],
    ],
    optional: [
      ['gate', 'compuerta', 'puerta'],
      ['peso de las piezas', 'peso', 'weight'],
    ],
  },
  PORC_CALIDAD: {
    required: [
      ['calidad', 'quality'],
      ['calibre', 'size', 'tamano'],
      ['%', 'porcentaje', 'pct', 'percent'],
    ],
    optional: [
      ['cantidad de piezas', 'cant. piezas', 'piezas'],
    ],
  },
  TOTALES_PRODUCCION: {
    required: [
      ['calibre', 'size', 'tamano'],
      ['cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad'],
    ],
    optional: [
      ['%', 'porcentaje', 'pct'],
      ['peso de la pieza', 'peso pieza', 'peso promedio', 'avg weight'],
    ],
  },
  TOTAL_PIEZAS_POR_FOLIO: {
    required: [
      ['lote', 'folio', 'lot', 'batch'],
      ['cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad'],
    ],
    optional: [
      ['hora inicio', 'start', 'inicio'],
      ['hora termino', 'hora fin', 'end', 'termino'],
      ['peso prom', 'peso promedio', 'avg weight'],
    ],
  },
  UNKNOWN: { required: [], optional: [] },
}

/** Encuentra la fila de cabecera real (puede estar desplazada) */
function findHeaderRow(rows: unknown[][]): { rowIndex: number; headers: string[] } | null {
  const maxScan = Math.min(rows.length, 50)

  for (let i = 0; i < maxScan; i++) {
    const row = rows[i]
    if (!row || !Array.isArray(row)) continue

    const normalized = row.map((c) => norm(c))
    // Must have at least 2 non-empty cells
    const nonEmpty = normalized.filter((c) => c.length > 0)
    if (nonEmpty.length < 2) continue

    // Check if this looks like a header: contains known column names
    const knownColumns = [
      'gate', 'compuerta', 'puerta', 'calidad', 'quality', 'calibre', 'size',
      'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad',
      'peso de las piezas', 'peso piezas', 'peso', 'weight',
      'error', 'motivo', 'causa', 'fecha', 'hora', 'lote', 'folio',
      '%', 'porcentaje', 'turno', 'producto', 'conservacion',
      'hora inicio', 'hora termino', 'peso prom', 'peso promedio',
    ]

    let matches = 0
    for (const cell of normalized) {
      if (knownColumns.some((k) => cell.includes(k))) matches++
    }

    if (matches >= 2) {
      return { rowIndex: i, headers: normalized }
    }
  }
  return null
}

/** Detecta el tipo de Excel por sus columnas y opcionalmente el nombre de archivo */
export function detectFileKind(sheetRows: unknown[][], filename?: string): MatrixFileKind {
  // Filename-based hint: if filename clearly indicates Puerta 0 / Punto Cero
  const nameLower = (filename || '').toLowerCase()
  const filenameHintP0 = nameLower.includes('puerta 0') || nameLower.includes('puerta0')
    || nameLower.includes('punto cero') || nameLower.includes('puntocero')
    || /\bp\.?0\b/.test(nameLower)
  const filenameHintPP = nameLower.includes('pieza') || nameLower.includes('piece')

  const headerInfo = findHeaderRow(sheetRows)
  if (!headerInfo) {
    // Sin cabecera: usar pista del nombre
    if (filenameHintP0) return 'PUERTA_0'
    if (filenameHintPP) return 'PIEZA_PIEZA'
    return 'UNKNOWN'
  }

  const { headers } = headerInfo

  function matchesGroup(group: string[]): boolean {
    return group.some((variant) => headers.some((h) => h.includes(variant)))
  }

  // Si el nombre indica claramente Puerta 0 y las columnas son compatibles
  if (filenameHintP0) {
    const hasPieces = matchesGroup(['cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad'])
    if (hasPieces) return 'PUERTA_0'
  }

  // Check each kind (order matters: more specific first)
  // PUERTA_0 has "error" column - very distinctive.
  // La columna "Error" es exclusiva del archivo Puerta 0 de la máquina Marelec.
  // Si el archivo tiene "Error" + "Cantidad de piezas", es PUERTA_0 sin importar
  // que también tenga "Calidad" u otras columnas.
  const hasPuerta0 = DETECTION_SCHEMAS.PUERTA_0.required.every(matchesGroup)
  if (hasPuerta0) {
    return 'PUERTA_0'
  }

  // PIEZA_PIEZA: has gate + pieces + usually quality/calibre
  if (DETECTION_SCHEMAS.PIEZA_PIEZA.required.every(matchesGroup)) {
    const hasQuality = headers.some((h) => h.includes('calidad') || h.includes('quality'))
    const hasCalibre = headers.some((h) => h.includes('calibre') || h.includes('size'))
    if (hasQuality || hasCalibre) return 'PIEZA_PIEZA'
    // If no quality/calibre but has error, it's PUERTA_0
    if (hasPuerta0) return 'PUERTA_0'
    // Filename hint as tiebreaker
    if (filenameHintP0) return 'PUERTA_0'
    return 'PIEZA_PIEZA' // default if has gate + pieces
  }

  if (DETECTION_SCHEMAS.PORC_CALIDAD.required.every(matchesGroup)) return 'PORC_CALIDAD'
  if (DETECTION_SCHEMAS.TOTAL_PIEZAS_POR_FOLIO.required.every(matchesGroup)) return 'TOTAL_PIEZAS_POR_FOLIO'
  if (DETECTION_SCHEMAS.TOTALES_PRODUCCION.required.every(matchesGroup)) return 'TOTALES_PRODUCCION'

  return 'UNKNOWN'
}

// ============================================================================
// COLUMN INDEX MAP
// ============================================================================

interface ColumnMap { [normalizedName: string]: number }

function buildColumnMap(headers: string[]): ColumnMap {
  const map: ColumnMap = {}
  headers.forEach((h, i) => {
    if (h) map[h] = i
  })
  return map
}

/** Busca primer match de variantes en el column map.
 * Primero intenta exact match, luego partial (solo key.includes(v), NO al revés
 * para evitar falsos positivos con variantes cortas como 'peso').
 */
function col(map: ColumnMap, ...variants: string[]): number | undefined {
  // Pass 1: exact match
  for (const v of variants) {
    if (map[v] !== undefined) return map[v]
  }
  // Pass 2: key includes variant (e.g. "peso de las piezas" includes "peso piezas")
  for (const v of variants) {
    if (v.length < 4) continue // skip very short variants to avoid false matches
    for (const key of Object.keys(map)) {
      if (key.includes(v)) return map[key]
    }
  }
  // Pass 3: variant includes key (for backward compat, but only for longer keys)
  for (const v of variants) {
    for (const key of Object.keys(map)) {
      if (key.length >= 4 && v.includes(key)) return map[key]
    }
  }
  return undefined
}

// ============================================================================
// PARSERS POR TIPO
// ============================================================================

function parsePiezaPieza(rows: unknown[][], headerIdx: number, colMap: ColumnMap): PieceRecord[] {
  const records: PieceRecord[] = []
  const iGate = col(colMap, 'gate', 'compuerta', 'puerta')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightGrams = col(colMap, 'peso en gr', 'peso en gramos', 'weight gr', 'weight grams')
  const iQuality = col(colMap, 'calidad', 'quality')
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')
  const iError = col(colMap, 'error', 'motivo', 'causa', 'reason')
  const iDate = col(colMap, 'fecha', 'date')
  const iTime = col(colMap, 'hora', 'time')
  const iLot = col(colMap, 'lote', 'lot', 'folio')
  const iProduct = col(colMap, 'producto', 'product')
  const iConservation = col(colMap, 'conservacion', 'conservation', 'conservación')
  const iShift = col(colMap, 'turno', 'shift')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue

    const ts = parseDatetime(
      iDate != null ? row[iDate] : undefined,
      iTime != null ? row[iTime] : undefined,
    )
    // Evitar contar filas resumen/total sin timestamp (si no hay fecha válida, no es un registro de evento)
    if (!ts) continue

    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue

    const gate = parseNum(iGate != null ? row[iGate] : undefined) ?? 0

    // For gate 0 records, read error column if available
    let errorStr: string | undefined
    if (Math.round(gate) === 0 && iError != null && row[iError] != null) {
      errorStr = String(row[iError]).trim() || undefined
    }

    // Per-piece weight in grams (column "peso en Gr")
    const weightPerPieceGrams = iWeightGrams != null ? parseNum(row[iWeightGrams]) : undefined

    // Keep raw calibre label for gate 0 display (e.g. "HG 6-8", "Fuera de Rango")
    const rawCalibreStr = iCalibre != null ? extractRawCalibre(row[iCalibre]) : undefined

    // Weight in Kg: prefer "peso de las piezas", fallback to computing from grams
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }

    const shiftRaw = iShift != null && row[iShift] != null ? String(row[iShift]).trim() : undefined
    const rec: PieceRecord = {
      ts,
      gate: Math.round(gate),
      pieces,
      weightKg,
      weightPerPieceGrams,
      quality: iQuality != null ? normalizeQuality(row[iQuality]) : undefined,
      calibre: iCalibre != null ? normalizeCalibre(row[iCalibre]) : undefined,
      error: errorStr,
      lot: iLot != null ? (row[iLot] != null ? String(row[iLot]).trim() : undefined) : undefined,
      product: iProduct != null ? normalizeProduct(row[iProduct]) : undefined,
      conservation: iConservation != null ? normalizeConservation(row[iConservation]) : undefined,
      shift: shiftRaw || undefined,
      raw: rawCalibreStr ? { rawCalibre: rawCalibreStr } : undefined,
    }
    records.push(rec)
  }
  return records
}

function parsePuerta0(rows: unknown[][], headerIdx: number, colMap: ColumnMap): Gate0Record[] {
  const records: Gate0Record[] = []
  const iError = col(colMap, 'error', 'motivo', 'causa', 'reason')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightGrams = col(colMap, 'peso en gr', 'peso en gramos', 'weight gr', 'weight grams')
  const iDate = col(colMap, 'fecha', 'date')
  const iTime = col(colMap, 'hora', 'time')
  const iQuality = col(colMap, 'calidad', 'quality')
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')
  const iLot = col(colMap, 'lote', 'lot', 'folio')
  const iShift = col(colMap, 'turno', 'shift')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue

    const ts = parseDatetime(
      iDate != null ? row[iDate] : undefined,
      iTime != null ? row[iTime] : undefined,
    )
    // El archivo P0 a veces incluye filas resumen (totales) sin fecha/hora.
    // No son eventos reales → si no hay timestamp válido, se descarta.
    if (!ts) continue

    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue

    const errorStrRaw = iError != null && row[iError] != null ? String(row[iError]).trim() : ''
    // Ignorar filas resumen tipo "TOTAL" en la columna Error
    const errorNorm = norm(errorStrRaw)
    if (errorNorm === 'total' || errorNorm.startsWith('total ')
      || errorNorm === 'subtotal' || errorNorm.startsWith('subtotal ')) {
      continue
    }
    const errorStr = errorStrRaw || 'Desconocido'
    const weightPerPieceGrams = iWeightGrams != null ? parseNum(row[iWeightGrams]) : undefined
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    // Algunos reportes P0 traen "Peso de las piezas" en gramos (no kg).
    // Heurística: si el número es enorme, asumir gramos y convertir a kg.
    if (weightKg != null && weightKg > 5000) {
      weightKg = weightKg / 1000
    }
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }
    const rawCalibreStr = iCalibre != null ? extractRawCalibre(row[iCalibre]) : undefined

    const shiftRaw = iShift != null && row[iShift] != null ? String(row[iShift]).trim() : undefined
    const rec: Gate0Record = {
      ts,
      gate: 0,
      pieces,
      weightKg,
      weightPerPieceGrams,
      error: errorStr,
      quality: iQuality != null ? normalizeQuality(row[iQuality]) : undefined,
      calibre: iCalibre != null ? normalizeCalibre(row[iCalibre]) : undefined,
      lot: iLot != null ? (row[iLot] != null ? String(row[iLot]).trim() : undefined) : undefined,
      shift: shiftRaw || undefined,
      raw: rawCalibreStr ? { rawCalibre: rawCalibreStr } : undefined,
    }
    records.push(rec)
  }
  return records
}

function parsePorcCalidad(rows: unknown[][], headerIdx: number, colMap: ColumnMap): QualitySummaryRow[] {
  const records: QualitySummaryRow[] = []
  const iQuality = col(colMap, 'calidad', 'quality')
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iPct = col(colMap, '%', 'porcentaje', 'pct', 'percent')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'peso', 'weight')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue

    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null) continue

    records.push({
      quality: iQuality != null ? normalizeQuality(row[iQuality]) : 'Unknown',
      calibre: iCalibre != null ? normalizeCalibre(row[iCalibre]) : 'Other',
      pieces,
      pct: iPct != null ? parseNum(row[iPct]) : undefined,
      weightKg: iWeight != null ? parseNum(row[iWeight]) : undefined,
    })
  }
  return records
}

function parseTotalesProduccion(rows: unknown[][], headerIdx: number, colMap: ColumnMap): ProductionSummaryRow[] {
  const records: ProductionSummaryRow[] = []
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iPct = col(colMap, '%', 'porcentaje', 'pct', 'percent')
  const iAvgWeight = col(colMap, 'peso de la pieza', 'peso pieza', 'peso promedio', 'avg weight')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'peso', 'weight')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue

    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null) continue

    records.push({
      calibre: iCalibre != null ? normalizeCalibre(row[iCalibre]) : 'Other',
      pieces,
      pct: iPct != null ? parseNum(row[iPct]) : undefined,
      avgPieceWeightKg: iAvgWeight != null ? parseNum(row[iAvgWeight]) : undefined,
      weightKg: iWeight != null ? parseNum(row[iWeight]) : undefined,
    })
  }
  return records
}

function parseTotalPiezasFolio(rows: unknown[][], headerIdx: number, colMap: ColumnMap): FolioRecord[] {
  const records: FolioRecord[] = []
  const iLot = col(colMap, 'lote', 'folio', 'lot', 'batch')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'peso', 'weight')
  const iAvg = col(colMap, 'peso prom', 'peso promedio', 'avg weight')
  const iStart = col(colMap, 'hora inicio', 'start', 'inicio')
  const iEnd = col(colMap, 'hora termino', 'hora fin', 'end', 'termino')
  const iDate = col(colMap, 'fecha', 'date')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue

    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null) continue

    records.push({
      lot: iLot != null ? (row[iLot] != null ? String(row[iLot]).trim() : undefined) : undefined,
      pieces,
      weightKg: iWeight != null ? parseNum(row[iWeight]) : undefined,
      avgWeightKg: iAvg != null ? parseNum(row[iAvg]) : undefined,
      startAt: parseDatetime(iDate != null ? row[iDate] : undefined, iStart != null ? row[iStart] : undefined),
      endAt: parseDatetime(iDate != null ? row[iDate] : undefined, iEnd != null ? row[iEnd] : undefined),
    })
  }
  return records
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Parsea un archivo Excel y devuelve su tipo + datos parciales.
 */
export async function parseFile(file: File): Promise<{
  fileMeta: UploadedMatrixFile
  partialData: Partial<ParsedMatrixData>
}> {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: false })

  const warnings: string[] = []
  const partial: Partial<ParsedMatrixData> = {}

  // Use first sheet
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) {
    throw new Error(`Archivo "${file.name}" no contiene hojas.`)
  }

  const sheet = workbook.Sheets[sheetName]!
  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

  const kind = detectFileKind(rows, file.name)
  console.info(`[grader parse] "${file.name}" → detectado como ${kind}`)
  if (kind === 'UNKNOWN') {
    warnings.push('No se pudo detectar el tipo de archivo. Verifique las columnas.')
  }

  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) {
    warnings.push('No se encontró fila de cabecera válida.')
  }

  if (headerInfo && kind !== 'UNKNOWN') {
    const colMap = buildColumnMap(headerInfo.headers)

    switch (kind) {
      case 'PIEZA_PIEZA': {
        // PP produce SOLO pieceRecords (todos los gates, incluyendo gate=0).
        // NUNCA produce gate0Records — eso lo hace mergeParsedData.
        const records = parsePiezaPieza(rows, headerInfo.rowIndex, colMap)
        partial.pieceRecords = records
        const g0Count = records.filter((r) => r.gate === 0).length
        if (g0Count > 0) {
          warnings.push(`Se encontraron ${g0Count} registros Gate 0 en archivo pieza-pieza.`)
        }
        break
      }
      case 'PUERTA_0':
        partial.gate0Records = parsePuerta0(rows, headerInfo.rowIndex, colMap)
        break
      case 'PORC_CALIDAD':
        partial.qualitySummary = parsePorcCalidad(rows, headerInfo.rowIndex, colMap)
        break
      case 'TOTALES_PRODUCCION':
        partial.productionSummary = parseTotalesProduccion(rows, headerInfo.rowIndex, colMap)
        break
      case 'TOTAL_PIEZAS_POR_FOLIO':
        partial.folioRecords = parseTotalPiezasFolio(rows, headerInfo.rowIndex, colMap)
        break
    }

    // Infer period from timestamps
    const allTs: string[] = [
      ...(partial.pieceRecords || []).map((r) => r.ts),
      ...(partial.gate0Records || []).map((r) => r.ts),
      ...(partial.folioRecords || []).filter((r) => r.startAt).map((r) => r.startAt!),
    ].filter(Boolean)

    if (allTs.length > 0) {
      allTs.sort()
      partial.inferred = {
        startAt: allTs[0],
        endAt: allTs[allTs.length - 1],
      }
    }
  }

  const fileMeta: UploadedMatrixFile = {
    id: generateId(),
    name: file.name,
    kind,
    sizeBytes: file.size,
    parsedAt: new Date().toISOString(),
    warnings,
  }

  return { fileMeta, partialData: partial }
}

/**
 * Convierte PieceRecords con gate=0 (del PP) a Gate0Records con error inferido.
 * Solo se usa cuando NO hay archivo Puerta 0.
 */
function inferGate0FromPieceRecords(records: PieceRecord[]): Gate0Record[] {
  return records.map((r) => {
    // Inferir error según peso y calibre
    let error = r.error || ''
    if (!error) {
      let perPieceG = r.weightPerPieceGrams
      if (!perPieceG && r.weightKg && r.pieces > 0) {
        perPieceG = (r.weightKg / r.pieces) * 1000
      }

      if (!perPieceG || perPieceG < 10) {
        error = 'No leido por fotocelula'
      } else {
        const rawCalibre = (r.raw?.rawCalibre as string) || ''
        const isFueraDeRango = rawCalibre.toLowerCase().includes('fuera') && rawCalibre.toLowerCase().includes('rango')
        if (isFueraDeRango) {
          error = 'Fuera de Rango'
        } else {
          const matchedRange = CALIBRE_WEIGHT_RANGES.find(
            (rng) => perPieceG! >= rng.minGrams && perPieceG! < rng.maxGrams,
          )
          error = matchedRange ? 'Fuera de limites' : 'Fuera de Rango'
        }
      }
    }

    // Calibre real basado en peso
    let actualCalibre = r.calibre
    let actualRawCalibre = r.raw?.rawCalibre as string | undefined
    let perPieceG = r.weightPerPieceGrams
    if (!perPieceG && r.weightKg && r.pieces > 0) {
      perPieceG = (r.weightKg / r.pieces) * 1000
    }
    if (perPieceG && perPieceG > 0) {
      const matchedRange = CALIBRE_WEIGHT_RANGES.find(
        (rng) => perPieceG! >= rng.minGrams && perPieceG! < rng.maxGrams,
      )
      if (matchedRange) {
        actualCalibre = matchedRange.calibre as CalibreRange
        actualRawCalibre = `HG ${matchedRange.calibre.replace(' lb', '')}`
      } else {
        actualCalibre = 'Other'
        actualRawCalibre = 'Fuera de Rango'
      }
    }

    return {
      ts: r.ts,
      gate: 0 as const,
      pieces: r.pieces,
      weightKg: r.weightKg,
      weightPerPieceGrams: r.weightPerPieceGrams,
      error,
      quality: r.quality,
      calibre: actualCalibre,
      lot: r.lot,
      raw: { ...(r.raw || {}), rawCalibre: actualRawCalibre || (r.raw?.rawCalibre) },
    }
  })
}

/**
 * Combina datos parciales de múltiples archivos en un ParsedMatrixData completo.
 *
 * LÓGICA CLAVE:
 * ─ PP (Pieza-Pieza) = registro COMPLETO de TODO lo que pasa por la máquina.
 *   Incluye gates 1-12 y gate 0. El total del PP ES el total real.
 * ─ P0 (Puerta 0) = DETALLE de las piezas que fueron a gate 0.
 *   Son las MISMAS piezas que ya están en PP, pero con la columna Error.
 *
 * Algoritmo:
 * 1. pieceRecords = TODOS los registros del PP (incluyendo gate=0).
 *    Esto es la fuente de verdad para CONTEO y TOTALES.
 * 2. gate0Records = datos del P0 (o inferidos) para CLASIFICACIÓN de errores.
 *    NO se usan para conteo. Solo para saber POR QUÉ fueron a gate 0.
 * 3. Total = sum(pieceRecords). NUNCA se suma gate0Records al total.
 */
export function mergeParsedData(
  parts: Array<{ fileMeta: UploadedMatrixFile; partialData: Partial<ParsedMatrixData> }>,
): ParsedMatrixData {
  const merged: ParsedMatrixData = {
    files: parts.map((p) => ({ ...p.fileMeta })),
    pieceRecords: [],
    gate0Records: [],
    folioRecords: [],
    qualitySummary: [],
    productionSummary: [],
    inferred: {},
  }

  // ─── Paso 1: Recopilar datos de todos los archivos ───
  const realGate0Records: Gate0Record[] = []
  let hasP0File = false

  for (const { fileMeta, partialData } of parts) {
    // Detectar P0 mal clasificado como PP:
    // Un archivo donde TODOS los pieceRecords tienen gate=0 es un P0.
    const allPiecesAreGate0 = partialData.pieceRecords != null
      && partialData.pieceRecords.length > 0
      && partialData.pieceRecords.every((r) => r.gate === 0)

    const isP0 = fileMeta.kind === 'PUERTA_0' || allPiecesAreGate0

    if (isP0) {
      hasP0File = true
      const metaInMerged = merged.files.find((f) => f.id === fileMeta.id || f.name === fileMeta.name)
      if (metaInMerged) metaInMerged.kind = 'PUERTA_0'

      // Tomar gate0Records del P0 (para clasificación de errores)
      if (partialData.gate0Records && partialData.gate0Records.length > 0) {
        pushAll(realGate0Records, partialData.gate0Records)
      }
      // Si P0 fue parseado como PP, convertir pieceRecords a gate0Records
      if (partialData.pieceRecords && partialData.pieceRecords.length > 0
        && (!partialData.gate0Records || partialData.gate0Records.length === 0)) {
        for (const r of partialData.pieceRecords.filter((r) => r.gate === 0)) {
          realGate0Records.push({
            ts: r.ts, gate: 0, pieces: r.pieces,
            weightKg: r.weightKg, weightPerPieceGrams: r.weightPerPieceGrams,
            error: r.error || 'Desconocido',
            quality: r.quality, calibre: r.calibre, lot: r.lot, raw: r.raw,
          })
        }
      }
      // NO agregar pieceRecords del P0 (ya están en el PP como gate=0)
      console.info(`[grader merge] "${fileMeta.name}" → P0 (${realGate0Records.length} registros para clasificación)`)
    } else {
      // PP: agregar TODOS los pieceRecords (incluyendo gate=0)
      if (partialData.pieceRecords) {
        pushAll(merged.pieceRecords, partialData.pieceRecords)
      }
      console.info(`[grader merge] "${fileMeta.name}" → PP (${partialData.pieceRecords?.length ?? 0} pieceRecords)`)
    }

    if (partialData.folioRecords) pushAll(merged.folioRecords, partialData.folioRecords)
    if (partialData.qualitySummary) pushAll(merged.qualitySummary, partialData.qualitySummary)
    if (partialData.productionSummary) pushAll(merged.productionSummary, partialData.productionSummary)
  }

  // ─── Paso 2: gate0Records para CLASIFICACIÓN de errores (NO para conteo) ───
  const ppGate0 = merged.pieceRecords.filter((r) => r.gate === 0)

  if (hasP0File && realGate0Records.length > 0) {
    // P0 tiene datos reales con columna Error de la máquina
    merged.gate0Records = realGate0Records
    console.info(`[grader merge] Clasificación P0: ${realGate0Records.length} registros REALES`)
  } else {
    // Inferir errores desde gate=0 del PP
    merged.gate0Records = inferGate0FromPieceRecords(ppGate0)
    console.info(`[grader merge] Clasificación P0: ${ppGate0.length} registros INFERIDOS del PP`)
  }

  // pieceRecords NO se modifica — conserva gate=0. ES la fuente de verdad.
  const totalFromPP = merged.pieceRecords.reduce((s, r) => s + r.pieces, 0)
  const gate0FromPP = ppGate0.reduce((s, r) => s + r.pieces, 0)
  console.info(
    `[grader merge] TOTAL PP: ${totalFromPP} piezas (${gate0FromPP} gate=0). ` +
    `gate0Records: ${merged.gate0Records.length} (solo para clasificación de errores).`,
  )

  // Infer overall period
  const allTs: string[] = [
    ...merged.pieceRecords.map((r) => r.ts),
    ...merged.gate0Records.map((r) => r.ts),
    ...merged.folioRecords.filter((r) => r.startAt).map((r) => r.startAt!),
  ].filter(Boolean)

  if (allTs.length > 0) {
    allTs.sort()
    merged.inferred.startAt = allTs[0]
    merged.inferred.endAt = allTs[allTs.length - 1]
  }

  return merged
}
