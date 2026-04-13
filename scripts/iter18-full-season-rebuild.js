/**
 * Iter 18: REBUILD completo de graderDailySummaries desde los Excel locales.
 *
 * Input: C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026
 *   - pieza a pieza/*  (PP files con gate, piezas, calibre, calidad, error)
 *   - punto 0/*        (P0 files con causas de error)
 *
 * Flujo:
 *   1. Lee todos los .xlsx recursivamente de ambas carpetas
 *   2. Parsea cada uno según su tipo (PP o P0)
 *   3. Aplica dedupe por (ts + gate + pieces + quality + calibre)
 *   4. Segmenta TIMESTAMP-FIRST por día/noche
 *   5. Computa summary con hourlyBuckets para cada segmento
 *   6. WIPE completo de graderDailySummaries
 *   7. Save todos los nuevos summaries en batches
 */
const admin = require('firebase-admin')
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
  })
}

const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const DRY_RUN = process.argv.includes('--dry-run')
if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada en Firestore\n')

const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const PP_DIR = path.join(BASE_DIR, 'pieza a pieza')
const P0_DIR = path.join(BASE_DIR, 'punto 0')

// ── Helpers ─────────────────────────────────────────────────────────────────
function norm(s) {
  if (s == null) return ''
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function parseNum(v) {
  if (v == null || v === '') return undefined
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined
  const s = String(v).trim().replace(/\s/g, '').replace(/,/g, '.').replace(/[^0-9.\-]/g, '')
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : undefined
}

function findHeaderRow(rows) {
  const maxScan = Math.min(rows.length, 50)
  for (let i = 0; i < maxScan; i++) {
    const row = rows[i]
    if (!row || !Array.isArray(row)) continue
    const cells = row.map((c) => norm(c)).filter(Boolean)
    if (cells.length < 3) continue
    const hasFecha = cells.some((c) => c === 'fecha' || c === 'date')
    const hasPiezas = cells.some((c) => c.includes('pieza') || c.includes('cantidad') || c === 'qty')
    if (hasFecha && hasPiezas) return { rowIndex: i, headers: row.map((c) => norm(c)) }
  }
  return null
}

function buildColumnMap(headers) {
  const map = {}
  headers.forEach((h, i) => { if (h) map[h] = i })
  return map
}

function col(map, ...names) {
  for (const n of names) {
    const k = norm(n)
    for (const key of Object.keys(map)) {
      if (key === k || key.includes(k)) return map[key]
    }
  }
  return null
}

function parseDatetime(dateVal, timeVal) {
  let dateStr = ''
  let timeStr = ''
  if (typeof dateVal === 'number') {
    const utc_days = Math.floor(dateVal - 25569)
    const utc_value = utc_days * 86400
    const date_info = new Date(utc_value * 1000)
    dateStr = date_info.toISOString().slice(0, 10)
  } else if (dateVal != null) {
    const s = String(dateVal).trim()
    const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (m1) {
      const [, d, mo, y] = m1
      dateStr = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      dateStr = s.slice(0, 10)
    }
  }
  if (typeof timeVal === 'number') {
    const totalSec = Math.round(timeVal * 86400)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  } else if (timeVal != null) {
    const s = String(timeVal).trim()
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (m) timeStr = `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`
  }
  if (!dateStr) return null
  if (!timeStr) timeStr = '00:00:00'
  return `${dateStr}T${timeStr}.000Z`
}

function detectKind(headers, filename) {
  const nameLower = (filename || '').toLowerCase()
  const hintP0 = nameLower.includes('puerta 0') || nameLower.includes('puerta0')
    || nameLower.includes('punto cero') || /\bp\.?0\b/.test(nameLower)
  const hintPP = nameLower.includes('pieza a pieza') || nameLower.includes('pieza pieza')

  const hasGate = headers.some((h) => h && (h === 'gate' || h === 'compuerta' || h.includes('compuerta')))
  const hasError = headers.some((h) => h && (h === 'error' || h === 'motivo' || h === 'causa'))
  const hasPieces = headers.some((h) => h && (h.includes('pieza') || h === 'qty' || h === 'cantidad'))
  const hasQuality = headers.some((h) => h && (h.includes('calidad') || h.includes('quality')))
  const hasCalibre = headers.some((h) => h && (h.includes('calibre') || h.includes('size')))

  // Hint del nombre + columnas compatibles
  if (hintP0 && hasPieces && hasError) return 'PUERTA_0'
  if (hintPP && hasGate && hasPieces) return 'PIEZA_PIEZA'

  // PP: tiene gate + pieces + (quality o calibre)
  if (hasGate && hasPieces && (hasQuality || hasCalibre)) return 'PIEZA_PIEZA'
  // P0: tiene error + pieces pero NO gate (o solo tiene "puerta 0" como label)
  if (hasError && hasPieces && !hasGate) return 'PUERTA_0'
  // Default: si tiene gate → PP, si tiene error → P0
  if (hasGate && hasPieces) return 'PIEZA_PIEZA'
  if (hasError && hasPieces) return 'PUERTA_0'
  return 'UNKNOWN'
}

// ── Parsers ─────────────────────────────────────────────────────────────────
function parsePP(rows, headerIdx, colMap) {
  const records = []
  const iGate = col(colMap, 'gate', 'compuerta', 'puerta')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightGrams = col(colMap, 'peso en gr', 'peso en gramos')
  const iQuality = col(colMap, 'calidad', 'quality')
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')
  const iError = col(colMap, 'error', 'motivo', 'causa', 'reason')
  const iDate = col(colMap, 'fecha', 'date')
  const iTime = col(colMap, 'hora', 'time')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : undefined, iTime != null ? row[iTime] : undefined)
    if (!ts) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue
    const gate = parseNum(iGate != null ? row[iGate] : undefined) ?? 0
    let errorStr
    if (Math.round(gate) === 0 && iError != null && row[iError] != null) {
      errorStr = String(row[iError]).trim() || undefined
    }
    const weightPerPieceGrams = iWeightGrams != null ? parseNum(row[iWeightGrams]) : undefined
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }
    records.push({
      ts,
      gate: Math.round(gate),
      pieces,
      weightKg,
      quality: iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined,
      calibre: iCalibre != null && row[iCalibre] != null ? String(row[iCalibre]).trim() : undefined,
      error: errorStr,
    })
  }
  return records
}

