/**
 * Bulk Upload: pieceRecords desde Excel locales → Firestore subcollections.
 *
 * Reutiliza el parser de iter18-full-season-rebuild.js para leer Excel, deduplica,
 * segmenta por turno, y escribe cada registro como documento en la subcollection
 * `graderDailySummaries/{summaryId}/pieceRecords/`.
 *
 * Flags:
 *   --dry-run   — solo parsea y reporta, no escribe
 *   --force     — escribe aunque el summary no exista (crea doc stub)
 *
 * Uso:
 *   node scripts/bulk-upload-piece-records.js
 *   node scripts/bulk-upload-piece-records.js --dry-run
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
const FORCE = process.argv.includes('--force')
if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')

const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const PP_DIR = path.join(BASE_DIR, 'pieza a pieza')
const P0_DIR = path.join(BASE_DIR, 'punto 0')
const BATCH_SIZE = 200  // Reducido de 400 para evitar deadline exceeded en wifi lento

// ── Helpers (copiados de iter18-full-season-rebuild.js) ───────────────────
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
    if (m1) dateStr = `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateStr = s.slice(0, 10)
  }
  if (typeof timeVal === 'number') {
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

function detectKind(headers, filename) {
  const nameLower = (filename || '').toLowerCase()
  const hintP0 = nameLower.includes('puerta 0') || nameLower.includes('punto cero')
  const hintPP = nameLower.includes('pieza a pieza') || nameLower.includes('pieza pieza')
  const hasGate = headers.some((h) => h && (h === 'gate' || h.includes('compuerta')))
  const hasError = headers.some((h) => h && (h === 'error' || h === 'motivo' || h === 'causa'))
  const hasPieces = headers.some((h) => h && (h.includes('pieza') || h === 'qty' || h === 'cantidad'))
  if (hintP0 && hasPieces && hasError) return 'PUERTA_0'
  if (hintPP && hasGate && hasPieces) return 'PIEZA_PIEZA'
  if (hasGate && hasPieces) return 'PIEZA_PIEZA'
  if (hasError && hasPieces) return 'PUERTA_0'
  return 'UNKNOWN'
}

// ── Parsers ──────────────────────────────────────────────────────────────
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
    })
  }
  return records
}

// ── Dedupe ────────────────────────────────────────────────────────────────
function buildDedupeKey(r) {
  return `${r.ts}|${r.gate}|${r.pieces}|${r.quality ?? ''}|${r.calibre ?? ''}|${r.weightKg ?? ''}`
}

function dedupeRecords(records) {
  const seen = new Set()
  const unique = []
  for (const r of records) {
    const key = buildDedupeKey(r)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(r)
  }
  return { unique, removed: records.length - unique.length }
}

// ── Segmentación ─────────────────────────────────────────────────────────
function assignShiftAndDate(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (m >= 420 && m < 1140) return { shiftId: 'Turno día', sessionDate: ts.slice(0, 10) }
  if (m >= 1140) return { shiftId: 'Turno noche', sessionDate: ts.slice(0, 10) }
  const prev = new Date(d); prev.setUTCDate(prev.getUTCDate() - 1)
  return { shiftId: 'Turno noche', sessionDate: prev.toISOString().slice(0, 10) }
}

// ── Walk ─────────────────────────────────────────────────────────────────
function walkXlsx(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    const stat = fs.statSync(full)
    if (stat.isDirectory()) files.push(...walkXlsx(full))
    else if (name.endsWith('.xlsx') && !name.startsWith('~$') && !name.startsWith('Totales')) files.push(full)
  }
  return files
}

function parseFileFromDisk(filePath) {
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) return { kind: 'UNKNOWN', records: [] }
  const colMap = buildColumnMap(headerInfo.headers)
  const kind = detectKind(headerInfo.headers, path.basename(filePath))
  if (kind !== 'PIEZA_PIEZA') return { kind, records: [] }
  return { kind, records: parsePP(rows, headerInfo.rowIndex, colMap) }
}

// ── Main ─────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== BULK UPLOAD: pieceRecords → Firestore ===\n')

  // 1. Listar y parsear solo PP files (P0 no tiene peso por pieza individual)
  const ppFiles = walkXlsx(PP_DIR)
  console.log(`Archivos PP encontrados: ${ppFiles.length}`)

  const allRecords = []
  for (const f of ppFiles) {
    const { kind, records } = parseFileFromDisk(f)
    const name = path.basename(f).slice(0, 70)
    if (kind !== 'PIEZA_PIEZA' || records.length === 0) {
      console.log(`  ⚠️  ${name}: skip (${kind}, ${records.length} records)`)
      continue
    }
    console.log(`  ✓ ${name} → ${records.length} records`)
    for (const r of records) allRecords.push(r)
  }
  console.log(`\nTotal PP records raw: ${allRecords.length}`)

  // 2. Dedupe global
  const { unique, removed } = dedupeRecords(allRecords)
  console.log(`Dedupe: -${removed} duplicados → ${unique.length}\n`)

  // 3. Segmentar por fecha+turno
  const segments = new Map()
  for (const r of unique) {
    const { shiftId, sessionDate } = assignShiftAndDate(r.ts)
    const summaryId = `${sessionDate}__${shiftId}`
    if (!segments.has(summaryId)) segments.set(summaryId, [])
    segments.get(summaryId).push(r)
  }
  console.log(`Segmentos (fecha+turno): ${segments.size}\n`)

  // 4. Escribir a Firestore
  let totalWritten = 0
  let totalSkipped = 0
  let totalExisting = 0
  let segIdx = 0
  const segTotal = segments.size

  for (const [summaryId, records] of segments) {
    segIdx++
    const summaryRef = db.collection('graderDailySummaries').doc(summaryId)

    // Verificar que el summary existe
    const summaryDoc = await summaryRef.get()
    if (!summaryDoc.exists && !FORCE) {
      console.log(`  [${segIdx}/${segTotal}] ${summaryId}: summary NO existe → skip (use --force)`)
      totalSkipped += records.length
      continue
    }

    // Crear stub si --force y no existe
    if (!summaryDoc.exists && FORCE && !DRY_RUN) {
      await summaryRef.set({
        id: summaryId,
        dateKey: summaryId.split('__')[0],
        shiftId: summaryId.split('__')[1],
        hasPieceRecords: true,
        createdBy: 'bulk-upload-piece-records',
        updatedAt: new Date().toISOString(),
      }, { merge: true })
    }

    // Leer dedupeKeys existentes
    const pieceRecordsCol = summaryRef.collection('pieceRecords')
    const existingSnap = await pieceRecordsCol.select('dedupeKey').get()
    const existingKeys = new Set(existingSnap.docs.map(d => d.data().dedupeKey))
    totalExisting += existingKeys.size

    // Filtrar solo nuevos
    const toWrite = []
    for (const r of records) {
      const key = buildDedupeKey(r)
      if (!existingKeys.has(key)) {
        toWrite.push({ ...r, dedupeKey: key })
      }
    }

    const skipCount = records.length - toWrite.length
    totalSkipped += skipCount

    if (toWrite.length === 0) {
      console.log(`  [${segIdx}/${segTotal}] ${summaryId}: ${records.length} records, ${existingKeys.size} existentes → 0 nuevos`)
      continue
    }

    if (DRY_RUN) {
      console.log(`  [${segIdx}/${segTotal}] ${summaryId}: ${toWrite.length} nuevos (${skipCount} ya existentes) [DRY RUN]`)
      totalWritten += toWrite.length
      continue
    }

    // Batch write with retry (wifi lento puede causar deadline exceeded)
    for (let i = 0; i < toWrite.length; i += BATCH_SIZE) {
      const chunk = toWrite.slice(i, i + BATCH_SIZE)
      let attempts = 0
      const maxRetries = 5
      while (attempts < maxRetries) {
        try {
          const batch = db.batch()
          for (const rec of chunk) {
            batch.set(pieceRecordsCol.doc(), rec)
          }
          await batch.commit()
          break
        } catch (err) {
          attempts++
          if (attempts >= maxRetries) throw err
          const delaySec = Math.min(2 ** attempts, 30)
          console.log(`    ⚠️ Retry ${attempts}/${maxRetries} en ${delaySec}s (${err.code || err.message})`)
          await new Promise(r => setTimeout(r, delaySec * 1000))
        }
      }
    }

    // Marcar summary como que tiene pieceRecords
    await summaryRef.set({ hasPieceRecords: true }, { merge: true })

    totalWritten += toWrite.length
    console.log(`  [${segIdx}/${segTotal}] ${summaryId}: ✓ ${toWrite.length} escritos, ${skipCount} ya existentes`)
  }

  console.log('\n=== RESUMEN ===')
  console.log(`Registros parseados:  ${unique.length}`)
  console.log(`Ya existentes:        ${totalExisting}`)
  console.log(`Escritos (nuevos):    ${totalWritten}`)
  console.log(`Omitidos (dedup):     ${totalSkipped}`)
  if (DRY_RUN) console.log('(DRY RUN — nada fue escrito)')
}

main().catch(console.error)
