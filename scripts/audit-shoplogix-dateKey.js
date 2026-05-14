/**
 * Auditoría post-deploy 2026-05-13: verificar que `shoplogix/{plant}/shifts/{docId}`
 * tiene dateKey coherente con el día calendario de `scheduledStart`.
 *
 * El docId es `${dateKey}__${shiftId}`. Tras el fix del CF (commit 824495a4)
 * el dateKey del doc debe coincidir con el día (local) de scheduledStart.
 *
 * Uso: node scripts/audit-shoplogix-dateKey.js
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

async function auditPlant(plant) {
  const snap = await db.collection('shoplogix').doc(plant).collection('shifts').get()
  let mismatches = 0
  let noStart = 0
  const samples = []
  snap.forEach(d => {
    const data = d.data()
    const docId = d.id
    const dateKeyFromId = docId.slice(0, 10)
    const ts = data.scheduledStart
    let startDate
    if (ts && typeof ts.toDate === 'function') startDate = ts.toDate()
    else if (ts && ts._seconds) startDate = new Date(ts._seconds * 1000)
    else if (ts instanceof Date) startDate = ts
    else { noStart++; return }
    // El CF usa UTC (ver functions/shoplogix/sync.js → shiftDateKeyFromStart)
    const y  = startDate.getUTCFullYear()
    const m  = String(startDate.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(startDate.getUTCDate()).padStart(2, '0')
    const startDateKey = `${y}-${m}-${dd}`
    if (startDateKey !== dateKeyFromId) {
      mismatches++
      if (samples.length < 8) {
        samples.push({ docId, scheduledStart: startDate.toISOString(), expectedDateKey: startDateKey })
      }
    }
  })
  console.log(`[${plant}] total=${snap.size}  mismatches=${mismatches}  sinScheduledStart=${noStart}`)
  if (samples.length) console.log('  samples:', JSON.stringify(samples, null, 2))
}

(async () => {
  for (const p of ['yal', 'chonchi']) await auditPlant(p)
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
