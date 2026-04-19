/**
 * Enrich pieceRecords (gate=0) con data del Excel P0 del Marelec.
 *
 * Contexto: bulk-upload-piece-records.js sube records PP (pieza a pieza),
 * incluyendo gate=0. Esos records tienen calibre+quality pero NO tienen
 * peso ni error — el Marelec reporta eso en el Excel P0 separado.
 *
 * Este script hace MERGE por timestamp:
 *   - Si pieceRecord con gate=0 y mismo ts existe → update con
 *     weightPerPieceGrams + error + source="P0_EXCEL"
 *   - Si el P0 es "huérfano" (no hay PP gate=0 con ese ts) → insert nuevo
 *
 * Resultado: cada pieceRecord gate=0 tendrá toda la info combinada, listo
 * para el gráfico segundo-a-segundo con colores por error y peso real.
 *
 * Flags:
 *   --dry-run      muestra qué haría, no escribe
 *   --shift-id X   solo procesa ese turno (ej. "2026-02-18__Turno día")
 *
 * Uso:
 *   node scripts/enrich-pieceRecords-from-p0.js
 *   node scripts/enrich-pieceRecords-from-p0.js --dry-run
 *   node scripts/enrich-pieceRecords-from-p0.js --shift-id "2026-02-18__Turno día"
 */

const admin = require('firebase-admin')
const XLSX  = require('xlsx')
const fs    = require('fs')
const path  = require('path')
const sa    = require('../serviceAccountKey.json')

if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const DRY_RUN = process.argv.includes('--dry-run')
const shiftIdIdx = process.argv.indexOf('--shift-id')
const SHIFT_FILTER = shiftIdIdx !== -1 ? process.argv[shiftIdIdx + 1] : null

if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')
if (SHIFT_FILTER) console.log(`🎯 Solo turno: ${SHIFT_FILTER}\n`)

const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const P0_DIR   = path.join(BASE_DIR, 'punto 0')
const BATCH_SIZE = 400

// ─── Helpers copiados de reclassify-from-excel.js ────────────────────────────
const norm = (v) => v == null ? '' : String(v).trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

function findHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const row = rows[i]; if (!row) continue
    const cells = row.map(norm).filter(Boolean)
    if (cells.length < 3) continue
    if (cells.some(c => c === 'fecha' || c === 'date') && cells.some(c => c.includes('pieza') || c.includes('cantidad'))) {
      return { rowIndex: i, headers: row.map(norm) }
    }
  }
  return null
}
function buildColMap(headers) { const m = {}; headers.forEach((h, i) => { if (h) m[h] = i }); return m }
function col(map, ...names) {
  for (const n of names) { const k = norm(n)
    for (const key of Object.keys(map)) if (key === k || key.includes(k)) return map[key] }
  return null
}
function parseDatetime(d, t) {
  let ds = '', ts = ''
  if (typeof d === 'number') ds = new Date((Math.floor(d-25569))*86400000).toISOString().slice(0,10)
  else if (d) { const m = String(d).match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})$/); if (m) ds=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; else if (/^\d{4}-\d{2}-\d{2}/.test(String(d))) ds=String(d).slice(0,10) }
  if (typeof t === 'number') { const s=Math.round(t*86400); ts=`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor((s%3600)/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}` }
  else if (t) { const m = String(t).match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/); if (m) ts=`${m[1].padStart(2,'0')}:${m[2].padStart(2,'0')}:${(m[3]||'00').padStart(2,'0')}` }
  if (!ds) return null
  return `${ds}T${ts || '00:00:00'}.000Z`
}
function parseNum(v) { if (v==null) return undefined; const n=typeof v==='number'?v:parseFloat(String(v).replace(',','.')); return isNaN(n)?undefined:n }
function assignShift(ts) {
  const d = new Date(ts); if (isNaN(d.getTime())) return { shiftId: 'Sin turno', dateKey: ts.slice(0, 10) }
  const m = d.getUTCHours()*60 + d.getUTCMinutes()
  if (m >= 420 && m < 1140) return { shiftId: 'Turno día',   dateKey: ts.slice(0,10) }
  if (m >= 1140)             return { shiftId: 'Turno noche', dateKey: ts.slice(0,10) }
  const prev = new Date(d); prev.setUTCDate(prev.getUTCDate()-1)
  return { shiftId: 'Turno noche', dateKey: prev.toISOString().slice(0,10) }
}

