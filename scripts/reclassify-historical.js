/**
 * Reclasificador histórico de graderDailySummaries — versión server-side.
 *
 * Equivalente al botón "Reclasificar" de PeriodoPage pero corriendo con
 * Firebase Admin SDK: sin latencia de red browser→Firestore, sin throttling.
 *
 * Lógica:
 *   1. Lee todos los graderDailySummaries (o un rango si se pasan flags)
 *   2. Por cada turno, descarga pieceRecords de la subcollection
 *   3. Infiere config de gates por ventanas temporales (30 min)
 *   4. Reclasifica los gate0Records con las 9 causas Matrix
 *   5. Actualiza topP0Causes + reclassifiedAt en el summary
 *
 * Flags:
 *   --dry-run         solo reporta, no escribe
 *   --start YYYY-MM-DD  desde esta fecha (inclusive)
 *   --end   YYYY-MM-DD  hasta esta fecha (inclusive)
 *   --batch N         turnos en paralelo (default 10)
 *
 * Uso:
 *   node scripts/reclassify-historical.js
 *   node scripts/reclassify-historical.js --start 2025-07-01 --end 2025-12-31
 *   node scripts/reclassify-historical.js --dry-run
 */

const admin = require('firebase-admin')
const sa    = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) })
}
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

// ─── Flags ────────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run')
const SKIP_DONE = process.argv.includes('--skip-done')  // saltear turnos con causas ya canónicas
const BATCH     = parseInt(process.argv[process.argv.indexOf('--batch') + 1] || '15', 10) || 15
const startIdx = process.argv.indexOf('--start')
const endIdx   = process.argv.indexOf('--end')
const argStart = startIdx !== -1 ? process.argv[startIdx + 1] : null
const argEnd   = endIdx   !== -1 ? process.argv[endIdx   + 1] : null

if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada\n')

// ─── Calibre → rangos de peso (g) — espejo de CALIBRE_WEIGHT_RANGES del front ─
const CALIBRE_WEIGHT_RANGES = {
  '2-4 lb':   { minG:  907, maxG: 1814 },
  '4-6 lb':   { minG: 1814, maxG: 2722 },
  '6-8 lb':   { minG: 2722, maxG: 3629 },
  '8-10 lb':  { minG: 3629, maxG: 4536 },
  '10-12 lb': { minG: 4536, maxG: 5443 },
  '12-14 lb': { minG: 5443, maxG: 6350 },
  '14-16 lb': { minG: 6350, maxG: 7257 },
  '16+ lb':   { minG: 7257, maxG: Infinity },
}

// ─── classifyRecordToMatrix — espejo de graderAnalytics.ts ────────────────────
function classifyRecordToMatrix(record, activeGates, weightRanges) {
  if (!activeGates || activeGates.length === 0) return 'fuera_de_limites'

  const weightG = record.weightPerPieceGrams != null
    ? record.weightPerPieceGrams
    : record.weightKg != null
      ? record.weightKg * 1000
      : null

  // Sin peso — revisar por calibre/calidad
  if (weightG == null) {
    if (!record.calibre) return 'fuera_de_limites'
    const matchCalibre = activeGates.find(g => g.assignedCalibre === record.calibre)
    if (!matchCalibre) return 'fuera_de_calibre'
    if (record.quality && matchCalibre.assignedQuality !== record.quality) return 'fuera_de_calidad'
    if (record.conservation != null && record.conservation === false) return 'fuera_de_conservacion'
    if (record.product && record.product !== matchCalibre.assignedProduct) return 'fuera_de_producto'
    return 'fuera_de_limites'
  }

  // Con peso — verificar si está dentro del rango del calibre asignado al gate correcto
  const gateForWeight = activeGates.find(g => {
    const range = weightRanges[g.assignedCalibre]
    return range && weightG >= range.minG && weightG < range.maxG
  })

  if (!gateForWeight) return 'fuera_de_limites'

  // Verificar calidad
  if (record.quality && gateForWeight.assignedQuality !== record.quality) return 'fuera_de_calidad'
  if (record.conservation != null && record.conservation === false) return 'fuera_de_conservacion'
  if (record.product && record.product !== gateForWeight.assignedProduct) return 'fuera_de_producto'

  return 'fuera_de_limites'
}

// ─── inferGatesHistory — espejo de graderReclassifier.ts ─────────────────────
function inferGatesHistory(pieceRecords, windowMinutes = 30, dominanceThreshold = 0.75, minPieces = 10) {
  const productive = pieceRecords.filter(r => r.gate >= 1 && r.gate <= 12)
  if (productive.length === 0) return []

  const sorted = [...productive].sort((a, b) => a.ts.localeCompare(b.ts))
  const windowMs = windowMinutes * 60_000

  // Dividir en ventanas
  const windows = []
  let current = [sorted[0]]
  let windowStart = new Date(sorted[0].ts).getTime()
  for (let i = 1; i < sorted.length; i++) {
    const t = new Date(sorted[i].ts).getTime()
    if (t - windowStart > windowMs) {
      windows.push(current)
      current = []
      windowStart = t
    }
    current.push(sorted[i])
  }
  if (current.length > 0) windows.push(current)

  const result = []
  for (const w of windows) {
    if (w.length < minPieces) continue
    const gates = []
    for (let gateNum = 1; gateNum <= 12; gateNum++) {
      const forGate = w.filter(p => p.gate === gateNum)
      if (forGate.length < Math.min(minPieces, 3)) continue
      const combos = new Map()
      for (const p of forGate) {
        const key = `${p.calibre ?? 'Other'}|${p.quality ?? 'Unknown'}`
        combos.set(key, (combos.get(key) ?? 0) + 1)
      }
      const entries = [...combos.entries()].sort((a, b) => b[1] - a[1])
      const top = entries[0]
      if (!top) continue
      const [calibre, quality] = top[0].split('|')
      gates.push({ gateNumber: gateNum, assignedCalibre: calibre ?? 'Other', assignedQuality: quality ?? 'Unknown', active: true })
    }
    if (gates.length === 0) continue
    result.push({ startTs: w[0].ts, endTs: w[w.length - 1].ts, gates })
  }
  return result
}

