/**
 * Backfill: computa `timelineAggregates` (buckets por minuto) para cada
 * `graderDailySummaries/{id}` que todavía no los tenga, leyendo los
 * registros crudos de la subcollection `pieceRecords/`.
 *
 * Los aggregates se guardan en la SUB-COLLECTION `meta/timeline` (no en el
 * doc del summary), para no inflar las queries por rango del calendario y la
 * vista de período. Path destino:
 *   graderDailySummaries/{summaryId}/meta/timeline
 *
 * El código es un port plain-JS de `computeTimelineAggregates()` del segmenter
 * TS (apps/pwa/src/services/grader/graderSegmenter.ts). Debe mantenerse en sync
 * hasta que exista un test de paridad entre ambas implementaciones.
 *
 * Idempotente: por default skippea summaries que ya tienen el doc
 * `meta/timeline`. Pasar `--force` para re-computar todos.
 *
 * Uso:
 *   node scripts/backfill-timeline-aggregates.js             # run real
 *   node scripts/backfill-timeline-aggregates.js --dry-run   # solo reporta
 *   node scripts/backfill-timeline-aggregates.js --force     # re-computa todos
 */
const admin = require('firebase-admin')
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
if (FORCE) console.log('⚡ FORCE — re-computando aggregates aunque ya existan\n')

// ── Helpers ──────────────────────────────────────────────────────────────

function r(v, dec) {
  const f = 10 ** dec
  return Math.round(v * f) / f
}

// ── Port JS del computeTimelineAggregates TS ─────────────────────────────

/**
 * Port de apps/pwa/src/services/grader/graderSegmenter.ts::computeTimelineAggregates
 *
 * @param {Array} pieceRecords — records de la subcoleccion pieceRecords
 *   (estructura: { ts, gate, pieces, weightKg?, weightPerPieceGrams?, quality?,
 *                  calibre?, error?, lot?, dedupeKey })
 * @param {Array} gate0Records — vacío en el backfill (el bulk upload solo
 *   cargó PIEZA_PIEZA, no PUERTA_0 dedicado)
 */
function computeTimelineAggregates(pieceRecords, gate0Records) {
  const buckets = new Map()

  const truncateToMinute = (ts) => ts.slice(0, 16) + ':00.000Z'

  const getBucket = (tsMin) => {
    let b = buckets.get(tsMin)
    if (!b) {
      b = {
        pieces: 0,
        p0Pieces: 0,
        weightKgSum: 0,
        weightCount: 0,
        weights: [],
        errorCounts: new Map(),
        gateCounts: new Map(),
        calibres: new Map(),
        lots: new Map(),
      }
      buckets.set(tsMin, b)
    }
    return b
  }

  // ── PIEZA_PIEZA ─────────────────────────────────────────────────────────
  for (const rec of pieceRecords) {
    if (!rec.ts) continue
    const tsMin = truncateToMinute(rec.ts)
    const b = getBucket(tsMin)
    b.pieces += rec.pieces
    if (rec.gate === 0) {
      b.p0Pieces += rec.pieces
      if (rec.error) {
        b.errorCounts.set(rec.error, (b.errorCounts.get(rec.error) ?? 0) + rec.pieces)
      }
    } else {
      if (rec.weightKg != null && rec.weightKg > 0) {
        b.weightKgSum += rec.weightKg
      }
      let wGrams = rec.weightPerPieceGrams
      if ((wGrams == null || wGrams <= 0) && rec.weightKg != null && rec.weightKg > 0) {
        wGrams = rec.pieces === 1 ? rec.weightKg * 1000 : (rec.weightKg * 1000) / rec.pieces
      }
      if (wGrams != null && wGrams > 200 && wGrams < 8000) {
        b.weights.push(wGrams)
        b.weightCount += rec.pieces
      }
      b.gateCounts.set(rec.gate, (b.gateCounts.get(rec.gate) ?? 0) + rec.pieces)
    }
    if (rec.calibre) {
      b.calibres.set(rec.calibre, (b.calibres.get(rec.calibre) ?? 0) + rec.pieces)
    }
    if (rec.lot) {
      b.lots.set(rec.lot, (b.lots.get(rec.lot) ?? 0) + rec.pieces)
    }
  }

  // ── PUERTA_0 dedicado (override del minuto) ─────────────────────────────
  if (gate0Records.length > 0) {
    const touched = new Set()
    for (const rec of gate0Records) {
      if (!rec.ts) continue
      touched.add(truncateToMinute(rec.ts))
    }
    for (const tsMin of touched) {
      const b = buckets.get(tsMin)
      if (b) {
        b.p0Pieces = 0
        b.errorCounts.clear()
      }
    }
    for (const rec of gate0Records) {
      if (!rec.ts) continue
      const tsMin = truncateToMinute(rec.ts)
      const b = getBucket(tsMin)
      b.p0Pieces += rec.pieces
      if (rec.error) {
        b.errorCounts.set(rec.error, (b.errorCounts.get(rec.error) ?? 0) + rec.pieces)
      }
      if (rec.calibre) {
        b.calibres.set(rec.calibre, (b.calibres.get(rec.calibre) ?? 0) + rec.pieces)
      }
      if (rec.lot) {
        b.lots.set(rec.lot, (b.lots.get(rec.lot) ?? 0) + rec.pieces)
      }
    }
  }

  // ── Convertir a TimelineBucket[] ordenado ───────────────────────────────
  const result = Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([tsMin, b]) => {
      const bucket = {
        tsMin,
        pieces: b.pieces,
        p0Pieces: b.p0Pieces,
      }

      if (b.weightKgSum > 0) bucket.weightKg = r(b.weightKgSum, 3)
      if (b.weightCount > 0) bucket.weightCount = b.weightCount

      if (b.weights.length > 0) {
        const sorted = [...b.weights].sort((x, y) => x - y)
        bucket.weightMinGrams = Math.round(sorted[0])
        bucket.weightMaxGrams = Math.round(sorted[sorted.length - 1])
        bucket.weightP50Grams = Math.round(sorted[Math.floor(sorted.length / 2)])
      }

      if (b.errorCounts.size > 0) {
        const ec = {}
        for (const [k, v] of b.errorCounts) ec[k] = v
        bucket.errorCounts = ec
      }

      if (b.gateCounts.size > 0) {
        const gc = {}
        for (const [k, v] of b.gateCounts) gc[String(k)] = v
        bucket.gateCounts = gc
      }

      let maxCalPieces = 0
      for (const [k, v] of b.calibres) {
        if (v > maxCalPieces) { maxCalPieces = v; bucket.dominantCalibre = k }
      }

      let maxLotPieces = 0
      for (const [k, v] of b.lots) {
        if (v > maxLotPieces) { maxLotPieces = v; bucket.lot = k }
      }

      return bucket
    })

  return result
}