// Detecta archivos consolidados del Marelec (rango >40 días) para descartar.
function isConsolidatedFile(filePath) {
  const m = path.basename(filePath).match(/\((\d{8})_\d{6}\s*-\s*(\d{8})_\d{6}\)\.xlsx$/i)
  if (!m) return false
  const d1 = new Date(`${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`)
  const d2 = new Date(`${m[2].slice(0,4)}-${m[2].slice(4,6)}-${m[2].slice(6,8)}`)
  return (d2 - d1) / 86400000 > 40
}

function parseP0Xlsx(filePath) {
  const buf = fs.readFileSync(filePath)
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null })
  const info = findHeaderRow(rows); if (!info) return []
  const colMap  = buildColMap(info.headers)
  const iDate   = col(colMap, 'fecha', 'date')
  const iTime   = col(colMap, 'hora', 'time')
  const iPieces = col(colMap, 'cantidad de piezas', 'cant. piezas', 'piezas', 'qty', 'cantidad')
  const iWeightG= col(colMap, 'peso en gr', 'peso en gramos')
  const iWeight = col(colMap, 'peso de las piezas', 'peso piezas', 'weight')
  const iQuality= col(colMap, 'calidad', 'quality')
  const iError  = col(colMap, 'error', 'motivo', 'causa', 'reason')
  const records = []
  for (let r = info.rowIndex + 1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue
    const ts = parseDatetime(iDate != null ? row[iDate] : null, iTime != null ? row[iTime] : null)
    if (!ts) continue
    const pieces = parseNum(iPieces != null ? row[iPieces] : null)
    if (!pieces || pieces <= 0) continue
    records.push({
      ts, pieces,
      weightPerPieceGrams: iWeightG != null ? parseNum(row[iWeightG]) : undefined,
      weightKg: iWeight != null ? parseNum(row[iWeight]) : undefined,
      quality: iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() || undefined : undefined,
      error:   iError   != null && row[iError]   != null ? String(row[iError]).trim()   || undefined : undefined,
    })
  }
  return records
}

function walkXlsx(dir) {
  const out = []; if (!fs.existsSync(dir)) return out
  for (const n of fs.readdirSync(dir)) {
    const f = path.join(dir, n)
    if (fs.statSync(f).isDirectory()) out.push(...walkXlsx(f))
    else if (n.endsWith('.xlsx') && !n.startsWith('~$')) out.push(f)
  }
  return out
}