function parseP0(rows, headerIdx, colMap) {
  const records = []
  const iError = col(colMap, 'error', 'motivo', 'causa', 'reason')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightGrams = col(colMap, 'peso en gr', 'peso en gramos')
  const iDate = col(colMap, 'fecha', 'date')
  const iTime = col(colMap, 'hora', 'time')
  const iQuality = col(colMap, 'calidad', 'quality')
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : undefined, iTime != null ? row[iTime] : undefined)
    if (!ts) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue
    const errorStrRaw = iError != null && row[iError] != null ? String(row[iError]).trim() : ''
    const en = norm(errorStrRaw)
    if (en === 'total' || en.startsWith('total ') || en === 'subtotal' || en.startsWith('subtotal ')) continue
    const errorStr = errorStrRaw || 'Desconocido'
    const weightPerPieceGrams = iWeightGrams != null ? parseNum(row[iWeightGrams]) : undefined
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    if (weightKg != null && weightKg > 5000) weightKg = weightKg / 1000
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }
    records.push({
      ts,
      gate: 0,
      pieces,
      weightKg,
      error: errorStr,
      quality: iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined,
      calibre: iCalibre != null && row[iCalibre] != null ? String(row[iCalibre]).trim() : undefined,
    })
  }
  return records
}

