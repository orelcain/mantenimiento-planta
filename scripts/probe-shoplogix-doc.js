/**
 * Sonda: imprime la estructura de UN doc Shoplogix para confirmar field names.
 * Uso:  node scripts/probe-shoplogix-doc.js 2026-02-14 "Turno día"
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')
if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(sa) })
const db = admin.firestore()

const dateKey = process.argv[2] || '2026-02-14'
const shiftId = process.argv[3] || 'Turno día'
const docId = `${dateKey}_${shiftId}`

async function main() {
  const machinesRef = db.collection('shoplogix').doc('chonchi').collection('shifts').doc(docId).collection('machines')
  const snap = await machinesRef.get()
  console.log(`shoplogix/chonchi/shifts/${docId}/machines  →  ${snap.size} docs\n`)
  if (snap.size === 0) {
    console.log('Sin docs. Probando estructuras alternativas...')
    const root = await db.collection('shoplogix').doc('chonchi').get()
    console.log('shoplogix/chonchi exists?', root.exists)
    const shiftsSnap = await db.collection('shoplogix').doc('chonchi').collection('shifts').limit(3).get()
    console.log(`shoplogix/chonchi/shifts top 3 ids:`, shiftsSnap.docs.map(d => d.id))
    return
  }
  const fmt = (sec) => sec ? new Date(sec * 1000).toISOString() : '—'
  snap.forEach((doc) => {
    const d = doc.data()
    console.log(`─── ${doc.id} ───`)
    console.log(`  dateKey:       ${d.dateKey}`)
    console.log(`  shiftId:       ${d.shiftId}`)
    console.log(`  shiftStart:    ${fmt(d.shiftStart?._seconds)}`)
    console.log(`  shiftEnd:      ${fmt(d.shiftEnd?._seconds)}`)
    console.log(`  syncedAt:      ${fmt(d.syncedAt?._seconds)}`)
    console.log(`  totalPieces:   ${d.totalPieces}`)
    console.log(`  totalCycles:   ${d.totalCycles}`)
    console.log(`  expected:      ${d.expectedTotalPieces}  cycles ${d.expectedTotalCycles}`)
    console.log(`  shiftRuntime:  ${d.shiftRuntime}  expectedRuntime: ${d.expectedRuntime}`)
    console.log(`  actualRuntime: ${d.actualRuntime}`)
    if (d.intervals?.length) {
      const f = d.intervals[0]
      const l = d.intervals[d.intervals.length - 1]
      console.log(`  intervals:     ${d.intervals.length}  first=${fmt(f.startAt?._seconds)}  last=${fmt(l.endAt?._seconds)}`)
      const totalCycles = d.intervals.reduce((a, x) => a + (x.cycles || 0), 0)
      console.log(`                 sum(cycles)=${totalCycles}  (vs totalPieces=${d.totalPieces})`)
    }
    if (d.states?.length) {
      const f = d.states[0]
      const l = d.states[d.states.length - 1]
      console.log(`  states:        ${d.states.length}  first=${fmt(f.startAt?._seconds)}  last=${fmt(l.endAt?._seconds)}`)
    }
    console.log()
  })
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
