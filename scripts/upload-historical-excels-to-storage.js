/**
 * upload-historical-excels-to-storage.js
 *
 * Sube los Excel históricos de la temporada 2025-2026 a Firebase Storage
 * y crea registros en `graderUploads` para que el botón
 * "Abrir dashboard completo" funcione en cada turno histórico.
 *
 * Estrategia por segmento:
 *   1. Parsea todos los Excel PP y P0 del directorio local
 *   2. Segmenta cada registro por (sessionDate, shiftId) — lógica timestamp-first
 *   3. Por cada segmento:
 *      a. Comprueba si ya existe en graderUploads (idempotente — no re-sube)
 *      b. Crea un Excel mini en memoria con solo las filas de ese segmento
 *      c. Sube a Storage con un download token manual (URL permanente)
 *      d. Crea doc en graderUploads
 *
 * Uso:
 *   node scripts/upload-historical-excels-to-storage.js [--dry-run]
 *
 * --dry-run  Muestra qué subiría sin escribir nada.
 */

'use strict'
const admin = require('firebase-admin')
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
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
if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')

const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const PP_DIR = path.join(BASE_DIR, 'pieza a pieza')
const P0_DIR = path.join(BASE_DIR, 'punto 0')

// ── Helpers (reutilizados del iter18 rebuild) ──────────────────────────────

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
    if (hasFecha && hasPiezas) return { rowIndex: i, headers: row }
  }
  return null
}

function buildColumnMap(headers) {
  const map = {}
  headers.forEach((h, i) => { if (h != null) map[norm(h)] = i })
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
    const date_info = new Date(utc_days * 86400 * 1000)
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
  const normHeaders = headers.map((h) => norm(h || ''))
  const hasGate = normHeaders.some((h) => h === 'gate' || h === 'compuerta' || h.includes('compuerta'))
  const hasError = normHeaders.some((h) => h === 'error' || h === 'motivo' || h === 'causa')
  const hasPieces = normHeaders.some((h) => h.includes('pieza') || h === 'qty' || h === 'cantidad')
  const hasQuality = normHeaders.some((h) => h.includes('calidad') || h.includes('quality'))
  const hasCalibre = normHeaders.some((h) => h.includes('calibre') || h.includes('size'))
  if (hintP0 && hasPieces && hasError) return 'PUERTA_0'
  if (hintPP && hasGate && hasPieces) return 'PIEZA_PIEZA'
  if (hasGate && hasPieces && (hasQuality || hasCalibre)) return 'PIEZA_PIEZA'
  if (hasError && hasPieces && !hasGate) return 'PUERTA_0'
  if (hasGate && hasPieces) return 'PIEZA_PIEZA'
  if (hasError && hasPieces) return 'PUERTA_0'
  return 'UNKNOWN'
}

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
      // preservar valores originales para el Excel de salida
      _row: row,
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
      _row: row,
    })
  }
  return records
}

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

function parseExcelFile(filePath) {
  const buffer = fs.readFileSync(filePath)
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
  const headerInfo = findHeaderRow(rows)
  if (!headerInfo) return { kind: 'UNKNOWN', records: [], headerRow: null }
  const colMap = buildColumnMap(headerInfo.headers)
  const kind = detectKind(headerInfo.headers, path.basename(filePath))
  const records = kind === 'PIEZA_PIEZA'
    ? parsePP(rows, headerInfo.rowIndex, colMap)
    : kind === 'PUERTA_0'
      ? parseP0(rows, headerInfo.rowIndex, colMap)
      : []
  return { kind, records, headerRow: headerInfo.headers }
}

/**
 * Crea un Excel en memoria con las filas del segmento.
 * Columnas normalizadas para que el parser del PWA las reconozca.
 */
