/**
 * Consolida todos los summaries del Grader con shiftId legacy (Turno A, Turno B,
 * Turno tarde, A, B) a los canónicos:
 *   - "Turno día":   07:00 – 19:00
 *   - "Turno noche": 19:00 – 07:00 (cruza medianoche)
 *
 * Estrategia:
 *  1. Listar docs con shiftId ∉ {'Turno día', 'Turno noche'}
 *  2. Para cada uno, inferir el turno canónico desde startAt (timestamp real)
 *  3. Si ya existe un doc canónico para ese dateKey+shift → mergear
 *  4. Si no existe → renombrar (borrar legacy + crear canónico)
 *  5. Reporta al final: cuántos mergeados, renombrados, skipped
 *
 * También detecta y elimina records corruptos (pointZeroPieces > totalPieces).
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(sa) })
}

const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const DRY_RUN = process.argv.includes('--dry-run')
if (DRY_RUN) console.log('🔍 DRY RUN — no se escribirá nada en Firestore\n')

const CANONICAL = new Set(['Turno día', 'Turno noche'])

/** Infiere el turno canónico según el timestamp startAt (o label como fallback) */
function inferCanonicalShift(summary) {
  if (summary.startAt) {
    const d = new Date(summary.startAt)
    if (!isNaN(d.getTime())) {
      const minutesOfDay = d.getUTCHours() * 60 + d.getUTCMinutes()
      // Turno día: 07:00 (420) - 19:00 (1140)
      if (minutesOfDay >= 420 && minutesOfDay < 1140) return 'Turno día'
      return 'Turno noche'
    }
  }
  // Fallback por label si no hay startAt válido
  const label = (summary.shiftId || '').toLowerCase()
  if (label.includes('día') || label === 'a' || label === 'turno a') return 'Turno día'
  return 'Turno noche' // default (noche, tarde, B, etc.)
}

/** Merges two summaries — suma counts, concatena causas, mantiene max duration */
function mergeSummaries(base, legacy) {
  const totalPieces = (base.totalPieces || 0) + (legacy.totalPieces || 0)
  const pointZeroPieces = (base.pointZeroPieces || 0) + (legacy.pointZeroPieces || 0)
  const pointZeroPct = totalPieces > 0
    ? Math.round((pointZeroPieces / totalPieces) * 10000) / 100
    : 0
  const totalWeightKg = (base.totalWeightKg || 0) + (legacy.totalWeightKg || 0) || undefined
  const durationMinutes = Math.max(base.durationMinutes || 0, legacy.durationMinutes || 0) || undefined

  // startAt = el más temprano, endAt = el más tarde
  const starts = [base.startAt, legacy.startAt].filter(Boolean).sort()
  const ends = [base.endAt, legacy.endAt].filter(Boolean).sort()
  const startAt = starts[0]
  const endAt = ends[ends.length - 1]

  // Mergear top causas P0 sumando piezas
  const causeMap = new Map()
  for (const c of [...(base.topP0Causes || []), ...(legacy.topP0Causes || [])]) {
    causeMap.set(c.error, (causeMap.get(c.error) || 0) + (c.pieces || 0))
  }
  const topP0Causes = Array.from(causeMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([error, pieces]) => ({
      error,
      pieces,
      pct: Math.round(pieces / (pointZeroPieces || 1) * 1000) / 10,
    }))

  // avgWeightGrams y productionRatePerHour se recalculan a partir de los nuevos totales
  const avgWeightGrams = (totalWeightKg && totalPieces > 0)
    ? Math.round(totalWeightKg * 1000 / totalPieces)
    : undefined
  const productionRatePerHour = (durationMinutes && durationMinutes > 0 && totalPieces > 0)
    ? Math.round(totalPieces / (durationMinutes / 60))
    : undefined

  return {
    ...base,
    totalPieces,
    pointZeroPieces,
    pointZeroPct,
    totalWeightKg,
    avgWeightGrams,
    productionRatePerHour,
    durationMinutes,
    startAt,
    endAt,
    topP0Causes,
    updatedAt: new Date().toISOString(),
  }
}