// ── Dedupe (mismo criterio que el segmenter del app) ───────────────────────
function dedupePP(records) {
  const seen = new Set()
  const unique = []
  for (const r of records) {
    const key = `${r.ts}|${r.gate}|${r.pieces}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return { unique, removed: records.length - unique.length }
}

function dedupeP0(records) {
  const seen = new Set()
  const unique = []
  for (const r of records) {
    const key = `${r.ts}|${r.pieces}|${r.error ?? ''}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return { unique, removed: records.length - unique.length }
}

// ── Segmentación timestamp-first ───────────────────────────────────────────
function assignShiftAndDate(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
  const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (minutesOfDay >= 420 && minutesOfDay < 1140) {
    return { shiftId: 'Turno día', sessionDate: ts.slice(0, 10) }
  }
  if (minutesOfDay >= 1140) {
    return { shiftId: 'Turno noche', sessionDate: ts.slice(0, 10) }
  }
  const prev = new Date(d)
  prev.setUTCDate(prev.getUTCDate() - 1)
  return { shiftId: 'Turno noche', sessionDate: prev.toISOString().slice(0, 10) }
}

// ── Compute summary + hourly buckets ───────────────────────────────────────
function computeSummary(segment, sourceFileNames) {
  const { sessionDate, shiftId, pp, p0 } = segment

  // Recolectar timestamps sin spread (arrays grandes)
  const allTs = []
  for (const r of pp) if (r.ts) allTs.push(r.ts)
  for (const r of p0) if (r.ts) allTs.push(r.ts)
  allTs.sort()
  const startAt = allTs[0]
  const endAt = allTs[allTs.length - 1]
  // Duración ACTIVA: cuenta minutos únicos con al menos un registro.
  // Excluye automáticamente gaps de colación, paradas y mantenimiento.
  const activeMinutesSet = new Set()
  for (const ts of allTs) activeMinutesSet.add(ts.slice(0, 16))
  const durationMinutes = activeMinutesSet.size

  const totalPieces = pp.reduce((s, r) => s + r.pieces, 0)
  const prodRecords = pp.filter((r) => r.gate > 0)
  const prodPieces = prodRecords.reduce((s, r) => s + r.pieces, 0)

  // P0: preferir P0 records si hay, sino inferir de gate=0 en PP
  const p0Source = p0.length > 0 ? p0 : pp.filter((r) => r.gate === 0)
  const pointZeroPieces = p0Source.reduce((s, r) => s + r.pieces, 0)
  const pointZeroPct = totalPieces > 0 ? Math.round((pointZeroPieces / totalPieces) * 10000) / 100 : 0

  const rawWeightKg = prodRecords.reduce((s, r) => s + (r.weightKg ?? 0), 0)
  const totalWeightKg = rawWeightKg > 0 ? Math.round(rawWeightKg * 100) / 100 : undefined
  const avgWeightGrams = (totalWeightKg && prodPieces > 0) ? Math.round(totalWeightKg * 1000 / prodPieces) : undefined
  const productionRatePerHour = (durationMinutes > 0 && prodPieces > 0) ? Math.round(prodPieces / (durationMinutes / 60)) : undefined

  // Top causas P0
  const causeMap = new Map()
  for (const r of p0Source) {
    const e = r.error || 'Sin causa'
    causeMap.set(e, (causeMap.get(e) ?? 0) + r.pieces)
  }
  const topP0Causes = Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, pieces]) => ({ error, pieces, pct: Math.round(pieces / (pointZeroPieces || 1) * 1000) / 10 }))

  // Distribuciones
  const calibreMap = new Map()
  for (const r of prodRecords) {
    if (r.calibre) calibreMap.set(r.calibre, (calibreMap.get(r.calibre) ?? 0) + r.pieces)
  }
  const calibreDistribution = Array.from(calibreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([calibre, pieces]) => ({ calibre, pieces, pct: Math.round(pieces / (prodPieces || 1) * 1000) / 10 }))

  const qualityMap = new Map()
  for (const r of prodRecords) {
    if (r.quality) qualityMap.set(r.quality, (qualityMap.get(r.quality) ?? 0) + r.pieces)
  }
  const qualityDistribution = Array.from(qualityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([quality, pieces]) => ({ quality, pieces, pct: Math.round(pieces / (prodPieces || 1) * 1000) / 10 }))

  const gateMap = new Map()
  for (const r of prodRecords) gateMap.set(r.gate, (gateMap.get(r.gate) ?? 0) + r.pieces)
  const gateDistribution = Array.from(gateMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gate, pieces]) => ({ gate, pieces, pct: Math.round(pieces / (prodPieces || 1) * 1000) / 10 }))

  // HOURLY BUCKETS
  const hourMap = new Map()
  for (const rec of pp) {
    const d = new Date(rec.ts)
    if (isNaN(d.getTime())) continue
    const h = d.getUTCHours()
    const b = hourMap.get(h) ?? { total: 0, p0: 0 }
    b.total += rec.pieces
    if (rec.gate === 0) b.p0 += rec.pieces
    hourMap.set(h, b)
  }
  if (p0.length > 0) {
    for (const h of hourMap.keys()) hourMap.get(h).p0 = 0
    for (const rec of p0) {
      const d = new Date(rec.ts)
      if (isNaN(d.getTime())) continue
      const h = d.getUTCHours()
      const b = hourMap.get(h) ?? { total: 0, p0: 0 }
      b.p0 += rec.pieces
      hourMap.set(h, b)
    }
  }
  const hourlyBuckets = Array.from(hourMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([hour, v]) => ({ hour, totalPieces: v.total, p0Pieces: v.p0 }))

  return {
    id: `${sessionDate}__${shiftId}`,
    dateKey: sessionDate,
    shiftId,
    totalPieces,
    pointZeroPieces,
    pointZeroPct,
    startAt,
    endAt,
    durationMinutes,
    totalWeightKg,
    avgWeightGrams,
    productionRatePerHour,
    topP0Causes,
    calibreDistribution,
    qualityDistribution,
    gateDistribution,
    hourlyBuckets,
    sourceFileNames,
    batchUploadId: 'iter18-season-rebuild',
    hasPieceData: pp.length > 0,
    hasGate0Data: p0.length > 0,
    updatedBy: 'iter18-rebuild',
    updatedAt: new Date().toISOString(),
  }
}