// ── Main ─────────────────────────────────────────────────────────────────

// Debe coincidir con TIMELINE_SCHEMA_VERSION en graderDailySummary.service.ts
const TIMELINE_SCHEMA_VERSION = 1

async function main() {
  console.log('=== BACKFILL: timelineAggregates → graderDailySummaries/{id}/meta/timeline ===\n')

  const summariesSnap = await db.collection('graderDailySummaries').get()
  console.log(`Total summaries: ${summariesSnap.size}\n`)

  let processed = 0
  let skippedExisting = 0
  let skippedEmpty = 0
  let failed = 0
  let summaryIdx = 0
  let totalBuckets = 0

  for (const summaryDoc of summariesSnap.docs) {
    summaryIdx++
    const summary = summaryDoc.data()
    const id = summary.id || summaryDoc.id

    // Path de la sub-collection: graderDailySummaries/{id}/meta/timeline
    const metaTimelineRef = summaryDoc.ref.collection('meta').doc('timeline')

    // Skip si ya existe el doc meta/timeline (a menos que --force)
    if (!FORCE) {
      const existingMeta = await metaTimelineRef.get()
      if (existingMeta.exists) {
        const existingBuckets = existingMeta.data()?.buckets
        if (Array.isArray(existingBuckets) && existingBuckets.length > 0) {
          skippedExisting++
          if (summaryIdx % 50 === 0) {
            console.log(`  [${summaryIdx}/${summariesSnap.size}] progreso: ${processed} procesados, ${skippedExisting} ya tenían`)
          }
          continue
        }
      }
    }

    try {
      // Leer pieceRecords de la subcollection
      const prSnap = await summaryDoc.ref.collection('pieceRecords').get()
      if (prSnap.empty) {
        console.log(`  [${summaryIdx}/${summariesSnap.size}] ${id}: 0 pieceRecords → skip`)
        skippedEmpty++
        continue
      }

      const records = prSnap.docs.map((d) => d.data())
      // El bulk upload solo carga PIEZA_PIEZA (no PUERTA_0 dedicado), así que
      // gate0Records queda vacío y la función usa los gate=0 dentro de PP.
      const aggregates = computeTimelineAggregates(records, [])

      if (aggregates.length === 0) {
        console.log(`  [${summaryIdx}/${summariesSnap.size}] ${id}: ${records.length} records → 0 buckets (skip)`)
        skippedEmpty++
        continue
      }

      const jsonSize = JSON.stringify(aggregates).length
      const jsonKb = (jsonSize / 1024).toFixed(1)
      console.log(`  [${summaryIdx}/${summariesSnap.size}] ${id}: ${records.length.toLocaleString()} records → ${aggregates.length} buckets (${jsonKb} KB)${DRY_RUN ? ' [DRY RUN]' : ''}`)

      if (!DRY_RUN) {
        await metaTimelineRef.set({
          buckets: aggregates,
          updatedAt: new Date().toISOString(),
          schemaVersion: TIMELINE_SCHEMA_VERSION,
        })
      }
      processed++
      totalBuckets += aggregates.length
    } catch (err) {
      console.error(`  [${summaryIdx}/${summariesSnap.size}] ${id}: ❌ ERROR - ${err.message}`)
      failed++
    }
  }

  console.log('\n=== RESUMEN ===')
  console.log(`Total summaries:        ${summariesSnap.size}`)
  console.log(`Procesados (nuevos):    ${processed}`)
  console.log(`Skipped (ya existían):  ${skippedExisting}`)
  console.log(`Skipped (sin records):  ${skippedEmpty}`)
  console.log(`Failed:                 ${failed}`)
  console.log(`Total buckets escritos: ${totalBuckets.toLocaleString()}`)
  if (DRY_RUN) console.log('\n(DRY RUN — nada fue escrito)')
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
