/**
 * Sonda: lee los pieceRecords del summary Yal del 7-may para ver qué error
 * se guardó en cada gate=0.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

async function main() {
  const summaryId = 'yal-eviscerado__2026-05-07__Turno noche'
  const recordsRef = db.collection('graderDailySummaries').doc(summaryId).collection('pieceRecords')
  const snap = await recordsRef.where('gate', '==', 0).get()
  console.log(`\nPiezas gate=0 en ${summaryId}: ${snap.size}\n`)
  console.log('| ts                       | error                            | weightKg | weightPerPieceGrams |')
  console.log('|--------------------------|----------------------------------|----------|---------------------|')
  for (const doc of snap.docs) {
    const d = doc.data()
    const err = (d.error || '(sin error)').slice(0, 32)
    console.log(`| ${(d.ts || '').padEnd(24)} | ${err.padEnd(32)} | ${String(d.weightKg ?? '-').padStart(8)} | ${String(d.weightPerPieceGrams ?? '-').padStart(19)} |`)
  }

  // Stats por error
  const byError = new Map()
  for (const doc of snap.docs) {
    const e = doc.data().error || '(sin error)'
    byError.set(e, (byError.get(e) || 0) + 1)
  }
  console.log(`\nDistribución por error:\n`)
  for (const [e, n] of byError.entries()) console.log(`  ${n}× ${e}`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