// ── Walk directories and process ───────────────────────────────────────────
function walkXlsx(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) files.push(...walkXlsx(full))
    else if (name.endsWith('.xlsx') && !name.startsWith('~$')) files.push(full)
  }
  return files
}

function parseFile(filePath) {
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) return { kind: 'UNKNOWN', records: [] }
  const colMap = buildColumnMap(headerInfo.headers)
  const kind = detectKind(headerInfo.headers, path.basename(filePath))
  const records = kind === 'PIEZA_PIEZA'
    ? parsePP(rows, headerInfo.rowIndex, colMap)
    : kind === 'PUERTA_0'
      ? parseP0(rows, headerInfo.rowIndex, colMap)
      : []
  return { kind, records }
}

async function main() {
  console.log('=== ITER 18: FULL SEASON REBUILD ===\n')

  // 1. Listar archivos
  const ppFiles = walkXlsx(PP_DIR).filter((f) => !path.basename(f).startsWith('Totales'))
  const p0Files = walkXlsx(P0_DIR)
  console.log(`Archivos PIEZA_PIEZA: ${ppFiles.length}`)
  console.log(`Archivos PUERTA_0:    ${p0Files.length}\n`)

  // 2. Parsear todos los PP
  console.log('── Parsing PIEZA_PIEZA ──')
  const allPP = []
  const ppSources = new Set()
  for (const f of ppFiles) {
    const { kind, records } = parseFile(f)
    const name = path.basename(f)
    if (kind !== 'PIEZA_PIEZA') {
      console.log(`  ⚠️  ${name}: kind=${kind}, skip`)
      continue
    }
    console.log(`  ✓ ${name.slice(0, 70)} → ${records.length} records`)
    for (let i = 0; i < records.length; i++) allPP.push(records[i])
    ppSources.add(name)
  }
  console.log(`Total PP records raw: ${allPP.length}`)
  const ppDedup = dedupePP(allPP)
  console.log(`Dedupe: -${ppDedup.removed} duplicados → ${ppDedup.unique.length}\n`)

  // 3. Parsear todos los P0
  console.log('── Parsing PUERTA_0 ──')
  const allP0 = []
  const p0Sources = new Set()
  for (const f of p0Files) {
    const { kind, records } = parseFile(f)
    const name = path.basename(f)
    if (kind !== 'PUERTA_0') {
      console.log(`  ⚠️  ${name}: kind=${kind}, skip`)
      continue
    }
    console.log(`  ✓ ${name.slice(0, 70)} → ${records.length} records`)
    for (let i = 0; i < records.length; i++) allP0.push(records[i])
    p0Sources.add(name)
  }
  console.log(`Total P0 records raw: ${allP0.length}`)
  const p0Dedup = dedupeP0(allP0)
  console.log(`Dedupe: -${p0Dedup.removed} duplicados → ${p0Dedup.unique.length}\n`)

  // 4. Segmentar timestamp-first
  console.log('── Segmentando timestamp-first ──')
  const segMap = new Map()
  const getSeg = (date, shift) => {
    const key = `${date}|${shift}`
    if (!segMap.has(key)) segMap.set(key, { sessionDate: date, shiftId: shift, pp: [], p0: [] })
    return segMap.get(key)
  }
  for (const rec of ppDedup.unique) {
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts)
    getSeg(sessionDate, shiftId).pp.push(rec)
  }
  for (const rec of p0Dedup.unique) {
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts)
    getSeg(sessionDate, shiftId).p0.push(rec)
  }
  console.log(`Segmentos generados: ${segMap.size}\n`)

  // 5. Computar summaries (skip los tiny <100 pz)
  const allFileNames = [...ppSources, ...p0Sources]
  const summaries = []
  const skippedTiny = []
  for (const seg of segMap.values()) {
    const s = computeSummary(seg, allFileNames)
    if (s.totalPieces < 100 && s.pointZeroPieces < 100) {
      skippedTiny.push(s)
      continue
    }
    summaries.push(s)
  }
  summaries.sort((a, b) => (a.dateKey + a.shiftId).localeCompare(b.dateKey + b.shiftId))

  console.log(`Summaries válidos: ${summaries.length}`)
  console.log(`Skipped tiny (<100 pz): ${skippedTiny.length}\n`)

  // Distribución de duración (diagnóstico)
  const buckets = { '<6h': 0, '6-10h': 0, '10-13h': 0, '13-17h': 0, '>13h': 0 }
  for (const s of summaries) {
    const h = (s.durationMinutes || 0) / 60
    if (h < 6) buckets['<6h']++
    else if (h < 10) buckets['6-10h']++
    else if (h < 13) buckets['10-13h']++
    else if (h < 17) buckets['13-17h']++
    else buckets['>13h']++
  }
  console.log('Distribución de duración de los nuevos summaries:')
  Object.entries(buckets).forEach(([k, v]) => console.log(`  ${k.padEnd(8)}: ${v}`))
  console.log()

  // Por mes
  const byMonth = {}
  for (const s of summaries) {
    const ym = s.dateKey.slice(0, 7)
    byMonth[ym] = (byMonth[ym] || 0) + 1
  }
  console.log('Por mes:')
  Object.keys(byMonth).sort().forEach((k) => console.log(`  ${k}: ${byMonth[k]}`))
  console.log()

  if (DRY_RUN) {
    console.log('🔍 DRY RUN — saliendo sin escribir.')
    return
  }

  // 6. WIPE colección existente
  console.log('── WIPE graderDailySummaries ──')
  const existing = await db.collection('graderDailySummaries').get()
  console.log(`Existentes: ${existing.size}`)
  const CHUNK = 400
  const existingDocs = existing.docs
  for (let i = 0; i < existingDocs.length; i += CHUNK) {
    const batch = db.batch()
    for (const d of existingDocs.slice(i, i + CHUNK)) batch.delete(d.ref)
    await batch.commit()
    console.log(`  ✓ wiped ${Math.min(i + CHUNK, existingDocs.length)}/${existingDocs.length}`)
  }

  // 7. Save nuevos
  console.log('\n── SAVE nuevos summaries ──')
  for (let i = 0; i < summaries.length; i += CHUNK) {
    const batch = db.batch()
    for (const s of summaries.slice(i, i + CHUNK)) {
      batch.set(db.collection('graderDailySummaries').doc(s.id), s)
    }
    await batch.commit()
    console.log(`  ✓ saved ${Math.min(i + CHUNK, summaries.length)}/${summaries.length}`)
  }

  console.log('\n=== DONE ===')
  console.log(`Total final: ${summaries.length} summaries`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('ERROR:', err); process.exit(1) })
