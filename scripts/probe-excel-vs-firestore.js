/**
 * Probe: parsea uno o más Excels Grader RAW (replicando el parser real de
 * bulk-upload-piece-records.js) y compara contra los pieceRecords de Firestore
 * por rango de días. Reporta:
 *   - Filas Excel raw para cada día
 *   - Filas Excel post-dedupe (key NUEVA: ts+gate+pieces+quality+calibre+weightKg+lot+error+wPP)
 *   - Filas Firestore
 *   - Diferencia y % de pérdida
 *
 * Usa los MISMOS campos y el MISMO buildDedupeKey que el bulk-upload + servicios
 * PWA (mantener en sync con `apps/pwa/src/services/grader/graderDailySummary.service.ts`,
 * `apps/pwa/src/services/grader/graderSegmenter.ts`, y bulk-upload-piece-records.js).
 *
 * Uso:
 *   node scripts/probe-excel-vs-firestore.js --from=2026-02-15 --to=2026-02-28 \
 *     --xlsx="C:/.../Pieza pieza ... 20260210_20260220.xlsx" \
 *     --xlsx="C:/.../Pieza pieza ... 20260220_20260228.xlsx"
 *
 *   # Single day (compat):
 *   node scripts/probe-excel-vs-firestore.js <ruta.xlsx> 2026-02-14
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
const path = require('path')
const xlsx = require('xlsx')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

// CLI args parsing
const ARGV = process.argv.slice(2)
const FROM = (ARGV.find(a => a.startsWith('--from=')) || '').replace('--from=', '') || null
const TO   = (ARGV.find(a => a.startsWith('--to='))   || '').replace('--to=',   '') || null
const XLSX_PATHS = ARGV.filter(a => a.startsWith('--xlsx=')).map(a => a.replace('--xlsx=', ''))

// Compat single-day mode: positional args [xlsx, dateKey]
const POSITIONAL = ARGV.filter(a => !a.startsWith('--'))
let MODE_RANGE = false
if (FROM && TO && XLSX_PATHS.length > 0) {
  MODE_RANGE = true
} else if (POSITIONAL.length === 2) {
  XLSX_PATHS.push(POSITIONAL[0])
} else {
  console.error('Uso:')
  console.error('  node scripts/probe-excel-vs-firestore.js --from=YYYY-MM-DD --to=YYYY-MM-DD --xlsx=path1 --xlsx=path2 ...')
  console.error('  node scripts/probe-excel-vs-firestore.js <ruta.xlsx> YYYY-MM-DD')
  process.exit(1)
}

function norm(s) {
  if (s == null) return ''
  return String(s).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
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

function col(map, ...names) {
  for (const n of names) if (map[n] != null) return map[n]
  for (const k of Object.keys(map)) {
    for (const n of names) if (k.includes(n)) return map[k]
  }
  return null
}

function parseDatetime(dateVal, timeVal) {
  if (!dateVal) return null
  let dateStr
  if (dateVal instanceof Date) {
    const y = dateVal.getUTCFullYear()
    const m = String(dateVal.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dateVal.getUTCDate()).padStart(2, '0')
    dateStr = `${y}-${m}-${d}`
  } else {
    const s = String(dateVal).trim()
    const m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
    if (m) dateStr = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  }
  let timeStr
  if (timeVal instanceof Date) {
    const h = String(timeVal.getUTCHours()).padStart(2, '0')
    const m = String(timeVal.getUTCMinutes()).padStart(2, '0')
    const s = String(timeVal.getUTCSeconds()).padStart(2, '0')
    timeStr = `${h}:${m}:${s}`
  } else if (typeof timeVal === 'number') {
    const totalSec = Math.round(timeVal * 86400)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const sec = totalSec % 60
    timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  } else if (timeVal != null) {
    const s = String(timeVal).trim()
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (m) timeStr = `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`
  }
  if (!dateStr) return null
  if (!timeStr) timeStr = '00:00:00'
  return `${dateStr}T${timeStr}.000Z`
}

// Mismo buildDedupeKey que la implementación PWA + bulk-upload tras el fix.
function buildDedupeKey(r) {
  return `${r.ts}|${r.gate}|${r.pieces}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}|${r.lot ?? ''}|${r.error ?? ''}|${r.weightPerPieceGrams ?? ''}`
}

function parseExcel(filePath) {
  console.log(`Leyendo ${path.basename(filePath)}...`)
  const wb = xlsx.readFile(filePath, { cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null })
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) throw new Error(`No se encontró header en ${filePath}`)
  const colMap = {}
  headerInfo.headers.forEach((h, i) => { if (h) colMap[h] = i })
  const iGate = col(colMap, 'gate', 'compuerta', 'puerta')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightGrams = col(colMap, 'peso en gr', 'peso en gramos')
  const iQuality = col(colMap, 'calidad', 'quality')
  const iCalibre = col(colMap, 'calibre', 'size', 'tamano')
  const iError = col(colMap, 'error', 'motivo', 'causa', 'reason')
  const iLot = col(colMap, 'lote', 'folio', 'lot', 'batch')
  const iDate = col(colMap, 'fecha', 'date')
  const iTime = col(colMap, 'hora', 'time')
  const records = []
  for (let r = headerInfo.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : undefined, iTime != null ? row[iTime] : undefined)
    if (!ts) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : undefined)
    if (pieces == null || pieces <= 0) continue
    const gate = Math.round(parseNum(iGate != null ? row[iGate] : undefined) ?? 0)
    const weightPerPieceGrams = iWeightGrams != null ? parseNum(row[iWeightGrams]) : undefined
    let weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    if (weightKg == null && weightPerPieceGrams != null && weightPerPieceGrams > 0) {
      weightKg = (weightPerPieceGrams * pieces) / 1000
    }
    let errorStr
    if (gate === 0 && iError != null && row[iError] != null) errorStr = String(row[iError]).trim() || undefined
    records.push({
      ts, gate, pieces, weightKg, weightPerPieceGrams,
      quality: iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined,
      calibre: iCalibre != null && row[iCalibre] != null ? String(row[iCalibre]).trim() : undefined,
      error: errorStr,
      lot: iLot != null && row[iLot] != null ? (String(row[iLot]).trim() || undefined) : undefined,
    })
  }
  console.log(`  records útiles parseados: ${records.length.toLocaleString('es-CL')}`)
  return records
}

async function fetchFirestoreCount(dateKey) {
  const candidates = [
    `${dateKey}__Turno día`,
    `${dateKey}__Turno noche`,
  ]
  const [y, m, d] = dateKey.split('-').map(Number)
  const yesterday = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
  candidates.unshift(`${yesterday}__Turno noche`)
  let total = 0
  for (const id of candidates) {
    const ref = db.collection('graderDailySummaries').doc(id)
    const snap = await ref.collection('pieceRecords').get()
    snap.forEach((doc) => {
      const dd = doc.data()
      if (dd && dd.ts && dd.ts.slice(0, 10) === dateKey) total++
    })
  }
  return total
}

function eachDate(from, to) {
  const out = []
  let d = new Date(`${from}T00:00:00.000Z`)
  const end = new Date(`${to}T00:00:00.000Z`)
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() + 86400000)
  }
  return out
}

async function main() {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
  console.log(`  PROBE Excel vs Firestore — ${MODE_RANGE ? `[${FROM}, ${TO}]` : 'single-day'}`)
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`)

  // 1. Parsear todos los Excels (loop manual — push(...recs) con 200k items
  // excede el stack de JS si hay muchos archivos overlapping)
  let allExcel = []
  for (const p of XLSX_PATHS) {
    const recs = parseExcel(p)
    allExcel = allExcel.concat(recs)
  }
  console.log(`\nTotal Excel raw: ${allExcel.length.toLocaleString('es-CL')}\n`)

  // 2. Determinar rango de días a chequear
  const days = MODE_RANGE ? eachDate(FROM, TO) : [POSITIONAL[1]]

  // 3. Por cada día, comparar Excel vs Firestore
  console.log('Día        | Excel raw | Excel dedup | Firestore | Δ raw  | Δ dedup | % loss vs raw')
  console.log('-----------|-----------|-------------|-----------|--------|---------|--------------')
  let totalRaw = 0, totalDedup = 0, totalFs = 0
  for (const dateKey of days) {
    const dayExcel = allExcel.filter((r) => r.ts.slice(0, 10) === dateKey)
    const seen = new Set()
    for (const r of dayExcel) seen.add(buildDedupeKey(r))
    const dedup = seen.size
    const fs = await fetchFirestoreCount(dateKey)
    const dRaw = dayExcel.length - fs
    const dDedup = dedup - fs
    const pctLoss = dayExcel.length > 0 ? (dRaw / dayExcel.length * 100) : 0
    totalRaw += dayExcel.length; totalDedup += dedup; totalFs += fs
    const status = Math.abs(dDedup) <= 5 ? '✓' : pctLoss > 1 ? '⚠' : '·'
    console.log(
      `${dateKey} | ${String(dayExcel.length).padStart(9, ' ')} | ${String(dedup).padStart(11, ' ')} | ${String(fs).padStart(9, ' ')} | ${String(dRaw).padStart(6, ' ')} | ${String(dDedup).padStart(7, ' ')} | ${pctLoss.toFixed(2).padStart(6, ' ')}%  ${status}`,
    )
  }
  console.log('-----------|-----------|-------------|-----------|--------|---------|--------------')
  const totDRaw = totalRaw - totalFs
  const totDDed = totalDedup - totalFs
  const totPct = totalRaw > 0 ? (totDRaw / totalRaw * 100) : 0
  console.log(
    `TOTAL      | ${String(totalRaw).padStart(9, ' ')} | ${String(totalDedup).padStart(11, ' ')} | ${String(totalFs).padStart(9, ' ')} | ${String(totDRaw).padStart(6, ' ')} | ${String(totDDed).padStart(7, ' ')} | ${totPct.toFixed(2).padStart(6, ' ')}%`,
  )

  console.log(`\nLeyenda:`)
  console.log(`  Δ raw      = Excel raw − Firestore (incluye colisiones de dedupe)`)
  console.log(`  Δ dedup    = Excel post-dedupe − Firestore (idealmente 0)`)
  console.log(`  ✓  ≤ 5 docs diff  ·  ⚠ > 1% loss  ·  · diff aceptable`)
  console.log()
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e); process.exit(1) })