// Dedupe por ts+pieces+weight+error+quality
function p0Key(r) {
  return `${r.ts}|${r.pieces}|${r.weightPerPieceGrams ?? ''}|${r.weightKg ?? ''}|${r.error ?? ''}|${r.quality ?? ''}`
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('📂 Parseando Excel P0...')
  const allFiles = walkXlsx(P0_DIR)
  const files    = allFiles.filter(f => !isConsolidatedFile(f))
  const skipped  = allFiles.length - files.length
  console.log(`   ${files.length} archivos${skipped ? ` (${skipped} consolidados omitidos)` : ''}\n`)

  const byShift = new Map()
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const t0 = Date.now()
    const records = parseP0Xlsx(f)
    for (const r of records) {
      const { shiftId, dateKey } = assignShift(r.ts)
      const id = `${dateKey}__${shiftId}`
      if (!byShift.has(id)) byShift.set(id, [])
      byShift.get(id).push(r)
    }
    console.log(`   [${i+1}/${files.length}] ${path.basename(f).slice(0,60)} → ${records.length} recs (${((Date.now()-t0)/1000).toFixed(1)}s)`)
  }

  // Dedupe por turno
  let dedupTotal = 0
  for (const [id, recs] of byShift) {
    const seen = new Set(); const unique = []
    for (const r of recs) { const k = p0Key(r); if (seen.has(k)) continue; seen.add(k); unique.push(r) }
    dedupTotal += recs.length - unique.length
    byShift.set(id, unique)
  }
  console.log(`\n🧹 Dedupe P0: -${dedupTotal} duplicados\n`)

  // Filtrar por SHIFT_FILTER si está presente
  const shiftIds = SHIFT_FILTER
    ? [SHIFT_FILTER].filter(id => byShift.has(id))
    : [...byShift.keys()].sort()

  console.log(`🎯 Turnos a procesar: ${shiftIds.length}\n`)

  let totalUpdated = 0, totalInserted = 0, totalSkipped = 0, shiftsDone = 0, shiftsNoPieceRecords = 0, shiftsError = 0
  const start = Date.now()

  for (const shiftId of shiftIds) {
    const p0Records = byShift.get(shiftId)
    try {
      const summaryRef = db.collection('graderDailySummaries').doc(shiftId)
      const summaryDoc = await summaryRef.get()
      if (!summaryDoc.exists) { shiftsError++; continue }

      const prCol = summaryRef.collection('pieceRecords')
      // Cargar solo gate=0
      const prSnap = await prCol.where('gate', '==', 0).get()
      if (prSnap.empty && p0Records.length === 0) { shiftsDone++; continue }

      // Indexar pieceRecords gate=0 por timestamp
      const byTs = new Map()
      for (const doc of prSnap.docs) {
        const r = doc.data()
        if (!r.ts) continue
        if (!byTs.has(r.ts)) byTs.set(r.ts, [])
        byTs.get(r.ts).push({ id: doc.id, data: r })
      }

      let updatedInShift = 0, insertedInShift = 0, skippedInShift = 0
      let batch = db.batch(), batchCount = 0
      const commit = async () => {
        if (batchCount === 0) return
        if (!DRY_RUN) await batch.commit()
        batch = db.batch(); batchCount = 0
      }

      for (const p0 of p0Records) {
        const matches = byTs.get(p0.ts) ?? []
        // Si ya tiene error+source P0, skip (idempotente)
        const enrichedMatch = matches.find(m => m.data.source === 'P0_EXCEL' && m.data.error != null)
        if (enrichedMatch) { skippedInShift++; continue }

        // Preferir match con pieces igual
        const match = matches.find(m => m.data.pieces === p0.pieces) ?? matches[0]
        if (match) {
          // UPDATE
          const ref = prCol.doc(match.id)
          const patch = {
            source: 'P0_EXCEL',
            error: p0.error ?? match.data.error,
          }
          if (p0.weightPerPieceGrams != null) patch.weightPerPieceGrams = p0.weightPerPieceGrams
          if (p0.weightKg != null)            patch.weightKg = p0.weightKg
          if (DRY_RUN) {
            updatedInShift++
          } else {
            batch.update(ref, patch); batchCount++; updatedInShift++
            if (batchCount >= BATCH_SIZE) await commit()
          }
          // Marcar que ya se enriqueció
          match.data.source = 'P0_EXCEL'
        } else {
          // INSERT nuevo — P0 huérfano (sin PP gate=0 correspondiente)
          const newRec = {
            ts: p0.ts,
            gate: 0,
            pieces: p0.pieces,
            weightPerPieceGrams: p0.weightPerPieceGrams,
            weightKg: p0.weightKg,
            quality: p0.quality,
            error: p0.error,
            source: 'P0_EXCEL',
          }
          if (DRY_RUN) {
            insertedInShift++
          } else {
            batch.set(prCol.doc(), newRec); batchCount++; insertedInShift++
            if (batchCount >= BATCH_SIZE) await commit()
          }
        }
      }
      await commit()

      totalUpdated  += updatedInShift
      totalInserted += insertedInShift
      totalSkipped  += skippedInShift
      if (p0Records.length === 0 && prSnap.empty) shiftsNoPieceRecords++
      else                                         shiftsDone++
    } catch (e) {
      console.error(`\n❌ ${shiftId}:`, e.message)
      shiftsError++
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    process.stdout.write(`\r  ${shiftsDone + shiftsError + shiftsNoPieceRecords}/${shiftIds.length} — ✅${shiftsDone} ⚠️${shiftsNoPieceRecords} ❌${shiftsError} — updates:${totalUpdated} inserts:${totalInserted} skipped:${totalSkipped} — ${elapsed}s  `)
  }

  console.log('\n')
  console.log(`✅ Turnos procesados: ${shiftsDone}`)
  console.log(`⚠️  Sin pieceRecords ni P0: ${shiftsNoPieceRecords}`)
  console.log(`❌ Errores: ${shiftsError}`)
  console.log(`📊 Pieces records actualizados: ${totalUpdated}`)
  console.log(`📊 Pieces records insertados (P0 huérfanos): ${totalInserted}`)
  console.log(`📊 Pieces records saltados (ya enriquecidos): ${totalSkipped}`)
  console.log(`⏱️  Total: ${((Date.now() - start) / 1000).toFixed(1)}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
