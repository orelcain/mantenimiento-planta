/**
 * Distribución de `reason` × `type` en states Shoplogix del mes en curso.
 * Sirve para decidir qué reasons cuentan como "avería" en MTTR/MTBF.
 *
 * Uso: node scripts/audit-shoplogix-reasons.js [plant] [yyyy-mm]
 *   plant = yal | chonchi (default yal)
 *   yyyy-mm = mes a auditar (default = mes actual del sistema)
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const plant = process.argv[2] || 'yal'
const now = new Date()
const defaultMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
const month = process.argv[3] || defaultMonth

function fmtHM(sec) {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

(async () => {
  const shifts = await db.collection('shoplogix').doc(plant).collection('shifts').get()
  // Bucket por reason+type → { totalSec, count, samplesPerMachine }
  const bucket = new Map()
  let machinesProcessed = 0

  for (const shiftDoc of shifts.docs) {
    if (!shiftDoc.id.startsWith(month)) continue
    const machinesSnap = await db
      .collection('shoplogix').doc(plant)
      .collection('shifts').doc(shiftDoc.id)
      .collection('machines').get()
    for (const mDoc of machinesSnap.docs) {
      machinesProcessed++
      const states = mDoc.data().states || []
      for (const s of states) {
        if (s.type === 'uptime') continue
        const reason = (s.reason || '').trim() || `(sin reason / ${s.name || 'sin name'})`
        const key = `${s.type}::${reason}`
        if (!bucket.has(key)) bucket.set(key, { type: s.type, reason, totalSec: 0, count: 0, name: s.name })
        const b = bucket.get(key)
        b.totalSec += (s.durationSec || 0)
        b.count += 1
      }
    }
  }

  console.log(`\nPlanta: ${plant}   Mes: ${month}   Docs máquina procesados: ${machinesProcessed}\n`)
  const rows = [...bucket.values()].sort((a, b) => b.totalSec - a.totalSec)
  // Pretty print
  const w1 = 12, w2 = 38, w3 = 10, w4 = 8
  console.log('TYPE        '.padEnd(w1) + 'REASON'.padEnd(w2) + 'DURACION'.padStart(w3) + 'COUNT'.padStart(w4))
  console.log('─'.repeat(w1 + w2 + w3 + w4))
  for (const r of rows) {
    const t = r.type.padEnd(w1)
    const reason = (r.reason.length > w2 - 1 ? r.reason.slice(0, w2 - 3) + '...' : r.reason).padEnd(w2)
    const dur = fmtHM(r.totalSec).padStart(w3)
    const cnt = String(r.count).padStart(w4)
    console.log(`${t}${reason}${dur}${cnt}`)
  }

  // Resumen por type
  console.log('\nRESUMEN POR TYPE:')
  const byType = new Map()
  for (const r of rows) {
    if (!byType.has(r.type)) byType.set(r.type, { totalSec: 0, count: 0 })
    byType.get(r.type).totalSec += r.totalSec
    byType.get(r.type).count += r.count
  }
  for (const [t, v] of [...byType.entries()].sort((a, b) => b[1].totalSec - a[1].totalSec)) {
    console.log(`  ${t.padEnd(12)} ${fmtHM(v.totalSec).padStart(10)}  (${v.count} states)`)
  }
  process.exit(0)
})().catch(e => { console.error(e); process.exit(1) })