async function main() {
  console.log('=== MIGRACIÓN legacy shifts → canónicos ===\n')

  const snap = await db.collection('graderDailySummaries').get()
  const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  console.log(`Total summaries: ${all.length}`)

  // 1. Filtrar legacy
  const legacy = all.filter((s) => !CANONICAL.has(s.shiftId))
  console.log(`Legacy (no canónicos): ${legacy.length}`)

  // Agrupar por shiftId legacy para reporte
  const byShiftId = {}
  for (const s of legacy) {
    byShiftId[s.shiftId] = (byShiftId[s.shiftId] || 0) + 1
  }
  console.log('\nDesglose por shiftId legacy:')
  Object.entries(byShiftId)
    .sort((a, b) => b[1] - a[1])
    .forEach(([k, v]) => console.log(`  "${k}": ${v}`))

  // 2. Detectar records corruptos (pointZero > total)
  const corrupted = all.filter((s) => (s.pointZeroPieces || 0) > (s.totalPieces || 0))
  console.log(`\n=== CORRUPTOS (pointZero > total): ${corrupted.length} ===`)
  corrupted.forEach((c) => {
    console.log(`  ${c.id} | total=${c.totalPieces} p0=${c.pointZeroPieces} (${c.pointZeroPct}%)`)
  })

  // 3. Procesar cada legacy
  const stats = { merged: 0, renamed: 0, deletedCorrupted: 0, skipped: 0 }
  const batch = db.batch()
  let batchCount = 0

  const flushBatch = async () => {
    if (batchCount === 0) return
    if (!DRY_RUN) await batch.commit()
    batchCount = 0
  }

  for (const s of legacy) {
    // Si está corrupto, borrar directo
    if ((s.pointZeroPieces || 0) > (s.totalPieces || 0)) {
      console.log(`  [DELETE corrupted] ${s.id}`)
      batch.delete(db.collection('graderDailySummaries').doc(s.id))
      batchCount++
      stats.deletedCorrupted++
      continue
    }

    const canonicalShift = inferCanonicalShift(s)
    const canonicalId = `${s.dateKey}__${canonicalShift}`

    // Buscar doc canónico existente
    const canonicalDoc = all.find((x) => x.id === canonicalId && CANONICAL.has(x.shiftId))

    if (canonicalDoc) {
      // MERGE: sumar al existente
      const merged = mergeSummaries(canonicalDoc, s)
      console.log(`  [MERGE] ${s.id} + ${canonicalId}`)
      console.log(`    base: ${canonicalDoc.totalPieces} pz, legacy: ${s.totalPieces} pz → ${merged.totalPieces} pz`)
      batch.set(db.collection('graderDailySummaries').doc(canonicalId), merged, { merge: true })
      batch.delete(db.collection('graderDailySummaries').doc(s.id))
      batchCount += 2
      stats.merged++
      // Actualizar el cache all para que siguientes iteraciones vean el merge
      canonicalDoc.totalPieces = merged.totalPieces
      canonicalDoc.pointZeroPieces = merged.pointZeroPieces
    } else {
      // RENAME: crear nuevo canónico + borrar legacy
      const renamed = {
        ...s,
        id: canonicalId,
        shiftId: canonicalShift,
        updatedAt: new Date().toISOString(),
      }
      console.log(`  [RENAME] ${s.id} → ${canonicalId} (${canonicalShift})`)
      batch.set(db.collection('graderDailySummaries').doc(canonicalId), renamed)
      batch.delete(db.collection('graderDailySummaries').doc(s.id))
      batchCount += 2
      stats.renamed++
      // Marcar como canónico en cache para futuros merges
      all.push({ ...renamed, id: canonicalId })
    }

    // Firestore batch max = 500 operations
    if (batchCount >= 400) {
      await flushBatch()
      console.log('  [batch flushed]')
    }
  }

  await flushBatch()

  // 4. También borrar los records canónicos corruptos (no solo legacy)
  const canonicalCorrupted = all.filter(
    (s) => CANONICAL.has(s.shiftId) && (s.pointZeroPieces || 0) > (s.totalPieces || 0),
  )
  if (canonicalCorrupted.length > 0) {
    console.log(`\n=== CORRUPTOS canónicos (eliminar): ${canonicalCorrupted.length} ===`)
    const batch2 = db.batch()
    for (const c of canonicalCorrupted) {
      console.log(`  [DELETE] ${c.id} | total=${c.totalPieces} p0=${c.pointZeroPieces} (${c.pointZeroPct}%)`)
      batch2.delete(db.collection('graderDailySummaries').doc(c.id))
      stats.deletedCorrupted++
    }
    if (!DRY_RUN) await batch2.commit()
  }

  console.log('\n=== RESUMEN ===')
  console.log(`  Merged (sumados al canónico):       ${stats.merged}`)
  console.log(`  Renamed (renombrados a canónico):   ${stats.renamed}`)
  console.log(`  Deleted corrupted (p0 > total):     ${stats.deletedCorrupted}`)
  console.log(`  Skipped:                            ${stats.skipped}`)
  console.log(`  Total procesados:                   ${stats.merged + stats.renamed + stats.deletedCorrupted}`)
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
