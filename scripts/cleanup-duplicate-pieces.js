/**
 * Cleanup: borra docs duplicados de `pieceRecords` en summaries afectados
 * por el bug de duplicación pre-v3.9.0 (handleSaveToCalendar concatenaba
 * pieceRecords + gate0Records → cada gate=0 quedaba guardado 2 veces).
 *
 * Estrategia: para cada summary, agrupa pieceRecords por (ts, gate, error)
 * — esa tripla identifica la misma pieza gate=0 entre los 2 saves. Se queda
 * con uno solo (el más reciente por id) y borra el resto.
 *
 * Solo toca summaries con prefix `yal-eviscerado__` (los afectados).
 *
 * Uso:
 *   node scripts/cleanup-duplicate-pieces.js              # dry-run
 *   node scripts/cleanup-duplicate-pieces.js --apply      # ejecuta
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const APPLY = process.argv.includes('--apply')

async function cleanupSummary(summaryId) {
  const recsRef = db.collection('graderDailySummaries').doc(summaryId).collection('pieceRecords')
  const snap = await recsRef.get()
  if (snap.empty) return { total: 0, removed: 0 }

  // Agrupar por dedupeKey si existe, sino por (ts, gate, pieces, error)
  const seen = new Map() // key → docId conservado (primer match)
  const toDelete = []

  for (const doc of snap.docs) {
    const d = doc.data()
    const key = d.dedupeKey
      || `${d.ts}__${d.gate}__${d.pieces}__${d.error || ''}`
    if (seen.has(key)) {
      toDelete.push(doc.id)
    } else {
      seen.set(key, doc.id)
    }
  }

  if (APPLY && toDelete.length > 0) {
    // Batches de 500
    const batches = []
    for (let i = 0; i < toDelete.length; i += 500) {
      const batch = db.batch()
      for (const id of toDelete.slice(i, i + 500)) {
        batch.delete(recsRef.doc(id))
      }
      batches.push(batch.commit())
    }
    await Promise.all(batches)
  }

  return { total: snap.size, removed: toDelete.length }
}

async function main() {
  console.log(`[cleanup-duplicates] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

  const snap = await db.collection('graderDailySummaries').get()
  const yalSummaries = snap.docs.filter(d => d.id.startsWith('yal-eviscerado__'))

  console.log(`Summaries Yal a revisar: ${yalSummaries.length}\n`)
  console.log('| Summary ID                                          | total | duplicados |')
  console.log('|-----------------------------------------------------|-------|------------|')

  let totalDocs = 0
  let totalRemoved = 0

  for (const doc of yalSummaries) {
    const r = await cleanupSummary(doc.id)
    totalDocs += r.total
    totalRemoved += r.removed
    console.log(`| ${doc.id.padEnd(51)} | ${String(r.total).padStart(5)} | ${String(r.removed).padStart(10)} |`)
  }

  console.log()
  console.log(`Total docs: ${totalDocs}`)
  console.log(`Duplicados ${APPLY ? 'borrados' : 'a borrar'}: ${totalRemoved}`)
  console.log(`Quedarán: ${totalDocs - totalRemoved}`)
  if (!APPLY && totalRemoved > 0) {
    console.log(`\n→ Aplicar: node scripts/cleanup-duplicate-pieces.js --apply\n`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
