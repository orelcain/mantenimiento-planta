/**
 * Sonda: lista shifts SLX Yal de los últimos 5 días + cuenta machines.
 * Investiga: 7-may turno día / 9-may "10 piezas" / 8-may A0% eviscerador 1
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

async function main() {
  console.log('=== shoplogix/yal/shifts ===\n')
  const shiftsRef = db.collection('shoplogix').doc('yal').collection('shifts')
  const allSnap = await shiftsRef
    .where(admin.firestore.FieldPath.documentId(), '>=', '2026-05-01')
    .where(admin.firestore.FieldPath.documentId(), '<=', '2026-05-15')
    .get()
  console.log(`Total shifts en yal: ${allSnap.size}`)
  console.log(`Últimos 20:`)
  const sorted = allSnap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .filter(x => x.id >= '2026-05-01')
    .sort((a, b) => a.id.localeCompare(b.id))
  for (const { id, data } of sorted) {
    const machines = await shiftsRef.doc(id).collection('machines').get()
    const machineSummary = machines.docs.map(m => {
      const d = m.data()
      const cycles = d.intervals?.reduce((a, x) => a + (x.cycles || 0), 0) ?? 0
      return `${d.machineName ?? m.id}=${cycles}`
    }).join(' · ')
    console.log(`  ${id.padEnd(35)} machines=${machines.size} ${machineSummary}`)
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
