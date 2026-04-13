/**
 * Inspecciona summaries del Grader cerca de 2026-02-06 y todas las del 2026
 * para entender de dónde salieron los registros.
 */
const admin = require('firebase-admin')
const sa = require('../serviceAccountKey.json')

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(sa),
    storageBucket: `${sa.project_id}.appspot.com`,
  })
}

const db = admin.firestore()

async function main() {
  const snap = await db.collection('graderDailySummaries').get()
  console.log(`Total summaries: ${snap.size}\n`)

  const all = snap.docs.map((d) => d.data())

  // Agrupar por año-mes
  const byMonth = {}
  for (const s of all) {
    const ym = (s.dateKey || '').slice(0, 7)
    if (!byMonth[ym]) byMonth[ym] = []
    byMonth[ym].push(s)
  }

  console.log('=== SUMMARIES POR MES ===\n')
  Object.keys(byMonth).sort().forEach((ym) => {
    const list = byMonth[ym]
    const totalPieces = list.reduce((s, x) => s + (x.totalPieces || 0), 0)
    console.log(`${ym}: ${list.length} summaries, ${totalPieces.toLocaleString('es-CL')} piezas`)
  })

  console.log('\n=== TOP 10 SUMMARIES POR totalPieces ===\n')
  const sorted = [...all].sort((a, b) => (b.totalPieces || 0) - (a.totalPieces || 0))
  sorted.slice(0, 10).forEach((s, i) => {
    console.log(`[${i + 1}] ${s.dateKey} ${s.shiftId} | ${s.totalPieces?.toLocaleString('es-CL')} piezas | P0=${s.pointZeroPct}% | dur=${s.durationMinutes}min`)
    console.log(`    startAt: ${s.startAt} endAt: ${s.endAt}`)
  })

  console.log('\n=== SUMMARIES con durationMinutes > 1440 (>24h, anómalos) ===\n')
  const anomalous = all.filter((s) => s.durationMinutes != null && s.durationMinutes > 1440)
  console.log(`${anomalous.length} encontrados\n`)
  anomalous.forEach((s, i) => {
    console.log(`[${i + 1}] ${s.dateKey} ${s.shiftId} | ${s.totalPieces?.toLocaleString('es-CL')} piezas | dur=${s.durationMinutes}min (${(s.durationMinutes / 60).toFixed(1)}h)`)
    console.log(`    startAt: ${s.startAt} endAt: ${s.endAt}`)
  })

  console.log('\n=== SUMMARIES con totalPieces > 30000 (sospechoso, turno normal ~15-25k) ===\n')
  const huge = all.filter((s) => (s.totalPieces || 0) > 30000)
  console.log(`${huge.length} encontrados\n`)
  huge.forEach((s, i) => {
    console.log(`[${i + 1}] ${s.dateKey} ${s.shiftId} | ${s.totalPieces?.toLocaleString('es-CL')} piezas | dur=${s.durationMinutes}min`)
  })

  console.log('\n=== SUMMARIES alrededor de 2026-02-06 ===\n')
  const nearFeb6 = all.filter((s) => s.dateKey >= '2026-02-01' && s.dateKey <= '2026-02-10').sort((a, b) => (a.dateKey + a.shiftId).localeCompare(b.dateKey + b.shiftId))
  nearFeb6.forEach((s) => {
    console.log(`${s.dateKey} ${s.shiftId} | ${s.totalPieces?.toLocaleString('es-CL')} pz | P0=${s.pointZeroPct}% | dur=${s.durationMinutes}min`)
  })
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('ERROR:', err)
    process.exit(1)
  })
