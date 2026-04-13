/**
 * Iter 18: Cleanup de registros anómalos + regeneración de julio 2025
 *
 * Estrategia:
 *  1. DELETE: todos los summaries con durationMinutes > 800 (>13.3h).
 *     Son resultado del bug de segmentación pre-iter 18 donde se confiaba
 *     en la columna "Turno" del Excel (A/B) aunque los operarios a veces
 *     etiquetaran 20-24h seguidas con la misma letra.
 *  2. REGEN: procesar los 2 archivos de julio 2025 todavía en Storage con
 *     la lógica timestamp-first + hourlyBuckets. Solo recrea los días que
 *     NO tengan summary correcto (respetando lo que ya está bien).
 */
const admin = require('firebase-admin')
const XLSX = require('xlsx')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: 'mantenimiento-planta-771a3.firebasestorage.app',
  })
}

const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })
const bucket = admin.storage().bucket()

const DRY_RUN = process.argv.includes('--dry-run')
if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada en Firestore\n')

// ── Helpers de parsing Excel (simplified port del graderExcelParser) ─────────
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

function parsePiezaPieza(rows, headerIdx, colMap) {
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

// ── Segmentación TIMESTAMP-FIRST (igual al graderSegmenter iter 18) ──────────
function assignShiftAndDate(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
  const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()
  // Turno día: 07:00 (420) - 19:00 (1140)
  if (minutesOfDay >= 420 && minutesOfDay < 1140) {
    return { shiftId: 'Turno día', sessionDate: ts.slice(0, 10) }
  }
  // Turno noche: 19:00 - 07:00 del día siguiente
  if (minutesOfDay >= 1140) {
    return { shiftId: 'Turno noche', sessionDate: ts.slice(0, 10) }
  }
  // 00:00 - 06:59 → noche del día previo
  const prev = new Date(d)
  prev.setUTCDate(prev.getUTCDate() - 1)
  return { shiftId: 'Turno noche', sessionDate: prev.toISOString().slice(0, 10) }
}

function segmentRecords(records) {
  const map = new Map()
  for (const rec of records) {
    if (!rec.ts) continue
    const { sessionDate, shiftId } = assignShiftAndDate(rec.ts)
    const key = `${sessionDate}|${shiftId}`
    if (!map.has(key)) map.set(key, { sessionDate, shiftId, records: [] })
    map.get(key).records.push(rec)
  }
  return map
}

function computeSummary(segment, sourceFileName) {
  const { sessionDate, shiftId, records } = segment
  const allTs = records.map((r) => r.ts).filter(Boolean).sort()
  const startAt = allTs[0]
  const endAt = allTs[allTs.length - 1]
  const durationMinutes = allTs.length > 1
    ? Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000)
    : 0

  const totalPieces = records.reduce((s, r) => s + r.pieces, 0)
  const prodRecords = records.filter((r) => r.gate > 0)
  const prodPieces = prodRecords.reduce((s, r) => s + r.pieces, 0)
  const p0Records = records.filter((r) => r.gate === 0)
  const pointZeroPieces = p0Records.reduce((s, r) => s + r.pieces, 0)
  const pointZeroPct = totalPieces > 0 ? Math.round((pointZeroPieces / totalPieces) * 10000) / 100 : 0

  const rawWeightKg = prodRecords.reduce((s, r) => s + (r.weightKg ?? 0), 0)
  const totalWeightKg = rawWeightKg > 0 ? Math.round(rawWeightKg * 100) / 100 : undefined
  const avgWeightGrams = (totalWeightKg && prodPieces > 0) ? Math.round(totalWeightKg * 1000 / prodPieces) : undefined
  const productionRatePerHour = (durationMinutes > 0 && prodPieces > 0) ? Math.round(prodPieces / (durationMinutes / 60)) : undefined

  // Top causas P0
  const causeMap = new Map()
  for (const r of p0Records) {
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

  // HOURLY BUCKETS — drill-down dentro del turno
  const hourMap = new Map()
  for (const rec of records) {
    const d = new Date(rec.ts)
    if (isNaN(d.getTime())) continue
    const h = d.getUTCHours()
    const b = hourMap.get(h) ?? { total: 0, p0: 0 }
    b.total += rec.pieces
    if (rec.gate === 0) b.p0 += rec.pieces
    hourMap.set(h, b)
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
    sourceFileNames: [sourceFileName],
    batchUploadId: 'iter18-regen-' + new Date().toISOString().slice(0, 10),
    hasPieceData: true,
    hasGate0Data: false,
    updatedBy: 'iter18-regen',
    updatedAt: new Date().toISOString(),
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  // ─── FASE 1: DELETE anómalos (>13h) ────────────────────────────────────────
  console.log('=== FASE 1: Delete summaries con duración > 800min (>13.3h) ===\n')
  const allSnap = await db.collection('graderDailySummaries').get()
  const all = allSnap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const anomalous = all.filter((s) => (s.durationMinutes || 0) > 800)
  console.log(`Encontrados: ${anomalous.length}`)

  const anomalousIds = new Set(anomalous.map((a) => a.id))

  if (!DRY_RUN && anomalous.length > 0) {
    // Firestore batch max = 500
    const CHUNK = 400
    for (let i = 0; i < anomalous.length; i += CHUNK) {
      const batch = db.batch()
      for (const s of anomalous.slice(i, i + CHUNK)) {
        batch.delete(db.collection('graderDailySummaries').doc(s.id))
      }
      await batch.commit()
      console.log(`  ✓ Deleted batch ${i / CHUNK + 1} (${Math.min(CHUNK, anomalous.length - i)} docs)`)
    }
  } else if (DRY_RUN) {
    anomalous.slice(0, 5).forEach((s) => {
      console.log(`  [dry-run] would delete ${s.id} (${((s.durationMinutes || 0) / 60).toFixed(1)}h, ${s.totalPieces} pz)`)
    })
    if (anomalous.length > 5) console.log(`  ... y ${anomalous.length - 5} más`)
  }

  // ─── FASE 2: Regen julio 2025 ──────────────────────────────────────────────
  console.log('\n=== FASE 2: Regen julio 2025 desde source files ===\n')
  const uploadsSnap = await db.collection('graderUploads').get()
  const uploads = uploadsSnap.docs.map((d) => d.data())
    .filter((u) => u.fileMeta?.kind === 'PIEZA_PIEZA' && u.fileMeta?.storagePath)
  console.log(`Uploads PIEZA_PIEZA disponibles: ${uploads.length}`)

  // Summaries existentes (POST fase 1) — después del delete
  const existingAfterDelete = new Set(
    all.filter((s) => !anomalousIds.has(s.id)).map((s) => s.id),
  )

  const allSegments = new Map()
  for (const upload of uploads) {
    console.log(`\n--- ${upload.fileMeta.name} ---`)
    const file = bucket.file(upload.fileMeta.storagePath)
    const [exists] = await file.exists()
    if (!exists) {
      console.log(`  ✗ no existe en Storage, skip`)
      continue
    }
    const [buffer] = await file.download()
    console.log(`  ✓ descargado (${buffer.length} bytes)`)

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    const headerInfo = findHeaderRow(rows)
    if (!headerInfo) {
      console.log(`  ✗ no header, skip`)
      continue
    }
    const colMap = buildColumnMap(headerInfo.headers)
    const records = parsePiezaPieza(rows, headerInfo.rowIndex, colMap)
    console.log(`  ✓ ${records.length} pieceRecords`)

    const segments = segmentRecords(records)
    console.log(`  ✓ ${segments.size} segmentos (timestamp-first)`)

    for (const [key, seg] of segments.entries()) {
      if (allSegments.has(key)) {
        allSegments.get(key).records.push(...seg.records)
      } else {
        allSegments.set(key, { ...seg, sourceFile: upload.fileMeta.name })
      }
    }
  }

  console.log(`\nTotal segmentos: ${allSegments.size}`)

  const toSave = []
  const skippedTiny = []
  const skippedExists = []

  for (const [, seg] of allSegments.entries()) {
    const id = `${seg.sessionDate}__${seg.shiftId}`
    if (existingAfterDelete.has(id)) {
      skippedExists.push(id)
      continue
    }
    const summary = computeSummary(seg, seg.sourceFile)
    if (summary.totalPieces < 100) {
      skippedTiny.push(summary)
      continue
    }
    toSave.push(summary)
  }

  console.log(`\nSkipped (ya existen): ${skippedExists.length}`)
  console.log(`Skipped (< 100 pz ruido): ${skippedTiny.length}`)
  console.log(`A guardar: ${toSave.length}\n`)

  toSave.sort((a, b) => (a.dateKey + a.shiftId).localeCompare(b.dateKey + b.shiftId))
  toSave.forEach((s) => {
    const h = ((s.durationMinutes || 0) / 60).toFixed(1)
    const hb = s.hourlyBuckets?.length ?? 0
    console.log(`  + ${s.dateKey} ${s.shiftId.padEnd(13)} | ${s.totalPieces.toString().padStart(6)} pz | P0=${s.pointZeroPct}% | dur=${h}h | ${hb} buckets`)
  })

  if (!DRY_RUN && toSave.length > 0) {
    console.log('\n--- Guardando ---')
    for (const summary of toSave) {
      await db.collection('graderDailySummaries').doc(summary.id).set(summary)
    }
    console.log(`✓ ${toSave.length} summaries guardados`)
  }

  // ─── FASE 3: Resumen final ─────────────────────────────────────────────────
  console.log('\n=== RESUMEN ===')
  console.log(`  Deleted anómalos: ${anomalous.length}`)
  console.log(`  Regen creados:    ${toSave.length}`)
  console.log(`  Total final:      ${all.length - anomalous.length + toSave.length}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error('ERROR:', err); process.exit(1) })
