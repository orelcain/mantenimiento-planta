/**
 * Sonda: lista TODOS los summaries con prefix yal-eviscerado__ y los nuevos sin prefix.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

async function main() {
  const snap = await db.collection('graderDailySummaries').get()
  const yal = []
  const orphans = []
  for (const doc of snap.docs) {
    if (doc.id.startsWith('yal-eviscerado__')) {
      yal.push({ id: doc.id, data: doc.data() })
    } else if (/^\d{4}-\d{2}-\d{2}__Turno (noche|d[ií]a|[123])$/.test(doc.id)) {
      // ID sin prefix (chonchi default) — útil para detectar uploads recientes a Yal mal-routeados
      const d = doc.data()
      if (d.dateKey >= '2026-05-01') orphans.push({ id: doc.id, data: d })
    }
  }
  console.log(`\nDocs Yal: ${yal.length}\n`)
  for (const r of yal) {
    const ts = r.data.createdAt?.toDate?.()?.toISOString?.() || 'sin createdAt'
    console.log(`  ${r.id}  totalPieces=${r.data.totalPieces}  hasGate0=${r.data.hasGate0Data}  createdAt=${ts}`)
  }
  console.log(`\nDocs sin prefix con dateKey ≥ 2026-05-01: ${orphans.length}`)
  for (const r of orphans) {
    const ts = r.data.createdAt?.toDate?.()?.toISOString?.() || 'sin createdAt'
    console.log(`  ${r.id}  totalPieces=${r.data.totalPieces}  hasGate0=${r.data.hasGate0Data}  createdAt=${ts}`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
