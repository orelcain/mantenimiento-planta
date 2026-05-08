/**
 * Migrate orphan Yal summaries from chonchi (default) to yal-eviscerado.
 *
 * Cuando se sube un Excel de Yal sin el `?linea=yal-eviscerado` en la URL,
 * el wizard cae a la planta default (chonchi) y guarda el summary con id
 * `2026-XX-XX__Turno X` en lugar de `yal-eviscerado__2026-XX-XX__Turno X`.
 * El TurnoPage de Yal busca con prefix y nunca lo encuentra.
 *
 * Este script identifica esos huérfanos por la forma del shiftId
 * (`Turno 1|2|3` → Yal; `Turno día|noche` → Chonchi) y los migra al doc
 * con prefix correcto, copiando las sub-colecciones `meta/*`.
 *
 * Uso:
 *   node scripts/migrate-orphan-yal-summaries.js              # dry-run (default)
 *   node scripts/migrate-orphan-yal-summaries.js --apply      # ejecuta migración
 *
 * Lo que NO hace:
 * - No toca `graderShifts/{id}/...` (esa colección NO usa prefix por diseño).
 * - No mueve `pieceRecords` separadamente — los lee TurnoPage por
 *   `effectiveSummaryId` desde meta/timeline.
 *
 * Idempotente: si el destino ya existe, omite ese doc (no sobrescribe).
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const APPLY = process.argv.includes('--apply')
const YAL_PREFIX = 'yal-eviscerado'
const ORPHAN_ID_RE = /^\d{4}-\d{2}-\d{2}__Turno [123]$/   // YYYY-MM-DD__Turno 1|2|3 SIN prefix

const META_SUBCOLLECTIONS = ['timeline', 'pauses', 'marelHg']

async function copySubcollections(srcId, dstId) {
  let copiedDocs = 0
  for (const sub of META_SUBCOLLECTIONS) {
    const srcRef = db.collection('graderDailySummaries').doc(srcId).collection('meta').doc(sub)
    const srcSnap = await srcRef.get()
    if (!srcSnap.exists) continue
    const dstRef = db.collection('graderDailySummaries').doc(dstId).collection('meta').doc(sub)
    if (APPLY) {
      await dstRef.set(srcSnap.data(), { merge: false })
    }
    copiedDocs++
  }
  return copiedDocs
}

async function deleteOrphan(srcId) {
  // Borrar primero las sub-colecciones meta/* del huérfano, luego el doc.
  for (const sub of META_SUBCOLLECTIONS) {
    const ref = db.collection('graderDailySummaries').doc(srcId).collection('meta').doc(sub)
    if (APPLY) await ref.delete()
  }
  if (APPLY) await db.collection('graderDailySummaries').doc(srcId).delete()
}

async function main() {
  console.log(`[migrate-orphan-yal] mode=${APPLY ? 'APPLY' : 'DRY-RUN'}\n`)

  const snap = await db.collection('graderDailySummaries').get()
  const orphans = []

  for (const doc of snap.docs) {
    if (!ORPHAN_ID_RE.test(doc.id)) continue
    orphans.push({ id: doc.id, data: doc.data() })
  }

  if (orphans.length === 0) {
    console.log('No se encontraron huérfanos. Todo OK.\n')
    return
  }

  console.log(`Encontrados ${orphans.length} huérfanos (formato Yal sin prefix):\n`)
  console.log('| Source ID                       | totalPieces | hasGate0 | Destino                                        |')
  console.log('|---------------------------------|-------------|----------|------------------------------------------------|')

  let migrated = 0
  let skipped = 0

  for (const { id, data } of orphans) {
    const dstId = `${YAL_PREFIX}__${id}`
    const dstSnap = await db.collection('graderDailySummaries').doc(dstId).get()

    if (dstSnap.exists) {
      console.log(`| ${id.padEnd(31)} | ${String(data.totalPieces || 0).padStart(11)} | ${(data.hasGate0Data ? 'sí' : 'no').padEnd(8)} | YA EXISTE → omitir                            |`)
      skipped++
      continue
    }

    if (APPLY) {
      await db.collection('graderDailySummaries').doc(dstId).set({ ...data, plantLineId: YAL_PREFIX })
      const subCount = await copySubcollections(id, dstId)
      await deleteOrphan(id)
      console.log(`| ${id.padEnd(31)} | ${String(data.totalPieces || 0).padStart(11)} | ${(data.hasGate0Data ? 'sí' : 'no').padEnd(8)} | ${dstId.padEnd(46)} (+${subCount} meta) |`)
    } else {
      const subCount = await copySubcollections(id, dstId)  // dry-run cuenta pero no escribe
      console.log(`| ${id.padEnd(31)} | ${String(data.totalPieces || 0).padStart(11)} | ${(data.hasGate0Data ? 'sí' : 'no').padEnd(8)} | ${dstId.padEnd(46)} (+${subCount} meta) |`)
    }
    migrated++
  }

  console.log()
  console.log(`Resumen: ${migrated} ${APPLY ? 'migrados' : 'a migrar'}, ${skipped} omitidos (destino ya existe).`)
  if (!APPLY) {
    console.log(`\n→ Para aplicar la migración, ejecutá:`)
    console.log(`  node scripts/migrate-orphan-yal-summaries.js --apply\n`)
  } else {
    console.log(`\n✅ Migración completa. Refrescá la PWA para ver los turnos en la pestaña Yal.\n`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
