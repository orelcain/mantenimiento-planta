/**
 * Sonda: cuenta graderDailySummaries por mes y total pieceRecords.
 * Para dimensionar el alcance del re-upload completo de temporada.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

async function main() {
  const snap = await db.collection('graderDailySummaries').get()
  const byMonth = new Map()
  let totalSummaries = 0
  let totalPieces = 0
  for (const doc of snap.docs) {
    const d = doc.data()
    const month = (d.dateKey || doc.id.split('__')[0]).slice(0, 7)
    if (!byMonth.has(month)) byMonth.set(month, { count: 0, pieces: 0 })
    const m = byMonth.get(month)
    m.count++
    m.pieces += d.totalPieces || 0
    totalSummaries++
    totalPieces += d.totalPieces || 0
  }
  const months = Array.from(byMonth.keys()).sort()
  console.log('\nMes       | Turnos | Piezas (totalPieces)')
  console.log('----------|--------|---------------------')
  for (const m of months) {
    const v = byMonth.get(m)
    console.log(`${m}   | ${String(v.count).padStart(6)} | ${v.pieces.toLocaleString('es-CL').padStart(20)}`)
  }
  console.log('----------|--------|---------------------')
  console.log(`TOTAL     | ${String(totalSummaries).padStart(6)} | ${totalPieces.toLocaleString('es-CL').padStart(20)}\n`)
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
