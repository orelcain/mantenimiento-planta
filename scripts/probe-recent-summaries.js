/**
 * Sonda: lista los `graderDailySummaries` modificados/creados hoy y ayer.
 * Sirve para encontrar uploads recientes que pudieron haber caído en la
 * planta equivocada por el bug del wizard sin `?linea=`.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

async function main() {
  const snap = await db.collection('graderDailySummaries').get()
  const cutoff = Date.now() - 48 * 3600 * 1000  // últimas 48h

  const recent = []
  for (const doc of snap.docs) {
    const d = doc.data()
    const updatedAt = d.updatedAt?.toMillis?.() || d.createdAt?.toMillis?.() || 0
    if (updatedAt < cutoff) continue
    recent.push({
      id: doc.id,
      dateKey: d.dateKey,
      shiftId: d.shiftId,
      plantLineId: d.plantLineId || '(sin)',
      totalPieces: d.totalPieces || 0,
      hasGate0: d.hasGate0Data || false,
      updatedAt: new Date(updatedAt).toISOString(),
    })
  }

  recent.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  console.log(`\nGraderDailySummaries actualizados en las últimas 48h: ${recent.length}\n`)
  console.log('| ID                                              | plantLineId       | totalPieces | hasGate0 | updatedAt            |')
  console.log('|-------------------------------------------------|-------------------|-------------|----------|----------------------|')
  for (const r of recent) {
    console.log(`| ${r.id.padEnd(48)} | ${r.plantLineId.padEnd(17)} | ${String(r.totalPieces).padStart(11)} | ${(r.hasGate0 ? 'sí' : 'no').padEnd(8)} | ${r.updatedAt} |`)
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
