/**
 * Regenera summaries faltantes de julio 2025 a partir de los uploads válidos
 * que aún están en Firebase Storage.
 *
 * Lógica:
 *  1. Lista los uploads con sessionDate en jul 2025
 *  2. Descarga cada Excel
 *  3. Parsea PIEZA_PIEZA: extrae ts, gate, pieces, error, calibre, quality, weight
 *  4. Segmenta por date+shift (07:00-19:00 día / 19:00-07:00 noche)
 *  5. Para cada segmento NO presente en Firestore, computa summary y guarda
 *  6. Reporta los que agregó
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

// ── Helpers de parsing ──────────────────────────────────────────────────────
function norm(s) {
  if (s == null) return ''
  return String(s).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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
    // Buscar columnas típicas
    const hasFecha = cells.some((c) => c === 'fecha' || c === 'date')
    const hasPiezas = cells.some((c) => c.includes('pieza') || c.includes('cantidad') || c === 'qty')
    if (hasFecha && hasPiezas) {
      return { rowIndex: i, headers: row.map((c) => norm(c)) }
    }
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
  // Maneja: número Excel serial, string ISO, string DD/MM/YYYY HH:MM
  let dateStr = ''
  let timeStr = ''

  if (typeof dateVal === 'number') {
    // Excel serial date
    const utc_days = Math.floor(dateVal - 25569)
    const utc_value = utc_days * 86400
    const date_info = new Date(utc_value * 1000)
    dateStr = date_info.toISOString().slice(0, 10)
  } else if (dateVal != null) {
    const s = String(dateVal).trim()
    // dd/mm/yyyy or dd-mm-yyyy
    const m1 = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (m1) {
      const [, d, mo, y] = m1
      dateStr = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`
    } else if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      dateStr = s.slice(0, 10)
    }
  }

  if (typeof timeVal === 'number') {
    // Excel time fraction (0-1)
    const totalSec = Math.round(timeVal * 86400)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  } else if (timeVal != null) {
    const s = String(timeVal).trim()
    const m = s.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (m) {
      timeStr = `${m[1].padStart(2, '0')}:${m[2].padStart(2, '0')}:${(m[3] || '00').padStart(2, '0')}`
    }
  }

  if (!dateStr) return null
  if (!timeStr) timeStr = '00:00:00'
  // Construir como local time, convertir a ISO con offset asumiendo UTC
  // (igual al parser TS que no aplica timezone)
  return `${dateStr}T${timeStr}.000Z`
}

function detectKindFromHeaders(headers) {
  const norm = headers.join(' ')
  const hasError = headers.some((h) => h === 'error' || h === 'motivo' || h === 'causa')
  const hasGate = headers.some((h) => h.includes('gate') || h.includes('compuerta') || h.includes('puerta'))
  if (hasGate) return 'PIEZA_PIEZA'
  if (hasError) return 'PUERTA_0'
  return 'UNKNOWN'
}

// ── Parser PIEZA_PIEZA ──────────────────────────────────────────────────────
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
  const iShift = col(colMap, 'turno', 'shift')

  for (let r = headerIdx + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue
    const ts = parseDatetime(
      iDate != null ? row[iDate] : undefined,
      iTime != null ? row[iTime] : undefined,
    )
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
      shift: iShift != null && row[iShift] != null ? String(row[iShift]).trim() : undefined,
    })
  }
  return records
}

// ── Segmentación por turno ──────────────────────────────────────────────────
const SCHEDULE = [
  { shiftId: 'Turno día', startHour: 7, startMinute: 0, endHour: 19, endMinute: 0 },
  { shiftId: 'Turno noche', startHour: 19, startMinute: 0, endHour: 7, endMinute: 0 },
]

function assignShiftAndDate(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
  // Importante: el parser del app no aplica timezone, así que los ts tienen
  // la hora local del registro (aunque marcada como Z). Usar UTC accessors.
  const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()

  for (const shift of SCHEDULE) {
    const start = shift.startHour * 60 + shift.startMinute
    const end = shift.endHour * 60 + shift.endMinute
    if (start === end) continue
    if (start < end) {
      if (minutesOfDay >= start && minutesOfDay < end) {
        return { shiftId: shift.shiftId, sessionDate: ts.slice(0, 10) }
      }
    } else {
      // cruza medianoche
      if (minutesOfDay >= start) {
        return { shiftId: shift.shiftId, sessionDate: ts.slice(0, 10) }
      } else if (minutesOfDay < end) {
        const prev = new Date(d)
        prev.setUTCDate(prev.getUTCDate() - 1)
        return { shiftId: shift.shiftId, sessionDate: prev.toISOString().slice(0, 10) }
      }
    }
  }
  return { shiftId: 'Sin turno', sessionDate: ts.slice(0, 10) }
}

function normalizeShiftLabel(raw) {
  const n = norm(raw)
  if (!n) return null
  if (n.includes('dia') || n.includes('día') || n === 'a' || n === 'turno a') return 'Turno día'
  if (n.includes('noche') || n.includes('tarde') || n === 'b' || n === 'turno b') return 'Turno noche'
  return null
}

function segmentRecords(pieceRecords) {
  const map = new Map()
  for (const rec of pieceRecords) {
    if (!rec.ts) continue
    let sessionDate
    let shiftId
    if (rec.shift) {
      const canonical = normalizeShiftLabel(rec.shift)
      if (canonical) {
        sessionDate = rec.ts.slice(0, 10)
        shiftId = canonical
      }
    }
    if (!sessionDate) {
      const r2 = assignShiftAndDate(rec.ts)
      sessionDate = r2.sessionDate
      shiftId = r2.shiftId
    }
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
  const avgWeightGrams = (totalWeightKg && prodPieces > 0)
    ? Math.round(totalWeightKg * 1000 / prodPieces)
    : undefined
  const productionRatePerHour = (durationMinutes > 0 && prodPieces > 0)
    ? Math.round(prodPieces / (durationMinutes / 60))
    : undefined

  // Causas P0
  const causeMap = new Map()
  for (const r of p0Records) {
    const e = r.error || 'Sin causa'
    causeMap.set(e, (causeMap.get(e) ?? 0) + r.pieces)
  }
  const topP0Causes = Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: Math.round(pieces / (pointZeroPieces || 1) * 1000) / 10,
    }))

  // Distribución calibre
  const calibreMap = new Map()
  for (const r of prodRecords) {
    if (r.calibre) calibreMap.set(r.calibre, (calibreMap.get(r.calibre) ?? 0) + r.pieces)
  }
  const calibreDistribution = Array.from(calibreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([calibre, pieces]) => ({
      calibre,
      pieces,
      pct: Math.round(pieces / (prodPieces || 1) * 1000) / 10,
    }))

  // Distribución calidad
  const qualityMap = new Map()
  for (const r of prodRecords) {
    if (r.quality) qualityMap.set(r.quality, (qualityMap.get(r.quality) ?? 0) + r.pieces)
  }
  const qualityDistribution = Array.from(qualityMap.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([quality, pieces]) => ({
      quality,
      pieces,
      pct: Math.round(pieces / (prodPieces || 1) * 1000) / 10,
    }))

  // Distribución gate
  const gateMap = new Map()
  for (const r of prodRecords) {
    gateMap.set(r.gate, (gateMap.get(r.gate) ?? 0) + r.pieces)
  }
  const gateDistribution = Array.from(gateMap.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([gate, pieces]) => ({
      gate,
      pieces,
      pct: Math.round(pieces / (prodPieces || 1) * 1000) / 10,
    }))

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
    sourceFileNames: [sourceFileName],
    batchUploadId: 'regen-script-' + new Date().toISOString().slice(0, 10),
    hasPieceData: true,
    hasGate0Data: false, // este script solo regenera desde PP, no PUERTA_0
    updatedBy: 'regen-script',
    updatedAt: new Date().toISOString(),
  }
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== REGENERACIÓN summaries jul 2025 ===\n')

  // 1. Listar uploads válidos
  const uploadsSnap = await db.collection('graderUploads').get()
  const validUploads = uploadsSnap.docs
    .map((d) => d.data())
    .filter((u) => u.fileMeta?.kind === 'PIEZA_PIEZA' && u.fileMeta?.storagePath)
  console.log(`Uploads PIEZA_PIEZA válidos: ${validUploads.length}`)
  validUploads.forEach((u) => {
    console.log(`  - ${u.id}`)
    console.log(`    storagePath: ${u.fileMeta.storagePath}`)
  })

  // 2. Listar summaries existentes para evitar overwrite (jul 2025)
  const existingSnap = await db.collection('graderDailySummaries')
    .where('dateKey', '>=', '2025-06-01')
    .where('dateKey', '<=', '2025-08-31')
    .get()
  const existingIds = new Set(existingSnap.docs.map((d) => d.id))
  console.log(`\nSummaries existentes (2025-06 a 2025-08): ${existingIds.size}`)

  // 3. Procesar cada upload
  const allSegments = new Map()
  for (const upload of validUploads) {
    console.log(`\n--- Procesando: ${upload.fileMeta.name} ---`)
    const file = bucket.file(upload.fileMeta.storagePath)
    const [exists] = await file.exists()
    if (!exists) {
      console.log(`  ✗ no existe en Storage, skip`)
      continue
    }
    const [buffer] = await file.download()
    console.log(`  ✓ descargado (${buffer.length} bytes)`)

    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })

    const headerInfo = findHeaderRow(rows)
    if (!headerInfo) {
      console.log(`  ✗ no se encontró cabecera, skip`)
      continue
    }
    const colMap = buildColumnMap(headerInfo.headers)
    const records = parsePiezaPieza(rows, headerInfo.rowIndex, colMap)
    console.log(`  ✓ parsed ${records.length} pieceRecords`)

    const segments = segmentRecords(records)
    console.log(`  ✓ ${segments.size} segmentos detectados`)

    // Mergear con segmentos previos (combina records si misma key — caso de uploads con overlap)
    for (const [key, seg] of segments.entries()) {
      if (allSegments.has(key)) {
        const existing = allSegments.get(key)
        existing.records.push(...seg.records)
        existing.sourceFiles.add(upload.fileMeta.name)
      } else {
        allSegments.set(key, { ...seg, sourceFiles: new Set([upload.fileMeta.name]) })
      }
    }
  }

  console.log(`\n=== TOTAL SEGMENTOS: ${allSegments.size} ===\n`)

  // 4. Computar y guardar los faltantes
  const toSave = []
  const skippedTiny = []
  const skippedAnomalous = []
  for (const [key, seg] of allSegments.entries()) {
    const id = `${seg.sessionDate}__${seg.shiftId}`
    if (existingIds.has(id)) continue // ya existe — no sobreescribir

    const sourceName = Array.from(seg.sourceFiles)[0] || 'unknown.xlsx'
    const summary = computeSummary(seg, sourceName)

    // Filtros de calidad: descartar ghost records y duraciones absurdas
    if (summary.totalPieces < 100) {
      skippedTiny.push(summary)
      continue
    }
    if (summary.durationMinutes > 800) {
      // >13.3h en un solo turno → registro corrupto, no guardar
      skippedAnomalous.push(summary)
      continue
    }
    toSave.push(summary)
  }

  if (skippedTiny.length > 0) {
    console.log(`\nSkipped (< 100 piezas, ghost records): ${skippedTiny.length}`)
    skippedTiny.forEach((s) => console.log(`  - ${s.dateKey} ${s.shiftId} (${s.totalPieces} pz)`))
  }
  if (skippedAnomalous.length > 0) {
    console.log(`\nSkipped (> 13h duración, anómalo): ${skippedAnomalous.length}`)
    skippedAnomalous.forEach((s) => console.log(`  - ${s.dateKey} ${s.shiftId} (${s.totalPieces} pz, ${s.durationMinutes}min = ${(s.durationMinutes / 60).toFixed(1)}h)`))
  }

  console.log(`Summaries a crear (no existían): ${toSave.length}\n`)
  toSave.sort((a, b) => (a.dateKey + a.shiftId).localeCompare(b.dateKey + b.shiftId))
  toSave.forEach((s) => {
    console.log(`  + ${s.dateKey} ${s.shiftId} | ${s.totalPieces.toLocaleString('es-CL')} pz | P0=${s.pointZeroPct}% | dur=${s.durationMinutes}min`)
  })

  if (toSave.length === 0) {
    console.log('\nNada que guardar.')
    return
  }

  // Guardar en batches
  console.log('\n--- Guardando en Firestore ---')
  for (const summary of toSave) {
    await db.collection('graderDailySummaries').doc(summary.id).set(summary)
    console.log(`  ✓ ${summary.id}`)
  }
  console.log(`\nTotal guardados: ${toSave.length}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