// Las 9 causas canónicas — si topP0Causes ya las tiene, el turno está listo
const CANONICAL = new Set([
  'fuera_de_limites','no_leido_fotocelula','too_close_too_long','puerta_no_preparada',
  'fuera_de_calibre','fuera_de_calidad','fuera_de_conservacion','fuera_de_producto','otro',
])

// ─── reclassifyShift — lógica principal por turno ────────────────────────────
async function reclassifyShift(summaryId) {
  // 0) Skip-done: si ya tiene causas canónicas, no descargar pieceRecords
  if (SKIP_DONE) {
    const summaryDoc = await db.collection('graderDailySummaries').doc(summaryId).get()
    const existing = summaryDoc.data()?.topP0Causes
    if (Array.isArray(existing) && existing.length > 0 && CANONICAL.has(existing[0]?.error)) {
      return { summaryId, status: 'skip', reason: 'ya reclasificado' }
    }
  }

  // 1) Leer pieceRecords
  const snap = await db
    .collection('graderDailySummaries')
    .doc(summaryId)
    .collection('pieceRecords')
    .orderBy('ts')
    .get()

  if (snap.empty) {
    return { summaryId, status: 'skip', reason: 'sin pieceRecords' }
  }

  const allRecords = snap.docs.map(d => d.data())
  const g0Records  = allRecords.filter(r => r.gate === 0)

  if (g0Records.length === 0) {
    return { summaryId, status: 'skip', reason: 'sin gate0Records' }
  }

  // 2) Inferir config de gates por ventanas temporales (solo en memoria)
  const windows = inferGatesHistory(allRecords)

  const getGatesAtTs = (ts) => {
    const eligible = windows.filter(w => w.startTs <= ts)
    const last = eligible[eligible.length - 1]
    return last?.gates ?? []
  }

  // 3) Clasificar cada gate0Record
  const causeCount = new Map()
  let totalG0 = 0
  for (const r of g0Records) {
    const gates = getGatesAtTs(r.ts).filter(g => g.active)
    const cause = classifyRecordToMatrix(r, gates, CALIBRE_WEIGHT_RANGES)
    causeCount.set(cause, (causeCount.get(cause) ?? 0) + r.pieces)
    totalG0 += r.pieces
  }

  // 4) Construir topP0Causes
  const topP0Causes = [...causeCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: totalG0 > 0 ? +((pieces / totalG0) * 100).toFixed(2) : 0,
    }))

  const confidence = windows.length > 0 ? 'medium' : 'low'

  // 5) Actualizar summary
  if (!DRY_RUN) {
    await db.collection('graderDailySummaries').doc(summaryId).update({
      topP0Causes,
      reclassifiedAt: new Date().toISOString(),
    })
  }

  return { summaryId, status: 'ok', confidence, windows: windows.length, g0: g0Records.length, topP0Causes }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`⚙️  Reclasificador histórico Grader — batch=${BATCH}${DRY_RUN ? ' (DRY RUN)' : ''}\n`)

  // Cargar todos los summaries (o rango)
  let query = db.collection('graderDailySummaries').orderBy('dateKey')
  if (argStart) query = query.where('dateKey', '>=', argStart)
  if (argEnd)   query = query.where('dateKey', '<=', argEnd)

  const allSnap = await query.get()
  const summaries = allSnap.docs.map(d => d.id)
  console.log(`📋 ${summaries.length} turnos encontrados${argStart ? ` (${argStart} → ${argEnd ?? 'hoy'})` : ''}\n`)

  if (summaries.length === 0) { console.log('Nada que procesar.'); return }

  // Stats
  let ok = 0, skipped = 0, errors = 0
  const errorList = []
  const start = Date.now()

  for (let i = 0; i < summaries.length; i += BATCH) {
    const slice = summaries.slice(i, i + BATCH)
    const batchResults = await Promise.all(
      slice.map(id => reclassifyShift(id).catch(err => ({ summaryId: id, status: 'error', reason: err.message })))
    )

    for (const r of batchResults) {
      if (r.status === 'ok')    { ok++ }
      else if (r.status === 'skip') { skipped++ }
      else { errors++; errorList.push(r) }
    }

    const done = Math.min(i + BATCH, summaries.length)
    const elapsed = ((Date.now() - start) / 1000).toFixed(1)
    const eta = done < summaries.length
      ? `ETA ~${((Date.now() - start) / done * (summaries.length - done) / 1000).toFixed(0)}s`
      : 'listo'
    process.stdout.write(`\r  ${done}/${summaries.length} turnos — ✅${ok} ⏭️${skipped} ❌${errors} — ${elapsed}s — ${eta}  `)
  }

  console.log('\n')
  console.log(`✅ ${ok} reclasificados`)
  console.log(`⏭️  ${skipped} sin datos (sin pieceRecords o sin P0)`)
  console.log(`❌ ${errors} errores`)
  if (errorList.length > 0) {
    console.log('\nErrores:')
    for (const e of errorList) console.log(`  ${e.summaryId}: ${e.reason}`)
  }
  console.log(`\n⏱️  Total: ${((Date.now() - start) / 1000).toFixed(1)}s`)
}

main().catch(err => { console.error(err); process.exit(1) })