function buildSegmentExcel(records, kind) {
  let headers
  let rows

  if (kind === 'PIEZA_PIEZA') {
    headers = ['Fecha', 'Hora', 'Gate', 'Cantidad de Piezas', 'Peso de las Piezas', 'Calidad', 'Calibre', 'Error']
    rows = records.map((r) => {
      const d = new Date(r.ts)
      const dateStr = d.toISOString().slice(0, 10)
      const timeStr = d.toISOString().slice(11, 19)
      return [
        dateStr,
        timeStr,
        r.gate,
        r.pieces,
        r.weightKg != null ? r.weightKg : null,
        r.quality ?? null,
        r.calibre ?? null,
        r.error ?? null,
      ]
    })
  } else {
    // PUERTA_0
    headers = ['Fecha', 'Hora', 'Error', 'Cantidad de Piezas', 'Peso de las Piezas', 'Calidad', 'Calibre']
    rows = records.map((r) => {
      const d = new Date(r.ts)
      const dateStr = d.toISOString().slice(0, 10)
      const timeStr = d.toISOString().slice(11, 19)
      return [
        dateStr,
        timeStr,
        r.error ?? null,
        r.pieces,
        r.weightKg != null ? r.weightKg : null,
        r.quality ?? null,
        r.calibre ?? null,
      ]
    })
  }

  const sheetData = [headers, ...rows]
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
}

/**
 * Sube un buffer a Firebase Storage y retorna la downloadURL con token permanente.
 * La URL sigue el formato de Firebase Storage con token de acceso.
 */
