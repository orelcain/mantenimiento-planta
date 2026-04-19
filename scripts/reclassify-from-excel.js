/**
 * Reclasificador histórico desde Excel locales (versión rápida).
 *
 * En lugar de descargar pieceRecords de Firestore (lento, ~14k docs/turno),
 * lee los Excel PP y P0 directamente desde disco, infiere gates desde PP,
 * clasifica los gate0Records con las 9 causas Matrix, y escribe SOLO
 * topP0Causes a Firestore (383 writes pequeños al final).
 *
 * Velocidad estimada: 2-5 minutos para toda la temporada.
 *
 * Flags:
 *   --dry-run         muestra qué haría, no escribe
 *   --skip-done       saltea turnos que ya tienen causas canónicas
 *   --start YYYY-MM-DD
 *   --end   YYYY-MM-DD
 *
 * Uso:
 *   node scripts/reclassify-from-excel.js
 *   node scripts/reclassify-from-excel.js --skip-done
 *   node scripts/reclassify-from-excel.js --dry-run
 */

const admin = require('firebase-admin')
const XLSX  = require('xlsx')
const fs    = require('fs')
const path  = require('path')
const sa    = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) })
}
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

// ─── Flags ────────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run')
const SKIP_DONE = process.argv.includes('--skip-done')
const startIdx  = process.argv.indexOf('--start')
const endIdx    = process.argv.indexOf('--end')
const argStart  = startIdx !== -1 ? process.argv[startIdx + 1] : null
const argEnd    = endIdx   !== -1 ? process.argv[endIdx   + 1] : null

if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')

// ─── Rutas locales ────────────────────────────────────────────────────────────
const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const PP_DIR   = path.join(BASE_DIR, 'pieza a pieza')
const P0_DIR   = path.join(BASE_DIR, 'punto 0')

// ─── Causas canónicas ─────────────────────────────────────────────────────────
const CANONICAL = new Set([
  'fuera_de_limites','no_leido_fotocelula','too_close_too_long','puerta_no_preparada',
  'fuera_de_calibre','fuera_de_calidad','fuera_de_conservacion','fuera_de_producto','otro',
])

// ─── Calibre → rangos peso (g) ────────────────────────────────────────────────
const CALIBRE_WEIGHT_RANGES = {
  '0-2 lb':   { minG:    0, maxG:  907 },
  '2-4 lb':   { minG:  907, maxG: 1814 },
  '4-6 lb':   { minG: 1814, maxG: 2722 },
  '6-8 lb':   { minG: 2722, maxG: 3629 },
  '8-10 lb':  { minG: 3629, maxG: 4536 },
  '10-12 lb': { minG: 4536, maxG: 5443 },
  '12-14 lb': { minG: 5443, maxG: 6350 },
  '14-16 lb': { minG: 6350, maxG: 7257 },
  '16+ lb':   { minG: 7257, maxG: Infinity },
}

// Normaliza strings de calibre: "0 - 2 LB" → "0-2 lb", "10 - 12 lb" → "10-12 lb"
function normalizeCalibre(s) {
  if (s == null) return undefined
  const t = String(s).trim().toLowerCase()
  const m = t.match(/^(\d+)\s*-\s*(\d+)\s*lb$/i)
  if (m) return `${m[1]}-${m[2]} lb`
  if (/^16\+?\s*lb$/i.test(t)) return '16+ lb'
  if (/^\d+$/.test(t)) return undefined // solo número sin "lb" → ignorar
  return t
}

// ─── Helpers parser (reutilizado de bulk-upload-piece-records.js) ─────────────
const norm = (v) => v == null ? '' : String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i]
    if (!row || !Array.isArray(row)) continue
    const cells = row.map(norm).filter(Boolean)
    if (cells.length < 3) continue
    const hasFecha  = cells.some(c => c === 'fecha' || c === 'date')
    const hasPiezas = cells.some(c => c.includes('pieza') || c.includes('cantidad') || c === 'qty')
    if (hasFecha && hasPiezas) return { rowIndex: i, headers: row.map(norm) }
  }
  return null
}

