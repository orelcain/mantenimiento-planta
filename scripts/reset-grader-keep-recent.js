/**
 * Reset Grader: borra TODOS los graderDailySummaries (con sus subcolecciones)
 * y los docs Shoplogix asociados cuyo dateKey sea < CUTOFF.
 *
 * Uso típico (mantener solo últimas 2 semanas Feb 2026):
 *   node scripts/reset-grader-keep-recent.js --cutoff=2026-02-15 --dry-run
 *   node scripts/reset-grader-keep-recent.js --cutoff=2026-02-15
 *
 * Flags:
 *   --cutoff=YYYY-MM-DD   Fecha mínima a CONSERVAR. Todo dateKey < cutoff se borra.
 *                         (requerido)
 *   --dry-run             Solo muestra qué borraría, no toca nada.
 *
 * Subcolecciones borradas por cada summary:
 *   - pieceRecords         (la grande)
 *   - meta                 (pauses, etc.)
 *   - configChanges        (cambios de gate)
 *   - cualquier otra subcolección detectada (recursivo)
 *
 * Idempotente: si se interrumpe, se relanza y borra lo que quede.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()
db.settings({ ignoreUndefinedProperties: true })

const CUTOFF = (process.argv.find(a => a.startsWith('--cutoff=')) || '').replace('--cutoff=', '') || null
const DRY_RUN = process.argv.includes('--dry-run')

if (!CUTOFF || !/^\d{4}-\d{2}-\d{2}$/.test(CUTOFF)) {
  console.error('Falta --cutoff=YYYY-MM-DD (todo dateKey < cutoff se borrará)')
  process.exit(1)
}

if (DRY_RUN) console.log('🔍 DRY RUN — nada será borrado\n')
console.log(`🗓  CUTOFF: borra todo dateKey < ${CUTOFF}\n`)

const BATCH_SIZE = 500

async function deleteCollectionRecursive(colRef, label) {
  let totalDeleted = 0
  while (true) {
    const snap = await colRef.limit(BATCH_SIZE).get()
    if (snap.empty) break
    if (DRY_RUN) {
      totalDeleted += snap.size
      // En dry-run sólo contamos, no reiteramos sobre lo mismo
      // → contamos toda la colección con count() y salimos
      const cnt = await colRef.count().get()
      return cnt.data().count
    }
    const batch = db.batch()
    snap.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    totalDeleted += snap.size
    if (totalDeleted % 5000 === 0) console.log(`    ${label}: ${totalDeleted}...`)
  }
  return totalDeleted
}

async function deleteSummaryAndSubcollections(summaryDoc) {
  const ref = summaryDoc.ref
  // Listar subcolecciones (Admin SDK only)
  const subs = await ref.listCollections()
  let subDeleted = 0
  for (const sub of subs) {
    const cnt = await deleteCollectionRecursive(sub, `  ${ref.id}/${sub.id}`)
    subDeleted += cnt
  }
  if (!DRY_RUN) await ref.delete()
  return { subs: subs.length, subDeleted }
}

async function main() {
  // 1. Cargar todos los summaries
  const allSnap = await db.collection('graderDailySummaries').get()
  const toDelete = allSnap.docs.filter((d) => {
    const k = d.data().dateKey || d.id.split('__')[0]
    return k < CUTOFF
  })
  const toKeep = allSnap.docs.length - toDelete.length

  console.log(`graderDailySummaries totales:  ${allSnap.docs.length}`)
  console.log(`  A borrar (dateKey < ${CUTOFF}):  ${toDelete.length}`)
  console.log(`  A conservar (>= ${CUTOFF}):      ${toKeep}\n`)

  if (toDelete.length === 0) {
    console.log('Nada que borrar.')
  } else {
    let totalSubDocs = 0
    for (let i = 0; i < toDelete.length; i++) {
      const doc = toDelete[i]
      const { subs, subDeleted } = await deleteSummaryAndSubcollections(doc)
      totalSubDocs += subDeleted
      const tag = DRY_RUN ? '[DRY RUN]' : '✓'
      process.stdout.write(`[${i + 1}/${toDelete.length}] ${doc.id}  →  ${subs} subs, ${subDeleted} sub-docs ${tag}\n`)
    }
    console.log(`\nTotal sub-docs ${DRY_RUN ? 'detectados' : 'borrados'}: ${totalSubDocs.toLocaleString('es-CL')}`)
    console.log(`Total summaries ${DRY_RUN ? 'a borrar' : 'borrados'}: ${toDelete.length}\n`)
  }

  // 2. Shoplogix shifts
  console.log('─── SHOPLOGIX ───')
  const slxRef = db.collection('shoplogix').doc('chonchi').collection('shifts')
  const slxSnap = await slxRef.get()
  const slxToDelete = slxSnap.docs.filter((d) => {
    const k = d.data().dateKey || d.id.split('_')[0]
    return k < CUTOFF
  })
  console.log(`shoplogix/chonchi/shifts totales: ${slxSnap.docs.length}`)
  console.log(`  A borrar:       ${slxToDelete.length}`)
  console.log(`  A conservar:    ${slxSnap.docs.length - slxToDelete.length}\n`)

  let slxSubDeleted = 0
  for (let i = 0; i < slxToDelete.length; i++) {
    const doc = slxToDelete[i]
    const subs = await doc.ref.listCollections()
    for (const sub of subs) {
      const cnt = await deleteCollectionRecursive(sub, `  ${doc.id}/${sub.id}`)
      slxSubDeleted += cnt
    }
    if (!DRY_RUN) await doc.ref.delete()
    const tag = DRY_RUN ? '[DRY RUN]' : '✓'
    process.stdout.write(`[${i + 1}/${slxToDelete.length}] shoplogix/${doc.id}  →  ${subs.length} subs ${tag}\n`)
  }
  console.log(`\nShoplogix sub-docs ${DRY_RUN ? 'detectados' : 'borrados'}: ${slxSubDeleted.toLocaleString('es-CL')}\n`)

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log(`✅ ${DRY_RUN ? 'Dry-run completo' : 'Reset completo'}.`)
  console.log(`Conservados: ${toKeep} graderDailySummaries con dateKey >= ${CUTOFF}.`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

main().then(() => process.exit(0)).catch((e) => { console.error('ERROR:', e); process.exit(1) })
