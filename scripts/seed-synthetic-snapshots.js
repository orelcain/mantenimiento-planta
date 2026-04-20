/**
 * Seed de configSnapshots synthetic para los turnos de la temporada histórica.
 *
 * Para cada turno con summary que NO tenga snapshot synthetic, infiere la
 * config inicial de gates desde los pieceRecords con gate>=1 (calibre y
 * calidad dominantes por gate) y escribe UN snapshot con:
 *  - id: `synthetic-${shiftDocId}` (predecible → idempotente upsert)
 *  - at: startAt del turno (estable — no cambia entre corridas)
 *  - synthetic: true
 *  - changedBy: { uid: 'system', name: 'Inferido por sistema' }
 *  - reason: "Inferido del PP — N ventanas detectadas"
 *
 * Convivencia con snapshots manuales: no toca otros snapshots existentes.
 * El panel ConfigChangeHistory los listará todos cronológicamente, con el
 * synthetic primero (porque su `at` es startAt del turno).
 *
 * Reusa el cache .cache/ del reclassify-from-excel.js si está disponible.
 *
 * Flags:
 *   --dry-run            no escribe, muestra qué haría
 *   --start YYYY-MM-DD   filtra desde fecha
 *   --end YYYY-MM-DD     filtra hasta fecha
 *   --shift-id X         solo procesa ese turno (debug)
 *
 * Uso:
 *   node scripts/seed-synthetic-snapshots.js --dry-run
 *   node scripts/seed-synthetic-snapshots.js
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
const startIdx = process.argv.indexOf('--start')
const endIdx   = process.argv.indexOf('--end')
const shiftIdx = process.argv.indexOf('--shift-id')
const ARG_START = startIdx !== -1 ? process.argv[startIdx + 1] : null
const ARG_END   = endIdx   !== -1 ? process.argv[endIdx   + 1] : null
const SHIFT_FILTER = shiftIdx !== -1 ? process.argv[shiftIdx + 1] : null

if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')

const BASE_DIR = 'C:/Users/pc hp/OneDrive/ANTARFOOD/⚙️ GRADER/temporada 2025-2026'
const PP_DIR   = path.join(BASE_DIR, 'pieza a pieza')

// ─── Helpers (replicados de reclassify-from-excel.js) ──────────────────────
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
function normalizeCalibre(s) {
  if (s == null) return undefined
  const t = String(s).trim().toLowerCase()
  const m = t.match(/^(\d+)\s*-\s*(\d+)\s*lb$/i)
  if (m) return `${m[1]}-${m[2]} lb`
  if (/^16\+?\s*lb$/i.test(t)) return '16+ lb'
  if (/^\d+$/.test(t)) return undefined
  return t
}
function isConsolidatedFile(filePath) {
  const m = path.basename(filePath).match(/\((\d{8})_\d{6}\s*-\s*(\d{8})_\d{6}\)\.xlsx$/i)
  if (!m) return false
  const d1 = new Date(`${m[1].slice(0,4)}-${m[1].slice(4,6)}-${m[1].slice(6,8)}`)
  const d2 = new Date(`${m[2].slice(0,4)}-${m[2].slice(4,6)}-${m[2].slice(6,8)}`)
  return (d2 - d1) / 86400000 > 40
}
function assignShift(ts) {
  const d = new Date(ts); if (isNaN(d.getTime())) return { shiftId: 'Sin turno', dateKey: ts.slice(0, 10) }
  const m = d.getUTCHours()*60 + d.getUTCMinutes()
  if (m >= 420 && m < 1140) return { shiftId: 'Turno día',   dateKey: ts.slice(0,10) }
  if (m >= 1140)             return { shiftId: 'Turno noche', dateKey: ts.slice(0,10) }
  const prev = new Date(d); prev.setUTCDate(prev.getUTCDate()-1)
  return { shiftId: 'Turno noche', dateKey: prev.toISOString().slice(0,10) }
}
function dedupeByKey(records) {
  const seen = new Set(); const out = []
  for (const r of records) {
    const k = `${r.ts}|${r.gate}|${r.pieces}|${r.weightPerPieceGrams ?? ''}|${r.weightKg ?? ''}|${r.error ?? ''}|${r.calibre ?? ''}|${r.quality ?? ''}`
    if (seen.has(k)) continue
    seen.add(k); out.push(r)
  }
  return out
}
function parseXlsx(filePath) {
  const buf = fs.readFileSync(filePath)
  const wb  = XLSX.read(buf, { type: 'buffer', cellDates: false })
  const ws  = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
  const info = findHeaderRow(rows); if (!info) return []
  const colMap = buildColMap(info.headers)
  const fname  = path.basename(filePath).toLowerCase()
  const hasGate  = info.headers.some(h => h && (h === 'gate' || h.includes('compuerta')))
  const hasError = info.headers.some(h => h && (h === 'error' || h === 'motivo' || h === 'causa'))
  const isP0 = fname.includes('puerta 0') || fname.includes('punto cero') || (!hasGate && hasError)
  if (isP0) return []  // solo nos interesa PP para inferir gates
  const iDate=col(colMap,'fecha','date'), iTime=col(colMap,'hora','time')
  const iPieces=col(colMap,'cantidad de piezas','cant. piezas','piezas','qty','cantidad')
  const iGate=col(colMap,'gate','compuerta','puerta')
  const iWeight=col(colMap,'peso de las piezas','peso piezas','weight')
  const iWeightG=col(colMap,'peso en gr','peso en gramos')
  const iQuality=col(colMap,'calidad','quality'), iCalibre=col(colMap,'calibre','size')
  const records = []
  for (let r = info.rowIndex+1; r < rows.length; r++) {
    const row = rows[r]; if (!row) continue
    const ts = parseDatetime(iDate!=null?row[iDate]:null, iTime!=null?row[iTime]:null); if (!ts) continue
    const pieces = parseNum(iPieces!=null?row[iPieces]:null); if (!pieces || pieces<=0) continue
    const gate = Math.round(parseNum(iGate!=null?row[iGate]:null) ?? 0)
    records.push({ ts, gate, pieces,
      weightKg:            iWeight  != null ? parseNum(row[iWeight])  : undefined,
      weightPerPieceGrams: iWeightG != null ? parseNum(row[iWeightG]) : undefined,
      quality: iQuality != null && row[iQuality] != null ? String(row[iQuality]).trim() : undefined,
      calibre: normalizeCalibre(iCalibre != null ? row[iCalibre] : null),
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

// ─── inferGatesHistory (idéntico al reclassify-from-excel.js) ──────────────
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

// ─── Cache (compartido con reclassify-from-excel.js) ───────────────────────
const CACHE_FILE = path.join(__dirname, '.cache', 'reclassify-shifts.json')
function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return null
    const idx = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'))
    const dir = path.dirname(CACHE_FILE)
    const byShift = new Map()
    for (const { id, file } of idx) {
      const fp = path.join(dir, file)
      if (!fs.existsSync(fp)) return null
      byShift.set(id, JSON.parse(fs.readFileSync(fp, 'utf-8')))
    }
    return byShift
  } catch { return null }
}

// ─── Build full 12 gates desde el inferido (completar inactivas) ──────────
function buildFullGates(inferredGates) {
  const map = new Map(inferredGates.map(g => [g.gateNumber, g]))
  return Array.from({ length: 12 }, (_, i) => {
    const gateNumber = i + 1
    const inferred = map.get(gateNumber)
    if (inferred) return inferred
    return { gateNumber, assignedCalibre: '4-6 lb', assignedQuality: 'Premium', active: false }
  })
}

function syntheticDocId(shiftDocId) {
  return `synthetic-${shiftDocId.replace(/\s/g, '_')}`
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`⚙️  Seed synthetic snapshots — ${DRY_RUN ? 'DRY RUN' : 'REAL'}\n`)

  // 1) Cargar cache (rápido) o reparsear
  let byShift = loadCache()
  if (byShift) {
    console.log(`💾 Cargado de cache: ${byShift.size} turnos\n`)
  } else {
    console.log('📂 Sin cache, parseando Excel PP...')
    byShift = new Map()
    const ensure = (id) => {
      if (!byShift.has(id)) byShift.set(id, { pp: [], p0: [] })
      return byShift.get(id)
    }
    const ppFiles = walkXlsx(PP_DIR).filter(f => !isConsolidatedFile(f))
    console.log(`   ${ppFiles.length} archivos PP`)
    for (let i = 0; i < ppFiles.length; i++) {
      const f = ppFiles[i]
      const records = parseXlsx(f)
      for (const r of records) {
        const { shiftId, dateKey } = assignShift(r.ts)
        ensure(`${dateKey}__${shiftId}`).pp.push(r)
      }
      process.stdout.write(`\r   [${i+1}/${ppFiles.length}] ${path.basename(f).slice(0,50)}...  `)
    }
    console.log()
    // Dedupe
    for (const [, data] of byShift) data.pp = dedupeByKey(data.pp)
    console.log(`   📋 ${byShift.size} turnos en Excel\n`)
  }

  // 2) Cargar IDs de Firestore
  console.log('🔗 Cargando IDs de Firestore...')
  let q = db.collection('graderDailySummaries').orderBy('dateKey')
  if (ARG_START) q = q.where('dateKey', '>=', ARG_START)
  if (ARG_END)   q = q.where('dateKey', '<=', ARG_END)
  const snap = await q.get()
  let summaries = snap.docs.map(d => ({
    id: d.id,
    startAt: d.data().startAt,
    endAt: d.data().endAt,
  }))
  if (SHIFT_FILTER) summaries = summaries.filter(s => s.id === SHIFT_FILTER)
  console.log(`   ${summaries.length} turnos a evaluar\n`)

  // 3) Por cada turno: inferir y escribir si no existe synthetic
  let written = 0, skippedExisting = 0, skippedNoData = 0, errors = 0
  const start = Date.now()

  for (let i = 0; i < summaries.length; i++) {
    const { id, startAt } = summaries[i]
    try {
      const data = byShift.get(id)
      if (!data || data.pp.length === 0) {
        skippedNoData++
        continue
      }

      // Verificar si ya existe synthetic con id predecible
      const docId = syntheticDocId(id)
      const ref = db.collection('graderShifts').doc(id).collection('configHistory').doc(docId)
      const existing = await ref.get()
      if (existing.exists) {
        skippedExisting++
        continue
      }

      // Inferir
      const productive = data.pp.filter(r => r.gate >= 1 && r.gate <= 12)
      const windows    = inferGatesHistory(productive)
      if (windows.length === 0) {
        skippedNoData++
        continue
      }
      const firstWindow = windows[0]
      const fullGates   = buildFullGates(firstWindow.gates)

      // `at` estable: startAt del summary, fallback al primer ts del PP
      const at = startAt ?? firstWindow.startTs

      const reason = windows.length === 1
        ? 'Inferido del PP del turno (1 ventana detectada)'
        : `Inferido del PP del turno (${windows.length} ventanas detectadas — posibles cambios intra-turno no registrados)`

      const snapshot = {
        id: docId,
        shiftDocId: id,
        at,
        changedBy: { uid: 'system', name: 'Inferido por sistema' },
        reason,
        gates: fullGates,
        changes: [],
        synthetic: true,
      }

      if (DRY_RUN) {
        written++
      } else {
        await ref.set(snapshot)
        written++
      }
    } catch (e) {
      errors++
      console.error(`\n❌ ${id}: ${e.message}`)
    }

    process.stdout.write(`\r  ${i+1}/${summaries.length} — ✅${written} ⏭️${skippedExisting}existing ⚠️${skippedNoData}sinData ❌${errors} — ${((Date.now()-start)/1000).toFixed(1)}s  `)
  }

  console.log('\n')
  console.log(`✅ Escritos:           ${written}${DRY_RUN ? ' (dry-run)' : ''}`)
  console.log(`⏭️  Ya existían:        ${skippedExisting}`)
  console.log(`⚠️  Sin datos PP:       ${skippedNoData}`)
  console.log(`❌ Errores:            ${errors}`)
  console.log(`⏱️  Total: ${((Date.now() - start) / 1000).toFixed(1)}s`)
}

main().catch(e => { console.error(e); process.exit(1) })