function buildColMap(headers) {
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
  let dateStr = '', timeStr = ''
  if (typeof dateVal === 'number') {
    const d = new Date((Math.floor(dateVal - 25569)) * 86400 * 1000)
    dateStr = d.toISOString().slice(0, 10)
  } else if (dateVal != null) {
    const s = String(dateVal).trim()
    const m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/)
    if (m) dateStr = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`
    else if (/^\d{4}-\d{2}-\d{2}/.test(s)) dateStr = s.slice(0, 10)
  }
  if (typeof timeVal === 'number') {
    const t = Math.round(timeVal * 86400)
    timeStr = `${String(Math.floor(t/3600)).padStart(2,'0')}:${String(Math.floor((t%3600)/60)).padStart(2,'0')}:${String(t%60).padStart(2,'0')}`
  } else if (timeVal != null) {
    const m = String(timeVal).trim().match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
    if (m) timeStr = `${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${(m[3]||'00').padStart(2,'0')}`
  }
  if (!dateStr) return null
  return `${dateStr}T${timeStr || '00:00:00'}.000Z`
}

function parseNum(v) {
  if (v == null) return undefined
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'))
  return isNaN(n) ? undefined : n
}

function assignShift(ts) {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return { shiftId: 'Sin turno', dateKey: ts.slice(0, 10) }
  const m = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (m >= 420 && m < 1140) return { shiftId: 'Turno día',   dateKey: ts.slice(0, 10) }
  if (m >= 1140)             return { shiftId: 'Turno noche', dateKey: ts.slice(0, 10) }
  const prev = new Date(d); prev.setUTCDate(prev.getUTCDate() - 1)
  return { shiftId: 'Turno noche', dateKey: prev.toISOString().slice(0, 10) }
}

// ─── Parser de Excel (PP y P0) ────────────────────────────────────────────────
function parseXlsx(filePath) {
  const buf  = fs.readFileSync(filePath)
  const wb   = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const ws   = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const info = findHeaderRow(rows)
  if (!info) return { kind: 'UNKNOWN', records: [] }

  const colMap = buildColMap(info.headers)
  const fname  = path.basename(filePath).toLowerCase()
  const hasGate  = info.headers.some(h => h && (h === 'gate' || h.includes('compuerta')))
  const hasError = info.headers.some(h => h && (h === 'error' || h === 'motivo' || h === 'causa'))
  const isP0 = fname.includes('puerta 0') || fname.includes('punto cero') || (!hasGate && hasError)
  const kind = isP0 ? 'PUERTA_0' : 'PIEZA_PIEZA'

  const iDate   = col(colMap, 'fecha', 'date')
  const iTime   = col(colMap, 'hora', 'time')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iGate   = col(colMap, 'gate', 'compuerta', 'puerta')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iWeightG= col(colMap, 'peso en gr', 'peso en gramos')
  const iQuality= col(colMap, 'calidad', 'quality')
  const iCalibre= col(colMap, 'calibre', 'size', 'tamano')
  const iError  = col(colMap, 'error', 'motivo', 'causa', 'reason')

  const records = []
  for (let r = info.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || !Array.isArray(row)) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : null, iTime != null ? row[iTime] : null)
    if (!ts) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : null)
    if (!pieces || pieces <= 0) continue
    const gate = kind === 'PIEZA_PIEZA'
      ? Math.round(parseNum(iGate != null ? row[iGate] : null) ?? 0)
      : 0
    const weightG = iWeightG != null ? parseNum(row[iWeightG]) : undefined
    const weightKg = iWeight != null ? parseNum(row[iWeight]) : undefined
    records.push({
      ts, gate, pieces,
      weightKg:            weightKg,
      weightPerPieceGrams: weightG,
      quality: iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() || undefined : undefined,
      calibre: normalizeCalibre(iCalibre != null ? row[iCalibre] : null),
      error:   iError   != null && row[iError]   != null ? String(row[iError]).trim()   || undefined : undefined,
    })
  }
  return { kind, records }
}

function walkXlsx(dir) {
  const files = []
  if (!fs.existsSync(dir)) return files
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name)
    if (fs.statSync(full).isDirectory()) files.push(...walkXlsx(full))
    else if (name.endsWith('.xlsx') && !name.startsWith('~$')) files.push(full)
  }
  return files
}

// ─── inferGatesHistory ────────────────────────────────────────────────────────
function inferGatesHistory(productive) {
  if (productive.length === 0) return []
  const sorted = [...productive].sort((a, b) => a.ts.localeCompare(b.ts))
  const windowMs = 30 * 60_000
  const windows = []
  let cur = [sorted[0]], t0 = new Date(sorted[0].ts).getTime()
  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i].ts).getTime()
    if (t - t0 > windowMs) { windows.push(cur); cur = []; t0 = t }
    cur.push(sorted[i])
  }
  if (cur.length > 0) windows.push(cur)

  const result = []
  for (const w of windows) {
    if (w.length < 10) continue
    const gates = []
    for (let g = 1; g <= 12; g++) {
      const forG = w.filter(p => p.gate === g)
      if (forG.length < 3) continue
      const combos = new Map()
      for (const p of forG) {
        const k = `${p.calibre ?? 'Other'}|${p.quality ?? 'Unknown'}`
        combos.set(k, (combos.get(k) ?? 0) + 1)
      }
      const top = [...combos.entries()].sort((a, b) => b[1] - a[1])[0]
      if (!top) continue
      const [calibre, quality] = top[0].split('|')
      gates.push({ gateNumber: g, assignedCalibre: calibre, assignedQuality: quality, active: true })
    }
    if (gates.length > 0) result.push({ startTs: w[0].ts, gates })
  }
  return result
}

// ─── Mapping errores Marelec → causas canónicas ─────────────────────────────
const MARELEC_ERROR_MAP = {
  'no leido por fotocelula': 'no_leido_fotocelula',
  'no leído por fotocélula': 'no_leido_fotocelula',
  'puerta no preparada':     'puerta_no_preparada',
  'too close':               'too_close_too_long',
  'too long':                'too_close_too_long',
  'too close or too long':   'too_close_too_long',
  // "Fuera de límites" NO se mapea aquí — se refina con classifyRecord
}

// ─── classifyRecordToMatrix ───────────────────────────────────────────────────
function classifyRecord(record, activeGates) {
  // 1) Si el Marelec marcó un error específico distinto de "Fuera de límites", usarlo
  if (record.error) {
    const errNorm = String(record.error).toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const mapped = MARELEC_ERROR_MAP[errNorm]
    if (mapped) return mapped
    // "Fuera de límites" o similar → cae al clasificador Matrix abajo
  }

  // 2) Clasificador Matrix (para "Fuera de límites" del Marelec o records sin Error)
  if (!activeGates || activeGates.length === 0) return 'fuera_de_limites'
  const weightG = record.weightPerPieceGrams != null
    ? record.weightPerPieceGrams
    : record.weightKg != null ? record.weightKg * 1000 : null

  if (weightG == null) {
    if (!record.calibre) return 'fuera_de_limites'
    const match = activeGates.find(g => g.assignedCalibre === record.calibre)
    if (!match) return 'fuera_de_calibre'
    if (record.quality && match.assignedQuality !== record.quality) return 'fuera_de_calidad'
    return 'fuera_de_limites'
  }
  const gateForWeight = activeGates.find(g => {
    const r = CALIBRE_WEIGHT_RANGES[g.assignedCalibre]
    return r && weightG >= r.minG && weightG < r.maxG
  })
  if (!gateForWeight) return 'fuera_de_limites'
  if (record.quality && gateForWeight.assignedQuality !== record.quality) return 'fuera_de_calidad'
  return 'fuera_de_limites'
}

// ─── Cache en disco para byShift (evita reparsear Excel cada corrida) ────────
const CACHE_FILE = path.join(__dirname, '.cache', 'reclassify-shifts.json')
function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    const idx = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    const dir = path.dirname(CACHE_FILE)
    const byShift = new Map()
    for (const { id, file } of idx) {
      const fp = path.join(dir, file)
      if (!fs.existsSync(fp)) return null  // cache roto → reparsear
      byShift.set(id, JSON.parse(fs.readFileSync(fp, 'utf-8')))
    }
    return byShift
  } catch { return null }
}
function saveCache(byShift) {
  try {
    const dir = path.dirname(CACHE_FILE)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    // Guardar por turno en archivos separados (evita límite string 512MB de JSON.stringify)
    const idx = []
    for (const [id, data] of byShift.entries()) {
      const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_')
      const fp = path.join(dir, `shift-${safeId}.json`)
      fs.writeFileSync(fp, JSON.stringify(data))
      idx.push({ id, file: `shift-${safeId}.json` })
    }
    fs.writeFileSync(CACHE_FILE, JSON.stringify(idx))
    return true
  } catch (e) {
    console.log(`   ⚠️  No se pudo guardar cache: ${e.message}`)
    return false
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`⚙️  Reclasificador desde Excel local — ${DRY_RUN ? 'DRY RUN' : 'REAL'}\n`)

  // 1) Parsear Excel PP (gates) + P0 (causas) — con cache en disco
  const NO_CACHE = process.argv.includes('--no-cache')
  let byShift = NO_CACHE ? null : loadCache()

  if (byShift) {
    console.log(`💾 Cargado de cache: ${byShift.size} turnos (usar --no-cache para reparsear)\n`)
  } else {
    console.log('📂 Parseando Excel locales (sin cache)...')
    byShift = new Map()
    const ensure = (id) => {
      if (!byShift.has(id)) byShift.set(id, { pp: [], p0: [] })
      return byShift.get(id)
    }

    const ppFiles = walkXlsx(PP_DIR)
    console.log(`   PP: ${ppFiles.length} archivos`)
    for (const f of ppFiles) {
      const { records } = parseXlsx(f)
      for (const r of records) {
        const { shiftId, dateKey } = assignShift(r.ts)
        ensure(`${dateKey}__${shiftId}`).pp.push(r)
      }
    }
    console.log('   ✓ PP cargados')

    const p0Files = walkXlsx(P0_DIR)
    console.log(`   P0: ${p0Files.length} archivos`)
    for (const f of p0Files) {
      const { records } = parseXlsx(f)
      for (const r of records) {
        const { shiftId, dateKey } = assignShift(r.ts)
        ensure(`${dateKey}__${shiftId}`).p0.push(r)
      }
    }
    console.log('   ✓ P0 cargados (fuente única — con columna Error del Marelec)')
    console.log(`   📋 ${byShift.size} turnos en Excel`)
    saveCache(byShift)
    console.log(`   💾 Cache guardado en ${CACHE_FILE}\n`)
  }

  // 2) Cargar summaries de Firestore para saber qué IDs existen
  console.log('🔗 Cargando IDs de Firestore...')
  let query = db.collection('graderDailySummaries').orderBy('dateKey')
  if (argStart) query = query.where('dateKey', '>=', argStart)
  if (argEnd)   query = query.where('dateKey', '<=', argEnd)
  const snap = await query.get()
  let summaries = snap.docs.map(d => ({ id: d.id, topP0Causes: d.data().topP0Causes }))

  if (SKIP_DONE) {
    const before = summaries.length
    summaries = summaries.filter(s => {
      const causes = s.topP0Causes
      return !(Array.isArray(causes) && causes.length > 0 && CANONICAL.has(causes[0]?.error))
    })
    console.log(`   ⏭️  ${before - summaries.length} ya reclasificados, procesando ${summaries.length}\n`)
  } else {
    console.log(`   📋 ${summaries.length} turnos a procesar\n`)
  }

  // 3) Reclasificar cada turno
  let ok = 0, sinP0 = 0, sinDatos = 0, errors = 0
  const start = Date.now()
  const WRITE_BATCH_SIZE = 400  // límite Firestore batch

  // Acumular writes para batch commit
  let batch = db.batch()
  let batchCount = 0

  for (let i = 0; i < summaries.length; i++) {
    const { id } = summaries[i]
    const data = byShift.get(id)

    if (!data || data.p0.length === 0) {
      sinP0++
      process.stdout.write(`\r  ${i+1}/${summaries.length} — ✅${ok} ⏭️${sinP0} ❌${errors} — ${((Date.now()-start)/1000).toFixed(1)}s  `)
      continue
    }

    try {
      // Inferir gates desde PP
      const productive = (data.pp || []).filter(r => r.gate >= 1 && r.gate <= 12)
      const windows    = inferGatesHistory(productive)

      const getGates = (ts) => {
        const eligible = windows.filter(w => w.startTs <= ts)
        return eligible[eligible.length - 1]?.gates ?? []
      }

      // Clasificar gate0Records
      const causeCount = new Map()
      let totalG0 = 0
      for (const r of data.p0) {
        const cause = classifyRecord(r, getGates(r.ts).filter(g => g.active))
        causeCount.set(cause, (causeCount.get(cause) ?? 0) + r.pieces)
        totalG0 += r.pieces
      }

      const topP0Causes = [...causeCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([error, pieces]) => ({ error, pieces, pct: totalG0 > 0 ? +((pieces/totalG0)*100).toFixed(2) : 0 }))

      if (!DRY_RUN) {
        const ref = db.collection('graderDailySummaries').doc(id)
        // Actualizar pointZeroPieces y pointZeroPct (fields reales del summary)
        // para que matcheen con la suma de topP0Causes
        const totalPieces = (data.pp || []).reduce((s, r) => s + r.pieces, 0)
        const pointZeroPct = totalPieces > 0 ? +((totalG0 / totalPieces) * 100).toFixed(2) : 0
        batch.update(ref, {
          topP0Causes,
          pointZeroPieces: totalG0,
          pointZeroPct,
          reclassifiedAt: new Date().toISOString(),
        })
        batchCount++
        // Commit cada 400 docs (límite Firestore)
        if (batchCount >= WRITE_BATCH_SIZE) {
          await batch.commit()
          batch = db.batch()
          batchCount = 0
        }
      }
      ok++
    } catch (e) {
      errors++
    }

    process.stdout.write(`\r  ${i+1}/${summaries.length} — ✅${ok} ⏭️${sinP0} ❌${errors} — ${((Date.now()-start)/1000).toFixed(1)}s  `)
  }

  // Commit final
  if (!DRY_RUN && batchCount > 0) await batch.commit()

  console.log('\n')
  console.log(`✅ ${ok} reclasificados`)
  console.log(`⏭️  ${sinP0} sin datos P0 en Excel local`)
  console.log(`❌ ${errors} errores`)
  console.log(`\n⏱️  Total: ${((Date.now()-start)/1000).toFixed(1)}s`)
}

main().catch(err => { console.error(err); process.exit(1) })