async function uploadToStorage(buffer, storagePath, downloadToken) {
  const file = bucket.file(storagePath)
  await file.save(buffer, {
    metadata: {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      metadata: {
        firebaseStorageDownloadTokens: downloadToken,
      },
    },
  })
  // URL pública con token — misma estructura que Firebase Client SDK
  const bucket_name = bucket.name
  const encodedPath = encodeURIComponent(storagePath)
  const downloadURL = `https://firebasestorage.googleapis.com/v0/b/${bucket_name}/o/${encodedPath}?alt=media&token=${downloadToken}`
  return downloadURL
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== UPLOAD HISTORICAL EXCELS TO STORAGE ===\n')

  // 1. Listar archivos
  const ppFiles = walkXlsx(PP_DIR).filter((f) => !path.basename(f).toLowerCase().includes('totales'))
  const p0Files = walkXlsx(P0_DIR).filter((f) => !path.basename(f).toLowerCase().includes('totales'))
  console.log(`PP files: ${ppFiles.length}`)
  console.log(`P0 files: ${p0Files.length}\n`)

  // 2. Cargar registros existentes en graderUploads (para idempotencia)
  console.log('── Cargando graderUploads existentes ──')
  const existingSnap = await db.collection('graderUploads').get()
  const existingKeys = new Set()
  for (const d of existingSnap.docs) {
    const data = d.data()
    const dateKey = data.sessionDate || (data.inferred?.startAt || '').slice(0, 10)
    const shiftKey = data.shiftId || 'unknown'
    const kind = data.fileMeta?.kind || 'unknown'
    existingKeys.add(`${dateKey}|${shiftKey}|${kind}`)
  }
  console.log(`Registros existentes: ${existingSnap.size}\n`)

  // 3. Parsear y segmentar todos los archivos
  // Estructura: segMap[date|shift] = { pp: [], p0: [] }
  const segMap = new Map()
  const getSeg = (date, shift) => {
    const key = `${date}|${shift}`
    if (!segMap.has(key)) segMap.set(key, { sessionDate: date, shiftId: shift, pp: [], p0: [] })
    return segMap.get(key)
  }

  console.log('── Parseando PP ──')
  for (const f of ppFiles) {
    const { kind, records } = parseExcelFile(f)
    const name = path.basename(f)
    if (kind !== 'PIEZA_PIEZA') {
      console.log(`  ⚠️  ${name}: kind=${kind}, skip`)
      continue
    }
    console.log(`  ✓ ${name.slice(0, 70)} → ${records.length} registros`)
    for (const rec of records) {
      const { sessionDate, shiftId } = assignShiftAndDate(rec.ts)
      getSeg(sessionDate, shiftId).pp.push(rec)
    }
  }

  console.log('\n── Parseando P0 ──')
  for (const f of p0Files) {
    const { kind, records } = parseExcelFile(f)
    const name = path.basename(f)
    if (kind !== 'PUERTA_0') {
      console.log(`  ⚠️  ${name}: kind=${kind}, skip`)
      continue
    }
    console.log(`  ✓ ${name.slice(0, 70)} → ${records.length} registros`)
    for (const rec of records) {
      const { sessionDate, shiftId } = assignShiftAndDate(rec.ts)
      getSeg(sessionDate, shiftId).p0.push(rec)
    }
  }
  console.log()

  // Filtrar segmentos pequeños
  const validSegs = Array.from(segMap.values()).filter(
    (s) => s.pp.length + s.p0.length >= 100,
  )
  validSegs.sort((a, b) => (a.sessionDate + a.shiftId).localeCompare(b.sessionDate + b.shiftId))
  console.log(`Segmentos válidos (≥100 registros): ${validSegs.length}\n`)

  // 4. Por cada segmento, subir si no existe
  let uploaded = 0
  let skipped = 0
  let errors = 0

  for (const seg of validSegs) {
    const { sessionDate, shiftId, pp, p0 } = seg

    // Determinar si ya existe en graderUploads
    const ppKey = `${sessionDate}|${shiftId}|PIEZA_PIEZA`
    const p0Key = `${sessionDate}|${shiftId}|PUERTA_0`
    const ppExists = existingKeys.has(ppKey)
    const p0Exists = existingKeys.has(p0Key)

    const toUpload = []
    if (pp.length > 0 && !ppExists) toUpload.push({ kind: 'PIEZA_PIEZA', records: pp })
    if (p0.length > 0 && !p0Exists) toUpload.push({ kind: 'PUERTA_0', records: p0 })

    if (toUpload.length === 0) {
      console.log(`  ⏭  ${sessionDate} ${shiftId} — ya existe`)
      skipped++
      continue
    }

    for (const { kind, records } of toUpload) {
      const uploadId = randomUUID()
      const shiftSlug = shiftId.toLowerCase().replace(/\s+/g, '_')
      const kindSlug = kind === 'PIEZA_PIEZA' ? 'pp' : 'p0'
      const fileName = `${sessionDate}_${shiftSlug}_${kindSlug}.xlsx`
      const storagePath = `graderUploads/${uploadId}/${Date.now()}_${fileName}`
      const downloadToken = randomUUID()

      if (DRY_RUN) {
        console.log(`  🔍 DRY [${kind}] ${sessionDate} ${shiftId}: ${records.length} registros → ${storagePath}`)
        uploaded++
        continue
      }

      try {
        const buffer = buildSegmentExcel(records, kind)
        const downloadURL = await uploadToStorage(buffer, storagePath, downloadToken)

        // Calcular rango de tiempo
        const timestamps = records.map((r) => r.ts).sort()
        const startAt = timestamps[0]
        const endAt = timestamps[timestamps.length - 1]

        const docData = {
          id: uploadId,
          fileMeta: {
            id: uploadId,
            name: fileName,
            sizeBytes: buffer.length,
            kind,
            downloadURL,
            storagePath,
            parsedAt: new Date().toISOString(),
          },
          inferred: { startAt, endAt },
          sessionDate,
          shiftId,
          createdBy: 'batch-upload-historical',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          _createdAt: admin.firestore.FieldValue.serverTimestamp(),
          _updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }

        await db.collection('graderUploads').doc(uploadId).set(docData)
        console.log(`  ✅ [${kind}] ${sessionDate} ${shiftId}: ${records.length} registros subidos`)
        uploaded++
      } catch (err) {
        console.error(`  ❌ [${kind}] ${sessionDate} ${shiftId}: ${err.message}`)
        errors++
      }
    }
  }

  console.log(`\n=== RESUMEN ===`)
  console.log(`Subidos:   ${uploaded}`)
  console.log(`Omitidos:  ${skipped}`)
  console.log(`Errores:   ${errors}`)
  if (DRY_RUN) console.log('\n(DRY RUN — nada fue escrito)')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR FATAL:', err)
    process.exit(1)
  })
